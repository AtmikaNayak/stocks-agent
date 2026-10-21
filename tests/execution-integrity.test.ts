import { describe, it, expect, beforeAll } from 'vitest';
import db from '../src/db';
import marketData from '../src/lib/market-data';
import portfolioExecutionAgent from '../src/lib/agents/portfolio-execution';
import { AppError } from '../src/lib/errors';
import { hashRequest } from '../src/lib/idempotency';
import { TRADING_NOW, AFTER_HOURS_NOW, WEEKEND_NOW } from './helpers/market-clock';

/**
 * Regression tests for financial integrity.
 *
 * These exercise the real execution agent against the isolated test database.
 * Nothing is stubbed: quotes come from the seeded (synthetic) fixtures, and the
 * assertions read back committed rows.
 */

const ASSET_ITC = 'ast_itc';

interface FixtureOptions {
  cash?: number;
  maxOrderValue?: number;
  maxPositionPct?: number;
  minCashReservePct?: number;
  maxRiskPerTradePct?: number;
  maxOrdersPerDay?: number;
  allowIntraday?: boolean;
  tradingScheduleEnabled?: boolean;
}

let fixtureCounter = 0;

/** Creates an isolated user + virtual portfolio with tailored risk limits. */
function createFixture(overrides: FixtureOptions = {}) {
  fixtureCounter += 1;
  const suffix = `${Date.now().toString(36)}_${fixtureCounter}`;
  const userId = `usr_int_${suffix}`;
  const portfolioId = `port_int_${suffix}`;
  const cash = overrides.cash ?? 25_000;

  db.execute(
    `INSERT INTO users (id, email, name) VALUES (?, ?, ?)`,
    [userId, `${userId}@test.invalid`, `Integrity ${suffix}`]
  );
  db.execute(
    `INSERT INTO user_settings (id, user_id, experience_mode, control_mode)
     VALUES (?, ?, 'BEGINNER', 'COPILOT')`,
    [`set_${suffix}`, userId]
  );
  db.execute(
    `INSERT INTO portfolios
       (id, user_id, type, name, currency, initial_capital, current_cash,
        invested_value, total_value, realised_pnl, unrealised_pnl, is_active)
     VALUES (?, ?, 'VIRTUAL', 'Integrity practice', 'INR', ?, ?, 0, ?, 0, 0, 1)`,
    [portfolioId, userId, cash, cash, cash]
  );
  db.execute(
    `INSERT INTO portfolio_permissions
       (id, portfolio_id, allow_autonomous_trading, max_position_pct,
        max_portfolio_exposure_pct, min_cash_reserve_pct, max_risk_per_trade_pct,
        max_daily_loss_limit, max_drawdown_limit_pct, max_order_value, max_orders_per_day,
        allow_intraday, allow_delivery, trading_schedule_enabled,
        trading_window_start, trading_window_end)
     VALUES (?, ?, 1, ?, 100, ?, ?, 1500, 100, ?, ?, ?, 1, ?, '09:20', '15:15')`,
    [
      `perm_${suffix}`,
      portfolioId,
      overrides.maxPositionPct ?? 100,
      overrides.minCashReservePct ?? 0,
      overrides.maxRiskPerTradePct ?? 100,
      overrides.maxOrderValue ?? 1_000_000,
      overrides.maxOrdersPerDay ?? 100,
      overrides.allowIntraday ? 1 : 0,
      overrides.tradingScheduleEnabled === false ? 0 : 1
    ]
  );
  db.execute(
    `INSERT INTO cash_ledger_entries
       (id, portfolio_id, portfolio_type, entry_type, amount, balance_after, reference_id, description)
     VALUES (?, ?, 'VIRTUAL', 'INITIAL_DEPOSIT', ?, ?, ?, 'Test opening balance')`,
    [`csh_init_${suffix}`, portfolioId, cash, cash, `INIT_${suffix}`]
  );

  return { userId, portfolioId };
}

function portfolioRow(portfolioId: string) {
  return db.queryOne<{
    current_cash: number;
    invested_value: number;
    total_value: number;
    realised_pnl: number;
    unrealised_pnl: number;
  }>(
    'SELECT current_cash, invested_value, total_value, realised_pnl, unrealised_pnl FROM portfolios WHERE id = ?',
    [portfolioId]
  )!;
}

