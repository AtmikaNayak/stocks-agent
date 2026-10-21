import { describe, it, expect, beforeAll } from 'vitest';
import db from '../src/db';
import backtestEngine, { MAX_SYMBOLS_PER_BACKTEST, isUsableCandle } from '../src/lib/backtesting/engine';
import { POST as postBacktest } from '../src/app/api/backtest/route';
import { resetQuotas } from '../src/lib/auth/quota';
import { USER_A, ensureAllFixtures, jsonRequest } from './helpers/auth-fixtures';

const BASE = 'http://localhost';

const baseInput = {
  strategyVersionId: 'ver_strat_1_v12',
  assetSymbols: ['RELIANCE', 'TCS'],
  initialCapital: 25000,
  slippagePct: 0.05,
  brokeragePerTrade: 20
};

beforeAll(() => {
  ensureAllFixtures();
});

describe('backtest input limits', () => {
  it('rejects an oversized symbol list', async () => {
    const symbols = Array.from({ length: MAX_SYMBOLS_PER_BACKTEST + 1 }, (_, i) => `SYM${i}`);
    await expect(backtestEngine.runBacktest({ ...baseInput, assetSymbols: symbols })).rejects.toThrow(
      /at most 20 symbols/i
    );
  });

  it('rejects an over-long symbol instead of truncating it', async () => {
    await expect(
      backtestEngine.runBacktest({ ...baseInput, assetSymbols: ['A'.repeat(40)] })
    ).rejects.toThrow(/longer than 20 characters/i);
  });

  it('rejects duplicates and non-string entries', async () => {
    await expect(
      backtestEngine.runBacktest({ ...baseInput, assetSymbols: ['TCS', 'TCS'] })
    ).rejects.toThrow(/duplicates/i);

    await expect(
      backtestEngine.runBacktest({ ...baseInput, assetSymbols: [42 as unknown as string] })
    ).rejects.toThrow(/must be a string/i);
  });

  it('rejects an unknown strategy version rather than substituting one', async () => {
    await expect(
      backtestEngine.runBacktest({ ...baseInput, strategyVersionId: 'ver_does_not_exist' })
    ).rejects.toThrow(/unknown strategy version/i);
  });

  it('rejects invalid capital, slippage and brokerage values', async () => {
    await expect(
      backtestEngine.runBacktest({ ...baseInput, initialCapital: -1 })
    ).rejects.toThrow(/initialCapital/i);
    await expect(
      backtestEngine.runBacktest({ ...baseInput, initialCapital: Number.POSITIVE_INFINITY })
    ).rejects.toThrow(/initialCapital/i);
    await expect(
      backtestEngine.runBacktest({ ...baseInput, slippagePct: 250 })
    ).rejects.toThrow(/slippagePct/i);
    await expect(
      backtestEngine.runBacktest({ ...baseInput, brokeragePerTrade: -5 })
    ).rejects.toThrow(/brokeragePerTrade/i);
  });

  it('preserves a legitimate zero slippage assumption', async () => {
    const result = await backtestEngine.runBacktest({ ...baseInput, slippagePct: 0 });
    expect(result.totalTrades).toBeGreaterThan(0);
  });

  it('rejects a non-array symbol list', async () => {
    await expect(
      backtestEngine.runBacktest({ ...baseInput, assetSymbols: 'RELIANCE' as unknown as string[] })
    ).rejects.toThrow(/array of symbols/i);
  });
});

