import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { openDatabaseAt, initSchema } from '../src/db';
import { runMigrations, CURRENT_SCHEMA_VERSION } from '../src/db/migrations';

/**
 * Migration safety.
 *
 * The only thing that matters here is that an EXISTING database — with real
 * portfolios, positions, orders, executions, ledger rows and credentials —
 * survives an upgrade with every row and value intact. The suite builds a
 * database that looks like the previous release, fills it with representative
 * data, then runs the real migration path.
 */

const tempFiles: string[] = [];

function makeLegacyDatabase(): { file: string; db: Database.Database } {
  const file = path.join(os.tmpdir(), `investpilot-migration-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  tempFiles.push(file);
  const database = openDatabaseAt(file);

  // 1. Current schema, so every table initSchema expects exists.
  initSchema(database);

  // 2. Downgrade to the previous release's shape.
  database.pragma('foreign_keys = OFF');
  database.exec('DROP TABLE IF EXISTS idempotency_keys');
  database.exec('ALTER TABLE users DROP COLUMN is_disabled');
  database.exec('ALTER TABLE user_credentials DROP COLUMN token_version');
  database.exec('ALTER TABLE executions DROP COLUMN realised_pnl');
  database.pragma('user_version = 1');
  database.pragma('foreign_keys = ON');

  // 3. Representative user data that must survive.
  database.exec(`
    INSERT INTO users (id, email, name) VALUES ('usr_legacy', 'legacy@test.invalid', 'Legacy User');
    INSERT INTO user_credentials (user_id, password_hash) VALUES ('usr_legacy', 'scrypt$16384$8$1$salt$key');
    INSERT INTO user_settings (id, user_id) VALUES ('set_legacy', 'usr_legacy');
    INSERT INTO portfolios
      (id, user_id, type, name, currency, initial_capital, current_cash, invested_value, total_value)
      VALUES ('port_legacy', 'usr_legacy', 'VIRTUAL', 'Legacy portfolio', 'INR', 25000, 24000, 1000, 25000);
    INSERT INTO assets (id, symbol, name, exchange, sector)
      VALUES ('ast_legacy', 'LEGACY', 'Legacy Ltd', 'NSE', 'Testing');
    INSERT INTO orders
      (id, portfolio_id, asset_id, portfolio_type, order_mode, side, order_type, product_type,
       quantity, filled_quantity, price, status, idempotency_key)
      VALUES ('ord_legacy', 'port_legacy', 'ast_legacy', 'VIRTUAL', 'MANUAL', 'BUY', 'LIMIT', 'CNC',
              2, 2, 500, 'FILLED', 'legacy-key-1');
    INSERT INTO executions
      (id, order_id, portfolio_id, asset_id, portfolio_type, side, quantity, fill_price,
       gross_amount, net_amount)
      VALUES ('exc_legacy', 'ord_legacy', 'port_legacy', 'ast_legacy', 'VIRTUAL', 'BUY', 2, 500, 1000, 1001);
    INSERT INTO positions
      (id, portfolio_id, asset_id, portfolio_type, product_type, quantity, average_buy_price,
       current_price, invested_amount, current_market_value)
      VALUES ('pos_legacy', 'port_legacy', 'ast_legacy', 'VIRTUAL', 'CNC', 2, 500, 500, 1000, 1000);
    INSERT INTO cash_ledger_entries
      (id, portfolio_id, portfolio_type, entry_type, amount, balance_after, description)
      VALUES ('csh_legacy', 'port_legacy', 'VIRTUAL', 'INITIAL_DEPOSIT', 25000, 25000, 'opening');
  `);

  return { file, db: database };
}

afterAll(() => {
  for (const file of tempFiles) {
    for (const suffix of ['', '-wal', '-shm', '-journal']) {
      fs.rmSync(file + suffix, { force: true });
    }
  }
});

describe('schema migrations preserve existing data', () => {
  it('upgrades a previous-release database without losing a single row', () => {
    const { db, file } = makeLegacyDatabase();

    const before = {
      users: db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number },
      portfolios: db.prepare('SELECT * FROM portfolios WHERE id = ?').get('port_legacy'),
      executions: db.prepare('SELECT COUNT(*) AS c FROM executions').get() as { c: number },
      ledger: db.prepare('SELECT COUNT(*) AS c FROM cash_ledger_entries').get() as { c: number },
      credentials: db.prepare('SELECT password_hash FROM user_credentials').get() as {
        password_hash: string;
      }
    };

    expect(Number(db.pragma('user_version', { simple: true }))).toBe(1);

    const result = runMigrations(db);
    expect(result.from).toBe(1);
    expect(result.to).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.applied.length).toBeGreaterThan(0);

    // Every row still there, unchanged.
    expect((db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c).toBe(
      before.users.c
    );
    expect(db.prepare('SELECT * FROM portfolios WHERE id = ?').get('port_legacy')).toEqual(
      expect.objectContaining({
        current_cash: 24000,
        invested_value: 1000,
        total_value: 25000
      })
    );
    expect((db.prepare('SELECT COUNT(*) AS c FROM executions').get() as { c: number }).c).toBe(
      before.executions.c
    );
    expect(
      (db.prepare('SELECT COUNT(*) AS c FROM cash_ledger_entries').get() as { c: number }).c
    ).toBe(before.ledger.c);
    expect(db.prepare('SELECT password_hash FROM user_credentials').get()).toEqual(
      before.credentials
    );

    // New columns exist with safe defaults that do not change existing meaning.
    const user = db.prepare('SELECT is_disabled FROM users WHERE id = ?').get('usr_legacy') as {
      is_disabled: number;
    };
    expect(user.is_disabled).toBe(0);

    const credential = db
      .prepare('SELECT token_version FROM user_credentials WHERE user_id = ?')
      .get('usr_legacy') as { token_version: number };
    expect(credential.token_version).toBe(0);

    const execution = db
      .prepare('SELECT realised_pnl FROM executions WHERE id = ?')
      .get('exc_legacy') as { realised_pnl: number };
    expect(execution.realised_pnl).toBe(0);

    // The new table exists and is usable.
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='idempotency_keys'").get()
    ).toBeTruthy();

    // The database is left consistent (foreign keys still enforced).
    expect(db.pragma('foreign_key_check')).toEqual([]);

    fs.rmSync(file, { force: true });
    db.close();
  });

  it('is idempotent: running the migrations twice changes nothing', () => {
    const { db } = makeLegacyDatabase();
    runMigrations(db);
    const snapshot = db.prepare('SELECT * FROM portfolios ORDER BY id').all();
    const second = runMigrations(db);

    expect(second.applied).toEqual([]);
    expect(second.to).toBe(second.from);
    expect(db.prepare('SELECT * FROM portfolios ORDER BY id').all()).toEqual(snapshot);
    db.close();
  });

  it('repairs an idempotency table keyed only by id, keeping its rows', () => {
    const { db } = makeLegacyDatabase();
    runMigrations(db);

    // Recreate the intermediate (buggy) shape: single-column primary key.
    db.exec(`
      DROP TABLE idempotency_keys;
      CREATE TABLE idempotency_keys (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        scope TEXT NOT NULL,
        request_hash TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'IN_PROGRESS',
        response_json TEXT,
        status_code INTEGER,
        resource_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL
      );
      INSERT INTO idempotency_keys (id, user_id, scope, request_hash, expires_at)
      VALUES ('legacy-key-1', 'usr_legacy', 'order', 'hash-1', datetime('now', '+1 day'));
    `);
    db.pragma('user_version = 3');

    const result = runMigrations(db);
    expect(result.applied.some((entry) => entry.startsWith('v4'))).toBe(true);

    const rows = db.prepare('SELECT id, user_id FROM idempotency_keys').all() as Array<{
      id: string;
      user_id: string;
    }>;
    expect(rows).toEqual([{ id: 'legacy-key-1', user_id: 'usr_legacy' }]);

    const pkColumns = (
      db.prepare('PRAGMA table_info(idempotency_keys)').all() as Array<{ name: string; pk: number }>
    )
      .filter((row) => row.pk > 0)
      .map((row) => row.name);
    expect(pkColumns.sort()).toEqual(['id', 'scope', 'user_id']);
    db.close();
  });
});

describe('test isolation', () => {
  it('points the test suite at a disposable database, never the demo one', () => {
    const configured = process.env.INVESTPILOT_DB_PATH ?? '';
    expect(configured).not.toBe('');
    expect(path.basename(configured)).toBe('investpilot.test.db');
    expect(path.resolve(configured)).not.toBe(path.resolve(process.cwd(), 'data', 'investpilot.db'));
  });
});
