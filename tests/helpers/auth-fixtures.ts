import db from '../../src/db';
import { hashPassword } from '../../src/lib/auth/password';
import { SESSION_COOKIE, issueSessionToken } from '../../src/lib/auth/session';

/**
 * Shared fixtures for the authorization tests.
 *
 * Two distinct users with their own virtual portfolios are created in the
 * isolated test database. Nothing here stubs the guard under test — real
 * sessions, real DB rows and real route handlers are used.
 */

export interface TestUser {
  id: string;
  email: string;
  name: string;
  password: string;
  portfolioId: string;
}

export const USER_A: TestUser = {
  id: 'usr_test_a',
  email: 'user.a@test.invalid',
  name: 'Test User A',
  password: 'alpha-long-test-passphrase',
  portfolioId: 'port_test_a'
};

export const USER_B: TestUser = {
  id: 'usr_test_b',
  email: 'user.b@test.invalid',
  name: 'Test User B',
  password: 'bravo-long-test-passphrase',
  portfolioId: 'port_test_b'
};

export const SEEDED_USER_ID = 'usr_pilot_01';
export const SEEDED_USER_PORTFOLIO = 'port_virt_01';

export function ensureUser(user: TestUser): void {
  db.execute(
    `INSERT OR IGNORE INTO users (id, email, name, created_at, updated_at)
     VALUES (?, ?, ?, datetime('now'), datetime('now'))`,
    [user.id, user.email, user.name]
  );
  db.execute(
    `INSERT INTO user_credentials (user_id, password_hash)
     VALUES (?, ?)
     ON CONFLICT(user_id) DO UPDATE SET password_hash = excluded.password_hash`,
    [user.id, hashPassword(user.password)]
  );
  db.execute(
    `INSERT OR IGNORE INTO user_settings (id, user_id, experience_mode, control_mode)
     VALUES (?, ?, 'BEGINNER', 'COPILOT')`,
    [`set_${user.id}`, user.id]
  );
  db.execute(
    `INSERT OR IGNORE INTO portfolios
       (id, user_id, type, name, currency, initial_capital, current_cash,
        invested_value, total_value, is_active)
     VALUES (?, ?, 'VIRTUAL', ?, 'INR', 25000, 25000, 0, 25000, 1)`,
    [user.portfolioId, user.id, `${user.name} practice`]
  );
  db.execute(
    `INSERT OR IGNORE INTO portfolio_permissions
       (id, portfolio_id, allow_autonomous_trading, max_position_pct,
        max_portfolio_exposure_pct, min_cash_reserve_pct, max_risk_per_trade_pct,
        max_daily_loss_limit, max_drawdown_limit_pct, max_order_value, max_orders_per_day)
     VALUES (?, ?, 0, 15.0, 80.0, 20.0, 2.0, 1500.0, 10.0, 5000.0, 10)`,
    [`perm_${user.id}`, user.portfolioId]
  );
  db.execute(
    `INSERT OR IGNORE INTO cash_ledger_entries
       (id, portfolio_id, portfolio_type, entry_type, amount, balance_after, reference_id, description)
     VALUES (?, ?, 'VIRTUAL', 'INITIAL_DEPOSIT', 25000, 25000, ?, 'Test fixture opening balance')`,
    [`csh_${user.id}`, user.portfolioId, `INIT_${user.id}`]
  );
}

export function ensureAllFixtures(): void {
  ensureUser(USER_A);
  ensureUser(USER_B);
}

/**
 * A valid session cookie header value for the user (no login round-trip).
 *
 * The token must carry the account's *current* revocation counter, exactly like
 * a real login does — otherwise a logout in an earlier test would invalidate
 * every later token for that user.
 */
export function sessionCookie(userId: string): string {
  const row = db.queryOne<{ token_version: number }>(
    `SELECT COALESCE(c.token_version, 0) AS token_version
     FROM users u LEFT JOIN user_credentials c ON c.user_id = u.id
     WHERE u.id = ?`,
    [userId]
  );
  const { token } = issueSessionToken(userId, Date.now(), Number(row?.token_version ?? 0));
  return `${SESSION_COOKIE}=${token}`;
}

export function authedHeaders(userId: string, extra: Record<string, string> = {}): Record<string, string> {
  return { cookie: sessionCookie(userId), ...extra };
}

export function authedRequest(
  url: string,
  userId: string,
  init: RequestInit = {}
): Request {
  const headers = new Headers(init.headers);
  headers.set('cookie', sessionCookie(userId));
  return new Request(url, { ...init, headers });
}

export function jsonRequest(
  url: string,
  method: string,
  body: unknown,
  userId?: string
): Request {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (userId) headers.set('cookie', sessionCookie(userId));
  return new Request(absolute(url), { method, headers, body: JSON.stringify(body) });
}

export function absolute(url: string): string {
  return url.startsWith('http') ? url : `http://localhost${url}`;
}

export function resetUserFixtureRows(user: TestUser): void {
  db.execute('DELETE FROM orders WHERE portfolio_id = ?', [user.portfolioId]);
  db.execute('DELETE FROM executions WHERE portfolio_id = ?', [user.portfolioId]);
  db.execute('DELETE FROM positions WHERE portfolio_id = ?', [user.portfolioId]);
  db.execute('DELETE FROM investment_proposals WHERE portfolio_id = ?', [user.portfolioId]);
  db.execute('DELETE FROM decision_records WHERE portfolio_id = ?', [user.portfolioId]);
}
