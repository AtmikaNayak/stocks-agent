import { describe, it, expect } from 'vitest';
import db from '../src/db';
import backtestEngine from '../src/lib/backtesting/engine';

const baseInput = {
  strategyVersionId: 'ver_strat_1_v12',
  assetSymbols: ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK'],
  initialCapital: 25000,
  slippagePct: 0.05,
  brokeragePerTrade: 20
};

describe('Backtest metrics are honest about what the data supports', () => {
  it('never reports a fabricated benchmark or alpha', async () => {
    const result = await backtestEngine.runBacktest(baseInput);
    expect(result.benchmarkReturnPct).toBeNull();
    expect(result.alphaPct).toBeNull();
  });

  it('withholds CAGR when the sample spans less than a year', async () => {
    const result = await backtestEngine.runBacktest(baseInput);
    const spanDays =
      (Date.parse(result.dataQuality.endDate!) - Date.parse(result.dataQuality.startDate!)) / 86400000;

    expect(spanDays).toBeLessThan(365);
    expect(result.cagrPct).toBeNull();
  });

  it('withholds Sharpe and Sortino until there are enough trades to annualise', async () => {
    const result = await backtestEngine.runBacktest(baseInput);
    if (result.totalTrades < 20) {
      expect(result.ratiosReliable).toBe(false);
      expect(result.sharpeRatio).toBeNull();
      expect(result.sortinoRatio).toBeNull();
    } else {
      expect(result.ratiosReliable).toBe(true);
      expect(typeof result.sharpeRatio).toBe('number');
    }
  });

  it('labels synthetic candle data and discloses it in plain words', async () => {
    const result = await backtestEngine.runBacktest(baseInput);
    expect(result.dataQuality.isSynthetic).toBe(true);
    expect(result.dataQuality.disclosure).toMatch(/synthetic demo fixtures/i);
    expect(result.dataQuality.disclosure).toMatch(/not evidence of strategy performance/i);
  });

  it('never claims out-of-sample validation', async () => {
    const result = await backtestEngine.runBacktest(baseInput);
    expect(result.outOfSampleTested).toBe(false);

    const stored = db.queryOne<{ out_of_sample_tested: number; results_json: string }>(
      'SELECT out_of_sample_tested, results_json FROM backtest_runs WHERE id = ?',
      [result.id]
    );
    expect(stored!.out_of_sample_tested).toBe(0);
    const parsed = JSON.parse(stored!.results_json);
    expect(parsed.outOfSampleTested).toBe(false);
    expect(parsed.benchmarkReturnPct).toBeNull();
  });

  it('records real start and end dates from the data instead of hardcoded dates', async () => {
    const result = await backtestEngine.runBacktest(baseInput);
    expect(result.dataQuality.startDate).toMatch(/^\d{4}-\d{2}-\d{2}/);
    expect(result.dataQuality.endDate).toMatch(/^\d{4}-\d{2}-\d{2}/);
    expect(result.dataQuality.startDate! <= result.dataQuality.endDate!).toBe(true);
    expect(result.dataQuality.candles).toBeGreaterThan(0);
  });

  it('computes turnover from actual traded value, not a fixed formula', async () => {
    const result = await backtestEngine.runBacktest(baseInput);
    expect(result.turnoverRatio).toBeGreaterThan(0);
    expect(Number.isFinite(result.turnoverRatio)).toBe(true);
  });
});

describe('Backtest input validation', () => {
  it('rejects an empty asset universe', async () => {
    await expect(backtestEngine.runBacktest({ ...baseInput, assetSymbols: [] })).rejects.toThrow(
      /assetSymbols/
    );
  });

  it('rejects a missing strategy id', async () => {
    await expect(backtestEngine.runBacktest({ ...baseInput, strategyVersionId: '  ' })).rejects.toThrow(
      /strategyVersionId/
    );
  });

  it('rejects non-positive or non-finite capital', async () => {
    await expect(backtestEngine.runBacktest({ ...baseInput, initialCapital: 0 })).rejects.toThrow(
      /initialCapital/
    );
    await expect(
      backtestEngine.runBacktest({ ...baseInput, initialCapital: Number.NaN })
    ).rejects.toThrow(/initialCapital/);
  });

  it('rejects negative slippage or brokerage', async () => {
    await expect(backtestEngine.runBacktest({ ...baseInput, slippagePct: -1 })).rejects.toThrow(
      /slippagePct/
    );
    await expect(
      backtestEngine.runBacktest({ ...baseInput, brokeragePerTrade: -20 })
    ).rejects.toThrow(/brokeragePerTrade/);
  });

  it('fails loudly when no usable candles exist rather than returning zeros', async () => {
    await expect(
      backtestEngine.runBacktest({ ...baseInput, assetSymbols: ['NOT_A_REAL_SYMBOL'] })
    ).rejects.toThrow(/no trades/i);
  });
});