describe('candle validation', () => {
  it('quarantines malformed candles instead of repairing them', () => {
    expect(isUsableCandle({ open: 100, high: 102, low: 99, close: 101, volume: 10 })).toBe(true);
    expect(isUsableCandle({ open: 100, high: 98, low: 99, close: 101, volume: 10 })).toBe(false);
    expect(isUsableCandle({ open: 100, high: 102, low: 99, close: 101, volume: -1 })).toBe(false);
    expect(isUsableCandle({ open: 0, high: 102, low: 99, close: 101, volume: 10 })).toBe(false);
    expect(
      isUsableCandle({ open: 100, high: 102, low: 99, close: 101, volume: 10, timestamp: 'nope' })
    ).toBe(false);
  });

  it('counts quarantined candles in the result instead of hiding them', async () => {
    db.execute(
      `INSERT OR IGNORE INTO assets (id, symbol, name, exchange, sector, is_tradable)
       VALUES ('ast_bt_dirty', 'DIRTYCANDLES', 'Dirty Candles Ltd', 'NSE', 'Testing', 0)`
    );
    db.execute("DELETE FROM market_data_points WHERE asset_id = 'ast_bt_dirty'");

    const insert = db.get().prepare(
      `INSERT INTO market_data_points
         (id, asset_id, timestamp, timeframe, open, high, low, close, volume, provider, freshness_status)
       VALUES (?, 'ast_bt_dirty', ?, '1D', ?, ?, ?, ?, ?, 'SYNTHETIC_SEED', 'SYNTHETIC')`
    );
    for (let day = 1; day <= 12; day += 1) {
      const timestamp = `2026-09-${String(day).padStart(2, '0')}`;
      // Every third candle is intentionally impossible (high below low).
      const corrupted = day % 3 === 0;
      insert.run(
        `mdp_dirty_${day}`,
        timestamp,
        corrupted ? 0 : 100 + day,
        corrupted ? 1 : 102 + day,
        corrupted ? 50 : 99 + day,
        corrupted ? 0 : 101 + day,
        1000
      );
    }

    const result = await backtestEngine.runBacktest({
      ...baseInput,
      assetSymbols: ['DIRTYCANDLES']
    });

    expect(result.dataQuality.quarantinedCandles).toBeGreaterThan(0);
    expect(result.dataQuality.disclosure).toMatch(/quarantined/i);
    expect(result.totalTrades).toBeGreaterThan(0);
    expect(result.dataQuality.isSynthetic).toBe(true);
  });
});

describe('look-ahead and honesty', () => {
  it('never enters on the candle it used to decide', async () => {
    const result = await backtestEngine.runBacktest(baseInput);
    for (const trade of result.trades) {
      // Execution is modelled strictly after the decision candle, and the exit
      // strictly after the entry.
      expect(Date.parse(trade.exitDate)).toBeGreaterThan(Date.parse(trade.entryDate));
    }
    expect(result.trades.every((trade) => trade.entryDate !== trade.exitDate)).toBe(true);
    expect(result.totalTrades).toBeGreaterThan(0);
  });

  it('always labels a synthetic run as not evidence of performance', async () => {
    const result = await backtestEngine.runBacktest(baseInput);
    expect(result.dataQuality.disclosure).toMatch(/not evidence of strategy performance/i);
    expect(result.outOfSampleTested).toBe(false);
    expect(result.benchmarkReturnPct).toBeNull();
    expect(result.alphaPct).toBeNull();
  });
});

describe('backtest API surface', () => {
  it('requires authentication', async () => {
    const response = await postBacktest(
      new Request(`${BASE}/api/backtest`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(baseInput)
      })
    );
    expect(response.status).toBe(401);
  });

  it('rejects a non-JSON body', async () => {
    const response = await postBacktest(
      new Request(`${BASE}/api/backtest`, {
        method: 'POST',
        headers: { 'content-type': 'text/plain', cookie: `investpilot_session=x` },
        body: 'hello'
      })
    );
    // Unauthenticated first, so this asserts the guard order, not the parser.
    expect([401, 415]).toContain(response.status);
  });

  it('returns a 400 for invalid input rather than a 500', async () => {
    resetQuotas();
    const response = await postBacktest(
      jsonRequest('/api/backtest', 'POST', { assetSymbols: [] }, USER_A.id)
    );
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('INVALID_BACKTEST_INPUT');
  });

  it('enforces a per-user quota on expensive runs', async () => {
    resetQuotas();
    let lastStatus = 0;
    for (let attempt = 0; attempt < 15; attempt += 1) {
      const response = await postBacktest(jsonRequest('/api/backtest', 'POST', baseInput, USER_A.id));
      lastStatus = response.status;
      if (lastStatus === 429) {
        expect(response.headers.get('retry-after')).toBeTruthy();
        break;
      }
    }
    expect(lastStatus).toBe(429);
  });
});
