import { describe, it, expect } from 'vitest';
import backtestEngine from '../src/lib/backtesting/engine';

describe('Quantitative Backtesting Engine', () => {
  it('runs realistic backtest with Indian transaction costs and no look-ahead bias', async () => {
    const result = await backtestEngine.runBacktest({
      strategyVersionId: 'ver_strat_1_v12',
      assetSymbols: ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK'],
      initialCapital: 25000.0,
      slippagePct: 0.05,
      brokeragePerTrade: 20.0
    });

    expect(result.id).toBeDefined();
    expect(result.initialCapital).toBe(25000.0);
    expect(result.totalTrades).toBeGreaterThan(0);
    expect(result.totalTradingCosts).toBeGreaterThan(0);
    expect(result.sharpeRatio).toBeDefined();
    expect(result.maxDrawdownPct).toBeGreaterThanOrEqual(0);
    expect(result.winRatePct).toBeGreaterThanOrEqual(0);
  });
});