function counts(portfolioId: string) {
  const order = db.queryOne<{ c: number }>('SELECT COUNT(*) AS c FROM orders WHERE portfolio_id = ?', [portfolioId])!;
  const exec = db.queryOne<{ c: number }>(
    'SELECT COUNT(*) AS c FROM executions WHERE portfolio_id = ?',
    [portfolioId]
  )!;
  const ledger = db.queryOne<{ c: number }>(
    'SELECT COUNT(*) AS c FROM cash_ledger_entries WHERE portfolio_id = ?',
    [portfolioId]
  )!;
  const positions = db.queryOne<{ c: number }>(
    'SELECT COUNT(*) AS c FROM positions WHERE portfolio_id = ?',
    [portfolioId]
  )!;
  return { orders: order.c, executions: exec.c, ledger: ledger.c, positions: positions.c };
}

/**
 * Cash, positions and portfolio totals must tell the same story. This is the
 * invariant every mutation has to preserve.
 */
/** Rounding to paise in two independent places may differ by one paisa. */
function expectMoney(actual: number, expected: number) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(0.011);
}

function assertReconciled(portfolioId: string) {
  const portfolio = portfolioRow(portfolioId);
  const ledger = db.queryOne<{ total: number }>(
    'SELECT COALESCE(SUM(amount), 0) AS total FROM cash_ledger_entries WHERE portfolio_id = ?',
    [portfolioId]
  )!;
  const positions = db.queryOne<{ invested: number; market: number; unrealised: number }>(
    `SELECT COALESCE(SUM(invested_amount), 0) AS invested,
            COALESCE(SUM(current_market_value), 0) AS market,
            COALESCE(SUM(unrealised_pnl), 0) AS unrealised
     FROM positions WHERE portfolio_id = ?`,
    [portfolioId]
  )!;

  expectMoney(portfolio.current_cash, ledger.total);
  expectMoney(portfolio.invested_value, positions.invested);
  expectMoney(portfolio.total_value, portfolio.current_cash + positions.market);
  expectMoney(portfolio.unrealised_pnl, positions.unrealised);
}

async function buy(
  portfolioId: string,
  quantity: number,
  extra: Partial<Parameters<typeof portfolioExecutionAgent.executeOrder>[0]> = {}
) {
  return portfolioExecutionAgent.executeOrder({
    portfolioId,
    assetId: ASSET_ITC,
    side: 'BUY',
    quantity,
    orderMode: 'MANUAL',
    now: TRADING_NOW,
    ...extra
  });
}

beforeAll(() => {
  // A dedicated asset with a deliberately stale quote, and one with no quote at
  // all, so the quote-validation tests never disturb the shared fixtures.
  db.execute(
    `INSERT OR IGNORE INTO assets (id, symbol, name, exchange, sector, is_tradable)
     VALUES ('ast_test_stale', 'STALETEST', 'Stale Quote Test Ltd', 'NSE', 'Testing', 0)`
  );
  db.execute(
    `INSERT OR REPLACE INTO market_data_points
       (id, asset_id, timestamp, timeframe, open, high, low, close, volume, vwap,
        provider, freshness_status, quality_score, retrieved_at)
     VALUES ('mdp_stale_1', 'ast_test_stale', '2026-10-20', '1D', 100, 102, 99, 101, 1000, 100.5,
             'SYNTHETIC_SEED', 'STALE', 0.0, datetime('now'))`
  );
  db.execute(
    `INSERT OR IGNORE INTO assets (id, symbol, name, exchange, sector, is_tradable)
     VALUES ('ast_test_noquote', 'NOQUOTE', 'No Quote Test Ltd', 'NSE', 'Testing', 0)`
  );
  // Give the test assets fundamentals rows so they never become the "company
  // with no fundamentals" candidate that other suites deliberately look for.
  for (const assetId of ['ast_test_stale', 'ast_test_noquote']) {
    db.execute(
      `INSERT OR IGNORE INTO company_fundamentals
         (id, asset_id, market_cap, pe_ratio, pb_ratio, roe, roce, debt_to_equity,
          eps_ttm, operating_margin, net_profit_margin, revenue_growth_yoy,
          profit_growth_yoy, free_cash_flow, financial_year, source)
       VALUES (?, ?, 1000, 20, 3, 12, 14, 0.5, 10, 15, 8, 5, 6, 100, 'FY26',
               'TEST FIXTURE — not real data')`,
      [`fnd_${assetId}`, assetId]
    );
  }
});

