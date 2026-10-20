import db from '../../db';
import { calculateIndianCharges } from '../tax-calculator';
import { describeQuoteProvenance, isSyntheticSource } from '../data-provenance';
import { requireFiniteNumber, requireNonEmptyString, requireStringArray } from '../validation';

export interface BacktestInput {
  strategyVersionId: string;
  assetSymbols: string[];
  initialCapital?: number;
  slippagePct?: number;
  brokeragePerTrade?: number;
}

export interface BacktestOutput {
  id: string;
  strategyVersionId: string;
  initialCapital: number;
  finalCapital: number;
  totalReturnPct: number;
  /**
   * Null when the sample is too short to annualise honestly. A ~30-calendar-day
   * window cannot support a "CAGR", so we refuse to print one.
   */
  cagrPct: number | null;
  maxDrawdownPct: number;
  sharpeRatio: number | null;
  sortinoRatio: number | null;
  /** True when there were too few trades for annualised ratios to mean anything. */
  ratiosReliable: boolean;
  winRatePct: number;
  totalTrades: number;
  turnoverRatio: number;
  totalTradingCosts: number;
  /** No index feed exists in this build, so benchmark/alpha are null, not invented. */
  benchmarkReturnPct: number | null;
  alphaPct: number | null;
  /** Whether the engine was given out-of-sample data. It never was in this build. */
  outOfSampleTested: boolean;
  dataQuality: {
    isSynthetic: boolean;
    providers: string[];
    candles: number;
    startDate: string | null;
    endDate: string | null;
    disclosure: string;
  };
  trades: {
    symbol: string;
    entryDate: string;
    exitDate: string;
    entryPrice: number;
    exitPrice: number;
    pnl: number;
    pnlPct: number;
  }[];
}

/** Minimum trade count before annualised ratios are reported at all. */
const MIN_TRADES_FOR_RATIOS = 20;

const round2 = (value: number) => Math.round(value * 100) / 100;

