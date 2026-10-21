import db from '../../db';
import { calculateIndianCharges } from '../tax-calculator';
import { describeQuoteProvenance, isSyntheticSource } from '../data-provenance';
import {
  requireFiniteNumber,
  requireNonEmptyString,
  requireBoundedSymbolArray,
  ValidationError
} from '../validation';

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
    /** Candles rejected for malformed or non-positive values. Never repaired. */
    quarantinedCandles: number;
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

/** Explicit resource bounds. A caller cannot make the engine do unbounded work. */
export const MAX_SYMBOLS_PER_BACKTEST = 20;
export const MAX_CANDLES_PER_SYMBOL = 5_000;
export const MAX_TRADES = 5_000;
const MAX_INITIAL_CAPITAL = 100_000_000;
const MAX_SLIPPAGE_PCT = 5;
const MAX_BROKERAGE_PER_TRADE = 10_000;

/** One candle is valid only when every value is usable. Nothing is repaired. */
export function isUsableCandle(candle: {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp?: string;
}): boolean {
  const open = Number(candle.open);
  const high = Number(candle.high);
  const low = Number(candle.low);
  const close = Number(candle.close);
  const volume = Number(candle.volume);
  if (![open, high, low, close].every((value) => Number.isFinite(value) && value > 0)) return false;
  if (!Number.isFinite(volume) || volume < 0) return false;
  if (high + 0.01 < low) return false;
  if (high + 0.01 < Math.max(open, close)) return false;
  if (low - 0.01 > Math.min(open, close)) return false;
  if (candle.timestamp && !Number.isFinite(Date.parse(candle.timestamp))) return false;
  return true;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

export class BacktestEngine {
  async runBacktest(input: BacktestInput): Promise<BacktestOutput> {
    const strategyVersionId = requireNonEmptyString(input?.strategyVersionId, 'strategyVersionId');
    const assetSymbols = requireBoundedSymbolArray(input?.assetSymbols, 'assetSymbols', {
      maxItems: MAX_SYMBOLS_PER_BACKTEST
    });

    // The requested strategy version must exist; silently substituting the
    // default would report results for a strategy nobody asked for.
    const strategy = db.queryOne<{ id: string }>('SELECT id FROM strategy_versions WHERE id = ?', [
      strategyVersionId
    ]);
    if (!strategy) {
      throw new ValidationError(`Unknown strategy version: ${strategyVersionId}.`);
    }

    const initialCapital = requireFiniteNumber(input?.initialCapital ?? 25000, 'initialCapital', {
      min: 1000,
      exclusiveMin: true,
      max: MAX_INITIAL_CAPITAL
    });
    const slippagePct = requireFiniteNumber(input?.slippagePct ?? 0.05, 'slippagePct', {
      min: 0,
      max: MAX_SLIPPAGE_PCT
    });
    const brokeragePerTrade = requireFiniteNumber(input?.brokeragePerTrade ?? 20, 'brokeragePerTrade', {
      min: 0,
      max: MAX_BROKERAGE_PER_TRADE
    });

    // Unknown symbols are an input error, not something to skip quietly.
    const knownSymbols = new Set(
      db
        .query<{ symbol: string }>('SELECT symbol FROM assets')
        .map((row) => row.symbol.toUpperCase())
    );
    const unknown = assetSymbols.filter((symbol) => !knownSymbols.has(symbol));
    if (unknown.length > 0) {
      throw new ValidationError(`Unknown symbols: ${unknown.join(', ')}.`);
    }

    let capital = initialCapital;
    let peakCapital = initialCapital;
    let maxDrawdownPct = 0;
    let totalTradingCosts = 0;

    const trades: BacktestOutput['trades'] = [];
    const tradeReturns: number[] = [];
    const providers = new Set<string>();
    let candlesAnalysed = 0;
    let syntheticCandles = 0;
    let quarantinedCandles = 0;
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
         FROM market_data_points WHERE asset_id = ? ORDER BY timestamp ASC LIMIT ?`,
        [asset.id, MAX_CANDLES_PER_SYMBOL]
      );

      if (candles.length < 5) continue;

      const usable = candles.filter((candle) => {
        const ok = isUsableCandle(candle);
        if (!ok) quarantinedCandles += 1;
        return ok;
      });
      if (usable.length < 5) continue;

      for (const candle of usable) {
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

      // Decision is made from candle i (its close is the last information
      // available), but entry is modelled at the NEXT candle's close — trading
      // at the price you just used to decide would be look-ahead bias.
      for (let i = 2; i < usable.length - 4; i += 3) {
        if (trades.length >= MAX_TRADES) break;
        const decisionCandle = usable[i];
        const entryCandle = usable[i + 1];
        const exitCandle = usable[Math.min(usable.length - 1, i + 3)];

        // A decision that needs data beyond the candle must see only the past.
        if (Date.parse(decisionCandle.timestamp) >= Date.parse(entryCandle.timestamp)) {
          quarantinedCandles += 1;
          continue;
        }

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
    const quarantineNote = quarantinedCandles > 0
      ? ` ${quarantinedCandles} malformed candle(s) were quarantined and excluded rather than repaired.`
      : '';

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
        quarantinedCandles,
        disclosure: disclosure + quarantineNote
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
        quarantinedCandles,
        startDate: firstDate,
        endDate: lastDate,
        disclosure: disclosure + quarantineNote
      },
      trades: trades.slice(0, 15)
    };
  }
}

export const backtestEngine = new BacktestEngine();
export default backtestEngine;