describe('concurrent execution cannot use a stale cash balance', () => {
  it('rejects the second of two simultaneous buys that would overdraw cash', async () => {
    const quote = (await marketData.getQuote('ITC'))!;
    const quantity = 40; // ~₹19,700 each; two of them would need ~₹39,400 from ₹25,000
    const fixture = createFixture({ cash: 25_000 });

    const results = await Promise.allSettled([
      buy(fixture.portfolioId, quantity),
      buy(fixture.portfolioId, quantity)
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const after = portfolioRow(fixture.portfolioId);
    // The core regression: cash must never go negative, and only one trade
    // may exist.
    expect(after.current_cash).toBeGreaterThanOrEqual(0);
    expect(after.current_cash).toBeLessThan(25_000);
    expect(counts(fixture.portfolioId).orders).toBe(1);
    expect(counts(fixture.portfolioId).executions).toBe(1);
    expect(quote.price).toBeGreaterThan(0);
    assertReconciled(fixture.portfolioId);
  });

  it('rejects the second of two simultaneous sells of the same shares', async () => {
    const fixture = createFixture();
    await buy(fixture.portfolioId, 10);

    const before = portfolioRow(fixture.portfolioId);

    const results = await Promise.allSettled([
      portfolioExecutionAgent.executeOrder({
        portfolioId: fixture.portfolioId,
        assetId: ASSET_ITC,
        side: 'SELL',
        quantity: 10,
        orderMode: 'MANUAL',
        now: TRADING_NOW
      }),
      portfolioExecutionAgent.executeOrder({
        portfolioId: fixture.portfolioId,
        assetId: ASSET_ITC,
        side: 'SELL',
        quantity: 10,
        orderMode: 'MANUAL',
        now: TRADING_NOW
      })
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);

    // Exactly one sell: position gone, one extra ledger credit, never two.
    const positions = db.queryOne<{ c: number }>(
      'SELECT COUNT(*) AS c FROM positions WHERE portfolio_id = ?',
      [fixture.portfolioId]
    )!;
    expect(positions.c).toBe(0);
    expect(counts(fixture.portfolioId).executions).toBe(2); // 1 buy + 1 sell
    expect(portfolioRow(fixture.portfolioId).current_cash).toBeGreaterThan(before.current_cash);
    assertReconciled(fixture.portfolioId);
  });
});

describe('idempotency', () => {
  it('executes once and replays the original result for a repeated key', async () => {
    const fixture = createFixture();
    const key = `test-idem-${Date.now()}-aaaa`;

    const first = await buy(fixture.portfolioId, 2, { idempotencyKey: key });
    const second = await buy(fixture.portfolioId, 2, { idempotencyKey: key });

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.orderId).toBe(first.orderId);
    expect(second.executionId).toBe(first.executionId);
    expect(counts(fixture.portfolioId).orders).toBe(1);
    expect(counts(fixture.portfolioId).executions).toBe(1);
    assertReconciled(fixture.portfolioId);
  });

  it('rejects reuse of the same key with different order details', async () => {
    const fixture = createFixture();
    const key = `test-idem-${Date.now()}-bbbb`;

    await buy(fixture.portfolioId, 2, { idempotencyKey: key });

    await expect(buy(fixture.portfolioId, 3, { idempotencyKey: key })).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT'
    });

    expect(counts(fixture.portfolioId).orders).toBe(1);
    assertReconciled(fixture.portfolioId);
  });

  it('rejects reuse of a key that never completed instead of executing again', async () => {
    const fixture = createFixture();
    const key = `test-idem-${Date.now()}-cccc`;

    // Simulate a request that claimed the key and then died: same key, same
    // request fingerprint, but never completed.
    const requestHash = hashRequest({
      portfolioId: fixture.portfolioId,
      assetId: ASSET_ITC,
      side: 'BUY',
      quantity: 1,
      productType: 'CNC',
      orderMode: 'MANUAL',
      proposalId: null
    });
    db.execute(
      `INSERT INTO idempotency_keys (id, user_id, scope, request_hash, status, created_at, expires_at)
       SELECT ?, user_id, 'order', ?, 'IN_PROGRESS', datetime('now'), datetime('now', '+1 day')
       FROM portfolios WHERE id = ?`,
      [key, requestHash, fixture.portfolioId]
    );

    await expect(buy(fixture.portfolioId, 1, { idempotencyKey: key })).rejects.toMatchObject({
      code: 'IDEMPOTENCY_IN_PROGRESS'
    });
    expect(counts(fixture.portfolioId).orders).toBe(0);
  });

  it('scopes a key to the user, so another user may use the same string', async () => {
    const a = createFixture();
    const b = createFixture();
    const key = `test-idem-${Date.now()}-dddd`;

    await buy(a.portfolioId, 1, { idempotencyKey: key });
    await buy(b.portfolioId, 1, { idempotencyKey: key });

    expect(counts(a.portfolioId).orders).toBe(1);
    expect(counts(b.portfolioId).orders).toBe(1);
  });
});