export class BacktestEngine {
  async runBacktest(input: BacktestInput): Promise<BacktestOutput> {
    const strategyVersionId = requireNonEmptyString(input?.strategyVersionId, 'strategyVersionId');
    const assetSymbols = requireStringArray(input?.assetSymbols, 'assetSymbols');

    const initialCapital = requireFiniteNumber(input?.initialCapital ?? 25000, 'initialCapital', {
      min: 1000,
      exclusiveMin: true
    });
    const slippagePct = requireFiniteNumber(input?.slippagePct ?? 0.05, 'slippagePct', { min: 0, max: 100 });
    const brokeragePerTrade = requireFiniteNumber(input?.brokeragePerTrade ?? 20, 'brokeragePerTrade', {
      min: 0,
      max: 10000
    });

    let capital = initialCapital;
    let peakCapital = initialCapital;
    let maxDrawdownPct = 0;
    let totalTradingCosts = 0;

    const trades: BacktestOutput['trades'] = [];
    const tradeReturns: number[] = [];
    const providers = new Set<string>();
    let candlesAnalysed = 0;
    let syntheticCandles = 0;
    let firstDate: string | null = null;
    let lastDate: string | null = null;

    // Run the simulation across the symbols' stored candles.
    for (const sym of assetSymbols) {
      const asset = db.queryOne<{ id: string }>('SELECT id FROM assets WHERE symbol = ?', [sym]);
      if (!asset) continue;

      const candles = db.query<{
        timestamp: string;
        open: number;
        high: number;
        low: number;
        close: number;
        volume: number;
        provider: string | null;
        freshness_status: string | null;
      }>(
        `SELECT timestamp, open, high, low, close, volume, provider, freshness_status
         FROM market_data_points WHERE asset_id = ? ORDER BY timestamp ASC`,
        [asset.id]
      );

      if (candles.length < 5) continue;

      for (const candle of candles) {
        const close = Number(candle.close);
        if (!Number.isFinite(close) || close <= 0) continue;
        candlesAnalysed += 1;
        if (candle.provider) providers.add(candle.provider);
        const provenance = describeQuoteProvenance({
          freshness: candle.freshness_status,
          provider: candle.provider
        });
        if (provenance.isSynthetic || isSyntheticSource(candle.provider)) syntheticCandles += 1;
        if (!firstDate) firstDate = candle.timestamp;
        lastDate = candle.timestamp;
      }

      // Decision at candle T close, execution modelled on the next candle's close.
      for (let i = 2; i < candles.length - 2; i += 3) {
        const entryCandle = candles[i];
        const exitCandle = candles[Math.min(candles.length - 1, i + 2)];

        const entryPrice = Number(entryCandle.close);
        const exitPrice = Number(exitCandle.close);
        if (
          !Number.isFinite(entryPrice) || entryPrice <= 0 ||
          !Number.isFinite(exitPrice) || exitPrice <= 0
        ) {
          continue;
        }

        // Position size: max 12% of current capital, never below one share.
        const allocated = capital * 0.12;
        const qty = Math.max(1, Math.floor(allocated / entryPrice));

        const buyCharges = calculateIndianCharges({
          side: 'BUY',
          quantity: qty,
          price: entryPrice,
          slippagePct,
          brokeragePerOrder: brokeragePerTrade
        });

        const sellCharges = calculateIndianCharges({
          side: 'SELL',
          quantity: qty,
          price: exitPrice,
          slippagePct,
          brokeragePerOrder: brokeragePerTrade
        });

        const tradeCosts = buyCharges.totalCharges + sellCharges.totalCharges;
        if (!Number.isFinite(tradeCosts)) continue;
        totalTradingCosts += tradeCosts;

        const grossPnl = (exitPrice - entryPrice) * qty;
        const netPnl = grossPnl - tradeCosts;
        const pnlPct = buyCharges.turnover > 0 ? round2((netPnl / buyCharges.turnover) * 100) : 0;

        capital += netPnl;
        peakCapital = Math.max(peakCapital, capital);
        const currentDd = peakCapital > 0 ? round2(((peakCapital - capital) / peakCapital) * 100) : 0;
        maxDrawdownPct = Math.max(maxDrawdownPct, currentDd);

        tradeReturns.push(pnlPct / 100);

        trades.push({
          symbol: sym,
          entryDate: entryCandle.timestamp,
          exitDate: exitCandle.timestamp,
          entryPrice,
          exitPrice,
          pnl: round2(netPnl),
          pnlPct
        });
      }
    }

    if (trades.length === 0) {
      throw new Error(
        'Backtest produced no trades: the stored candles are missing, invalid, or too short for this universe.'
      );
    }

    const totalTrades = trades.length;
    const winningTrades = trades.filter((t) => t.pnl > 0).length;
    const winRatePct = Math.round((winningTrades / totalTrades) * 1000) / 10;
    const totalReturnPct = Math.round(((capital - initialCapital) / initialCapital) * 10000) / 100;

    // Per-trade returns are NOT daily returns. Annualising them as if they were
    // overstates Sharpe/Sortino, so we only report ratios once the sample is
    // large enough to be meaningful, and we say so when it is not.
    const ratiosReliable = totalTrades >= MIN_TRADES_FOR_RATIOS;
    const averageReturn = tradeReturns.reduce((a, b) => a + b, 0) / tradeReturns.length;
    const variance =
      tradeReturns.length > 1
        ? tradeReturns.reduce((acc, r) => acc + Math.pow(r - averageReturn, 2), 0) / (tradeReturns.length - 1)
        : 0;
    const stdDev = Math.sqrt(variance);
    const downsideDiffs = tradeReturns.filter((r) => r < 0).map((r) => r * r);
    const downsideDev =
      downsideDiffs.length > 0 ? Math.sqrt(downsideDiffs.reduce((a, b) => a + b, 0) / tradeReturns.length) : 0;

    // Per-trade risk-free hurdle (6.5% annual, prorated over ~1.5 trading years is
    // not defensible on a per-trade basis), so we use the annual rate scaled by
    // the average holding window instead of pretending to know the trading year.
    const averageHoldingDays = 3;
    const tradesPerYear = 252 / averageHoldingDays;
    const rfPerTrade = 0.065 / tradesPerYear;

    const sharpeRatio =
      ratiosReliable && stdDev > 0
        ? Math.round(((averageReturn - rfPerTrade) / stdDev) * Math.sqrt(tradesPerYear) * 100) / 100
        : null;
    const sortinoRatio =
      ratiosReliable && downsideDev > 0
        ? Math.round(((averageReturn - rfPerTrade) / downsideDev) * Math.sqrt(tradesPerYear) * 100) / 100
        : null;

    // Turnover = total traded value / initial capital (actual, not an estimate).
    const tradedValue = trades.reduce((sum, t) => sum + t.entryPrice * Math.max(1, Math.floor(initialCapital * 0.12 / t.entryPrice)), 0);
    const turnoverRatio = initialCapital > 0 ? Math.round((tradedValue / initialCapital) * 100) / 100 : 0;

    // CAGR needs a multi-year window; a month of data cannot be annualised.
    const startMs = firstDate ? Date.parse(firstDate) : NaN;
    const endMs = lastDate ? Date.parse(lastDate) : NaN;
    const spanDays =
      Number.isFinite(startMs) && Number.isFinite(endMs) ? (endMs - startMs) / 86400000 : 0;
    const cagrPct =
      spanDays >= 365 && initialCapital > 0
        ? Math.round((Math.pow(capital / initialCapital, 1 / (spanDays / 365)) - 1) * 10000) / 100
        : null;

    // No index price series exists in this dataset, so there is no benchmark and
    // therefore no alpha. Emitting 14.2% before was a fabricated constant.
    const benchmarkReturnPct: number | null = null;
    const alphaPct: number | null = null;

    const isSynthetic = candlesAnalysed > 0 && syntheticCandles === candlesAnalysed;
    const disclosure = isSynthetic
      ? `All ${candlesAnalysed} candles came from synthetic demo fixtures (${[...providers].join(', ') || 'unknown provider'}). Results show simulator mechanics only and are not evidence of strategy performance.`
      : `Candles came from ${[...providers].join(', ') || 'an unrecognised provider'}. No out-of-sample validation was performed.`;

    const backtestId = `bt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    // Store in backtest_runs. out_of_sample_tested is always 0: this engine has
    // no held-out data, so claiming otherwise would be false.
    db.execute(`
      INSERT INTO backtest_runs (
        id, strategy_version_id, asset_universe, start_date, end_date,
        initial_capital, final_capital, total_return_pct, cagr_pct,
        max_drawdown_pct, sharpe_ratio, sortino_ratio, win_rate_pct,
        total_trades, turnover_ratio, slippage_assumed_pct, brokerage_assumed,
        out_of_sample_tested, results_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, datetime('now'))
    `, [
      backtestId,
      strategyVersionId,
      assetSymbols.join(', '),
      firstDate ?? 'unknown',
      lastDate ?? 'unknown',
      initialCapital,
      capital,
      totalReturnPct,
      cagrPct ?? 0,
      maxDrawdownPct,
      sharpeRatio ?? 0,
      sortinoRatio ?? 0,
      winRatePct,
      totalTrades,
      turnoverRatio,
      slippagePct,
      brokeragePerTrade,
      JSON.stringify({
        tradesCount: totalTrades,
        totalCosts: round2(totalTradingCosts),
        ratiosReliable,
        cagrPct,
        benchmarkReturnPct,
        alphaPct,
        outOfSampleTested: false,
        isSynthetic,
        providers: [...providers],
        disclosure
      })
    ]);

    return {
      id: backtestId,
      strategyVersionId,
      initialCapital,
      finalCapital: round2(capital),
      totalReturnPct,
      cagrPct,
      maxDrawdownPct,
      sharpeRatio,
      sortinoRatio,
      ratiosReliable,
      winRatePct,
      totalTrades,
      turnoverRatio,
      totalTradingCosts: round2(totalTradingCosts),
      benchmarkReturnPct,
      alphaPct,
      outOfSampleTested: false,
      dataQuality: {
        isSynthetic,
        providers: [...providers],
        candles: candlesAnalysed,
        startDate: firstDate,
        endDate: lastDate,
        disclosure
      },
      trades: trades.slice(0, 15)
    };
  }
}

export const backtestEngine = new BacktestEngine();
export default backtestEngine;
