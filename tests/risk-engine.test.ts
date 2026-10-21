import { describe, it, expect } from 'vitest';
import db from '../src/db';
import { evaluateProposalRisk } from '../src/lib/risk-engine';
import { TRADING_NOW } from './helpers/market-clock';

describe('Deterministic Risk Management Engine', () => {
  it('blocks order that exceeds single stock position concentration (15%)', () => {
    // Virtual portfolio has ₹25,000 total value.
    // 15% is ₹3,750 max. An order of ₹10,000 should fail concentration check.
    const result = evaluateProposalRisk({
      portfolioId: 'port_virt_01',
      assetId: 'ast_reliance',
      side: 'BUY',
      quantity: 5,
      price: 2942.50, // ~₹14,712 > 15% limit
      now: TRADING_NOW
    });

    expect(result.passed).toBe(false);
    expect(result.reasons.some(r => r.includes('concentration'))).toBe(true);
  });

  it('allows safe conservative order within position and cash limits', () => {
    // 1 share of TATAMOTORS at ₹924 is ~3.7% of ₹25,000 -> well within 15%
    const result = evaluateProposalRisk({
      portfolioId: 'port_virt_01',
      assetId: 'ast_tatamotors',
      side: 'BUY',
      quantity: 1,
      price: 924.10,
      now: TRADING_NOW
    });

    expect(result.passed).toBe(true);
    expect(result.reasons.length).toBe(0);
    expect(result.calculatedPositionPct).toBeLessThanOrEqual(15.0);
  });

  it('strictly blocks real money execution when broker is disconnected', () => {
    // Real portfolio has broker disconnected
    const result = evaluateProposalRisk({
      portfolioId: 'port_real_01',
      assetId: 'ast_reliance',
      side: 'BUY',
      quantity: 1,
      price: 2942.50,
      now: TRADING_NOW
    });

    expect(result.passed).toBe(false);
    expect(result.reasons.some(r => r.includes('broker') || r.includes('Broker'))).toBe(true);
  });

  it('immediately blocks all orders when emergency stop is triggered', () => {
    // Enable emergency stop
    db.execute('UPDATE user_settings SET emergency_stop_enabled = 1, emergency_stop_reason = ? WHERE user_id = ?', ['Manual drill test', 'usr_pilot_01']);

    const result = evaluateProposalRisk({
      portfolioId: 'port_virt_01',
      assetId: 'ast_tatamotors',
      side: 'BUY',
      quantity: 1,
      price: 924.10,
      now: TRADING_NOW
    });

    expect(result.passed).toBe(false);
    expect(result.reasons.some(r => r.includes('Emergency stop'))).toBe(true);

    // Revert emergency stop for subsequent tests
    db.execute('UPDATE user_settings SET emergency_stop_enabled = 0, emergency_stop_reason = NULL WHERE user_id = ?', ['usr_pilot_01']);
  });
});

/**
 * Maximum drawdown is the one control that cannot always be evaluated: it needs
 * at least two recorded NAV snapshots. These tests pin both halves of that
 * contract — it must block when it can measure a breach, and it must *say* it
 * cannot measure rather than reporting a pass.
 */