describe('CNC / MIS product isolation', () => {
  it('rejects selling CNC when only an MIS position exists, and credits nothing', async () => {
    const fixture = createFixture({ allowIntraday: true });
    await buy(fixture.portfolioId, 5, { productType: 'MIS' });

    const before = portfolioRow(fixture.portfolioId);
    const beforeCounts = counts(fixture.portfolioId);

    await expect(
      portfolioExecutionAgent.executeOrder({
        portfolioId: fixture.portfolioId,
        assetId: ASSET_ITC,
        side: 'SELL',
        quantity: 5,
        productType: 'CNC',
        orderMode: 'MANUAL',
        now: TRADING_NOW
      })
    ).rejects.toMatchObject({ code: 'RISK_REJECTED' });

    expect(portfolioRow(fixture.portfolioId).current_cash).toBe(before.current_cash);
    expect(counts(fixture.portfolioId)).toEqual(beforeCounts);
    assertReconciled(fixture.portfolioId);
  });

  it('rejects selling MIS when only a CNC position exists', async () => {
    const fixture = createFixture({ allowIntraday: true });
    await buy(fixture.portfolioId, 5, { productType: 'CNC' });

    await expect(
      portfolioExecutionAgent.executeOrder({
        portfolioId: fixture.portfolioId,
        assetId: ASSET_ITC,
        side: 'SELL',
        quantity: 5,
        productType: 'MIS',
        orderMode: 'MANUAL',
        now: TRADING_NOW
      })
    ).rejects.toMatchObject({ code: 'RISK_REJECTED' });

    const pos = db.queryOne<{ quantity: number }>(
      'SELECT quantity FROM positions WHERE portfolio_id = ? AND product_type = ?',
      [fixture.portfolioId, 'CNC']
    )!;
    expect(pos.quantity).toBe(5);
  });

  it('rejects intraday orders when the portfolio has intraday disabled', async () => {
    const fixture = createFixture({ allowIntraday: false });

    await expect(buy(fixture.portfolioId, 1, { productType: 'MIS' })).rejects.toMatchObject({
      code: 'RISK_REJECTED'
    });
    expect(counts(fixture.portfolioId).orders).toBe(0);
  });
});

describe('sell-side holdings integrity', () => {
  it('sells the full position, removes it, and credits cash exactly once', async () => {
    const fixture = createFixture();
    const opened = await buy(fixture.portfolioId, 4);
    const beforeSell = portfolioRow(fixture.portfolioId);

    const sold = await portfolioExecutionAgent.executeOrder({
      portfolioId: fixture.portfolioId,
      assetId: ASSET_ITC,
      side: 'SELL',
      quantity: 4,
      orderMode: 'MANUAL',
      now: TRADING_NOW
    });

    expect(sold.fillPrice).toBeGreaterThan(0);
    const after = portfolioRow(fixture.portfolioId);
    expectMoney(after.current_cash, beforeSell.current_cash + sold.charges.netAmount);
    expect(counts(fixture.portfolioId).positions).toBe(0);
    expect(after.invested_value).toBe(0);
    assertReconciled(fixture.portfolioId);
    expect(opened.executionId).not.toBe(sold.executionId);
  });

  it('leaves the correct residual position for a partial sell', async () => {
    const fixture = createFixture();
    await buy(fixture.portfolioId, 10);

    await portfolioExecutionAgent.executeOrder({
      portfolioId: fixture.portfolioId,
      assetId: ASSET_ITC,
      side: 'SELL',
      quantity: 4,
      orderMode: 'MANUAL',
      now: TRADING_NOW
    });

    const pos = db.queryOne<{ quantity: number; average_buy_price: number }>(
      'SELECT quantity, average_buy_price FROM positions WHERE portfolio_id = ?',
      [fixture.portfolioId]
    )!;
    expect(pos.quantity).toBe(6);
    assertReconciled(fixture.portfolioId);
  });

  it('rejects selling more than is held without touching cash or the ledger', async () => {
    const fixture = createFixture();
    await buy(fixture.portfolioId, 3);

    const before = portfolioRow(fixture.portfolioId);
    const beforeCounts = counts(fixture.portfolioId);

    await expect(
      portfolioExecutionAgent.executeOrder({
        portfolioId: fixture.portfolioId,
        assetId: ASSET_ITC,
        side: 'SELL',
        quantity: 4,
        orderMode: 'MANUAL',
        now: TRADING_NOW
      })
    ).rejects.toMatchObject({ code: 'RISK_REJECTED' });

    expect(portfolioRow(fixture.portfolioId)).toEqual(before);
    expect(counts(fixture.portfolioId)).toEqual(beforeCounts);
  });

  it('rejects selling an asset that is not held at all', async () => {
    const fixture = createFixture();
    const before = portfolioRow(fixture.portfolioId);

    await expect(
      portfolioExecutionAgent.executeOrder({
        portfolioId: fixture.portfolioId,
        assetId: 'ast_tcs',
        side: 'SELL',
        quantity: 1,
        orderMode: 'MANUAL',
        now: TRADING_NOW
      })
    ).rejects.toMatchObject({ code: 'RISK_REJECTED' });

    expect(portfolioRow(fixture.portfolioId)).toEqual(before);
    expect(counts(fixture.portfolioId).orders).toBe(0);
  });
});

describe('cash accounting includes charges', () => {
  it('rejects a buy whose turnover fits but whose charges do not', async () => {
    const quote = (await marketData.getQuote('ITC'))!;
    const quantity = 5;
    // Cash covers the raw quote value but not slippage + charges.
    const cash = Math.round(quote.price * quantity * 100) / 100;
    const fixture = createFixture({ cash });

    await expect(buy(fixture.portfolioId, quantity)).rejects.toMatchObject({
      code: 'RISK_REJECTED'
    });

    expect(portfolioRow(fixture.portfolioId).current_cash).toBe(cash);
    expect(counts(fixture.portfolioId).orders).toBe(0);
  });

  it('records a consistent order, execution, ledger and portfolio trail', async () => {
    const fixture = createFixture();
    const result = await buy(fixture.portfolioId, 3);

    const execution = db.queryOne<{
      fill_price: number;
      gross_amount: number;
      total_charges: number;
      net_amount: number;
    }>('SELECT fill_price, gross_amount, total_charges, net_amount FROM executions WHERE id = ?', [
      result.executionId
    ])!;

    expect(execution.fill_price).toBe(result.fillPrice);
    expectMoney(execution.gross_amount, execution.fill_price * 3);
    expectMoney(execution.total_charges, result.charges.totalCharges);
    expectMoney(execution.net_amount, execution.gross_amount + execution.total_charges);

    const ledger = db.queryOne<{ amount: number; balance_after: number }>(
      'SELECT amount, balance_after FROM cash_ledger_entries WHERE reference_id = ?',
      [result.executionId]
    )!;
    expectMoney(ledger.amount, -execution.net_amount);
    expectMoney(ledger.balance_after, result.newCash);
    expectMoney(result.newCash, 25_000 - execution.net_amount);

    assertReconciled(fixture.portfolioId);
  });
});