describe('maximum drawdown: measured, or explicitly unavailable', () => {
  let counter = 0;

  function createPortfolio(drawdownLimitPct: number) {
    counter += 1;
    const suffix = `${Date.now().toString(36)}_${counter}`;
    const userId = `usr_dd_${suffix}`;
    const portfolioId = `port_dd_${suffix}`;

    db.execute('INSERT INTO users (id, email, name) VALUES (?, ?, ?)', [
      userId,
      `${userId}@test.invalid`,
      `Drawdown ${suffix}`
    ]);
    db.execute(
      `INSERT INTO user_settings (id, user_id, experience_mode, control_mode)
       VALUES (?, ?, 'BEGINNER', 'COPILOT')`,
      [`set_${suffix}`, userId]
    );
    db.execute(
      `INSERT INTO portfolios
         (id, user_id, type, name, currency, initial_capital, current_cash,
          invested_value, total_value, realised_pnl, unrealised_pnl, is_active)
       VALUES (?, ?, 'VIRTUAL', 'Drawdown practice', 'INR', 25000, 25000, 0, 25000, 0, 0, 1)`,
      [portfolioId, userId]
    );
    db.execute(
      `INSERT INTO portfolio_permissions
         (id, portfolio_id, allow_autonomous_trading, max_position_pct,
          max_portfolio_exposure_pct, min_cash_reserve_pct, max_risk_per_trade_pct,
          max_daily_loss_limit, max_drawdown_limit_pct, max_order_value, max_orders_per_day,
          allow_intraday, allow_delivery, trading_schedule_enabled,
          trading_window_start, trading_window_end)
       VALUES (?, ?, 1, 100, 100, 0, 100, 1500, ?, 1000000, 100, 0, 1, 0, '09:15', '15:30')`,
      [`perm_${suffix}`, portfolioId, drawdownLimitPct]
    );

    return { userId, portfolioId, suffix };
  }

  function addSnapshot(portfolioId: string, suffix: string, index: number, totalValue: number) {
    db.execute(
      `INSERT INTO portfolio_snapshots
         (id, portfolio_id, timestamp, cash_balance, positions_value, total_value)
       VALUES (?, ?, datetime('now'), ?, 0, ?)`,
      [`snap_${suffix}_${index}`, portfolioId, totalValue, totalValue]
    );
  }

  function cleanup(userId: string, portfolioId: string, suffix: string) {
    db.execute('DELETE FROM portfolio_snapshots WHERE portfolio_id = ?', [portfolioId]);
    db.execute('DELETE FROM portfolio_permissions WHERE portfolio_id = ?', [portfolioId]);
    db.execute('DELETE FROM portfolios WHERE id = ?', [portfolioId]);
    db.execute('DELETE FROM user_settings WHERE user_id = ?', [userId]);
    db.execute('DELETE FROM users WHERE id = ?', [userId]);
    void suffix;
  }

  function order(portfolioId: string) {
    return evaluateProposalRisk({
      portfolioId,
      assetId: 'ast_itc',
      side: 'BUY',
      quantity: 1,
      price: 492.65,
      now: TRADING_NOW
    });
  }

  it('reports UNAVAILABLE, not PASS, when there is no NAV history', () => {
    const { userId, portfolioId, suffix } = createPortfolio(10);
    try {
      const result = order(portfolioId);
      const drawdown = result.checks.find((check) => check.ruleName === 'MAX_DRAWDOWN')!;

      expect(drawdown).toBeDefined();
      expect(drawdown.status).toBe('UNAVAILABLE');
      // It must not be reported as a control that passed…
      expect(drawdown.status).not.toBe('PASS');
      // …and a single snapshot is still not enough history.
      addSnapshot(portfolioId, suffix, 1, 25_000);
      const single = order(portfolioId).checks.find((check) => check.ruleName === 'MAX_DRAWDOWN')!;
      expect(single.status).toBe('UNAVAILABLE');
    } finally {
      cleanup(userId, portfolioId, suffix);
    }
  });

  it('blocks an order that would breach a measurable drawdown limit', () => {
    const { userId, portfolioId, suffix } = createPortfolio(10);
    try {
      // Peak recorded NAV of ₹30,000 against a current ₹25,000 is a 16.7% drawdown.
      addSnapshot(portfolioId, suffix, 1, 30_000);
      addSnapshot(portfolioId, suffix, 2, 27_000);

      const result = order(portfolioId);
      const drawdown = result.checks.find((check) => check.ruleName === 'MAX_DRAWDOWN')!;

      expect(drawdown.status).toBe('FAIL');
      expect(result.passed).toBe(false);
      expect(result.reasons.some((reason) => /drawdown/i.test(reason))).toBe(true);
    } finally {
      cleanup(userId, portfolioId, suffix);
    }
  });

  it('passes once the measured drawdown is inside the limit', () => {
    const { userId, portfolioId, suffix } = createPortfolio(50);
    try {
      addSnapshot(portfolioId, suffix, 1, 26_000);
      addSnapshot(portfolioId, suffix, 2, 25_500);

      const drawdown = order(portfolioId).checks.find((check) => check.ruleName === 'MAX_DRAWDOWN')!;
      expect(drawdown.status).toBe('PASS');
    } finally {
      cleanup(userId, portfolioId, suffix);
    }
  });
});