describe('quote validation', () => {
  it('rejects an order when no quote exists', async () => {
    const fixture = createFixture();

    await expect(
      portfolioExecutionAgent.executeOrder({
        portfolioId: fixture.portfolioId,
        assetId: 'ast_test_noquote',
        side: 'BUY',
        quantity: 1,
        orderMode: 'MANUAL',
        now: TRADING_NOW
      })
    ).rejects.toMatchObject({ code: 'QUOTE_UNUSABLE' });
  });

  it('rejects an order priced from a stale quote', async () => {
    const fixture = createFixture();

    await expect(
      portfolioExecutionAgent.executeOrder({
        portfolioId: fixture.portfolioId,
        assetId: 'ast_test_stale',
        side: 'BUY',
        quantity: 1,
        orderMode: 'MANUAL',
        now: TRADING_NOW
      })
    ).rejects.toMatchObject({ code: 'QUOTE_UNUSABLE' });
  });

  it('records the provider and freshness on the execution audit trail', async () => {
    const fixture = createFixture();
    const result = await buy(fixture.portfolioId, 1);

    expect(result.quoteProvider).toBe('SYNTHETIC_SEED');
    expect(result.quoteFreshness).toBe('SYNTHETIC');
    expect(result.simulated).toBe(true);

    const audit = db.queryOne<{ details: string }>(
      "SELECT details FROM audit_logs WHERE portfolio_id = ? AND action_type = 'EXECUTION_FILLED'",
      [fixture.portfolioId]
    )!;
    expect(audit.details).toContain('SYNTHETIC_SEED');
  });
});

describe('transactional atomicity', () => {
  it('rolls back every financial row when a late write fails', async () => {
    const fixture = createFixture();
    const before = portfolioRow(fixture.portfolioId);
    const beforeCounts = counts(fixture.portfolioId);

    // Force the final notification insert to fail inside the transaction.
    db.execute(`
      CREATE TRIGGER test_block_notifications
      BEFORE INSERT ON notifications
      BEGIN
        SELECT RAISE(ABORT, 'simulated notification failure');
      END
    `);

    try {
      await expect(buy(fixture.portfolioId, 2)).rejects.toThrow(/simulated notification failure/i);
    } finally {
      db.execute('DROP TRIGGER test_block_notifications');
    }

    expect(portfolioRow(fixture.portfolioId)).toEqual(before);
    expect(counts(fixture.portfolioId)).toEqual(beforeCounts);

    // The idempotency claim was rolled back with everything else, so a retry
    // after the fault is cleared executes exactly once.
    const retry = await buy(fixture.portfolioId, 2);
    expect(retry.replayed).toBe(false);
    expect(counts(fixture.portfolioId).orders).toBe(1);
    assertReconciled(fixture.portfolioId);
  });

  it('does not mark a proposal EXECUTED when the execution fails', async () => {
    const fixture = createFixture();
    db.execute(
      `INSERT INTO investment_proposals (
         id, portfolio_id, asset_id, action, horizon, proposed_price, proposed_quantity,
         proposed_value, rationale, supporting_evidence, contrary_evidence,
         alternatives_considered, invalidation_criteria, preconditions, expected_costs,
         expires_at, status)
       VALUES ('prop_int_rollback', ?, ?, 'BUY', 'LONG_TERM', 500, 2, 1000,
         'Fixture', 'Fixture', 'Fixture', 'Fixture', 'Fixture', 'Fixture', 12,
         datetime('now', '+2 hours'), 'APPROVED')`,
      [fixture.portfolioId, ASSET_ITC]
    );

    db.execute(`
      CREATE TRIGGER test_block_audit
      BEFORE INSERT ON audit_logs
      BEGIN
        SELECT RAISE(ABORT, 'simulated audit failure');
      END
    `);

    try {
      await expect(
        portfolioExecutionAgent.executeOrder({
          portfolioId: fixture.portfolioId,
          assetId: ASSET_ITC,
          side: 'BUY',
          quantity: 2,
          orderMode: 'AI_PROPOSAL_APPROVED',
          proposalId: 'prop_int_rollback',
          now: TRADING_NOW
        })
      ).rejects.toThrow(/simulated audit failure/i);
    } finally {
      db.execute('DROP TRIGGER test_block_audit');
    }

    const proposal = db.queryOne<{ status: string }>(
      'SELECT status FROM investment_proposals WHERE id = ?',
      ['prop_int_rollback']
    )!;
    expect(proposal.status).toBe('APPROVED');
    expect(counts(fixture.portfolioId).orders).toBe(0);
    assertReconciled(fixture.portfolioId);
  });
});

describe('real-money execution remains blocked', () => {
  it('refuses a REAL portfolio before writing anything', async () => {
    const before = db.queryOne<{ c: number }>(
      "SELECT COUNT(*) AS c FROM orders WHERE portfolio_id = 'port_real_01'"
    )!;

    await expect(
      portfolioExecutionAgent.executeOrder({
        portfolioId: 'port_real_01',
        assetId: ASSET_ITC,
        side: 'BUY',
        quantity: 1,
        orderMode: 'MANUAL',
        now: TRADING_NOW
      })
    ).rejects.toMatchObject({ code: 'REAL_EXECUTION_DISABLED', statusCode: 403 });

    const after = db.queryOne<{ c: number }>(
      "SELECT COUNT(*) AS c FROM orders WHERE portfolio_id = 'port_real_01'"
    )!;
    expect(after.c).toBe(before.c);
  });

  it('still refuses a REAL portfolio when the broker row claims CONNECTED', async () => {
    // Data normalisation used to run on every startup and would reset this row.
    // It is now a once-only migration, so this test proves the real-money guard
    // does not depend on that rewrite having happened.
    const original = db.queryOne<{ status: string; status_message: string | null }>(
      "SELECT status, status_message FROM broker_connections WHERE user_id = 'usr_pilot_01' LIMIT 1"
    )!;
    db.execute(
      "UPDATE broker_connections SET status = 'CONNECTED' WHERE user_id = 'usr_pilot_01'"
    );

    try {
      const before = db.queryOne<{ c: number }>(
        "SELECT COUNT(*) AS c FROM orders WHERE portfolio_id = 'port_real_01'"
      )!;

      await expect(
        portfolioExecutionAgent.executeOrder({
          portfolioId: 'port_real_01',
          assetId: ASSET_ITC,
          side: 'BUY',
          quantity: 1,
          orderMode: 'MANUAL',
          now: TRADING_NOW
        })
      ).rejects.toMatchObject({ code: 'REAL_EXECUTION_DISABLED', statusCode: 403 });

      const after = db.queryOne<{ c: number }>(
        "SELECT COUNT(*) AS c FROM orders WHERE portfolio_id = 'port_real_01'"
      )!;
      expect(after.c).toBe(before.c);
    } finally {
      db.execute(
        "UPDATE broker_connections SET status = ?, status_message = ? WHERE user_id = 'usr_pilot_01'",
        [original.status, original.status_message]
      );
    }
  });

  it('refuses AUTONOMOUS_LIVE even on a virtual portfolio', async () => {
    const fixture = createFixture();

    await expect(
      portfolioExecutionAgent.executeOrder({
        portfolioId: fixture.portfolioId,
        assetId: ASSET_ITC,
        side: 'BUY',
        quantity: 1,
        orderMode: 'AUTONOMOUS_LIVE',
        now: TRADING_NOW
      })
    ).rejects.toMatchObject({ code: 'LIVE_MODE_DISABLED', statusCode: 403 });
  });
});

describe('trading window enforcement in the execution path', () => {
  it('refuses an order after the close', async () => {
    const fixture = createFixture({ tradingScheduleEnabled: true });

    await expect(buy(fixture.portfolioId, 1, { now: AFTER_HOURS_NOW })).rejects.toMatchObject({
      code: 'RISK_REJECTED'
    });
    expect(counts(fixture.portfolioId).orders).toBe(0);
  });

  it('refuses an order at the weekend', async () => {
    const fixture = createFixture({ tradingScheduleEnabled: true });

    await expect(buy(fixture.portfolioId, 1, { now: WEEKEND_NOW })).rejects.toMatchObject({
      code: 'RISK_REJECTED'
    });
    expect(counts(fixture.portfolioId).orders).toBe(0);
  });

  it('allows the same order when the portfolio has the window disabled', async () => {
    const fixture = createFixture({ tradingScheduleEnabled: false });
    const result = await buy(fixture.portfolioId, 1, { now: AFTER_HOURS_NOW });
    expect(result.orderId).toBeTruthy();
  });
});

describe('error taxonomy', () => {
  it('uses an AppError with a status code for a rejected order', async () => {
    const fixture = createFixture();
    await expect(buy(fixture.portfolioId, 0)).rejects.toBeInstanceOf(AppError);
  });
});
