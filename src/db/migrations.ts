import type Database from 'better-sqlite3';

/**
 * Additive, idempotent schema migrations.
 *
 * `schema.sql` is written with `CREATE TABLE IF NOT EXISTS`, so it can only
 * create *missing* objects. It cannot add a column to a table that already
 * exists in a user's database. This module fills that gap and is the only
 * place where new columns/tables should be introduced.
 *
 * Rules enforced here:
 *  - Every step is additive. Nothing is dropped, truncated or reseeded.
 *  - Every step is safe to run repeatedly and against an existing database.
 *  - `PRAGMA user_version` records the applied level, so a new step runs once.
 *  - A migration never rewrites financial history; defaults are chosen so that
 *    existing rows keep their current meaning.
 *
 * Existing user databases upgraded by this module keep every portfolio,
 * position, order, execution, ledger and credential row intact — there is a
 * regression test for exactly that (`tests/migration-safety.test.ts`).
 */

export const CURRENT_SCHEMA_VERSION = 4;

interface MigrationStep {
  version: number;
  description: string;
  up: (db: Database.Database) => void;
}

/** True when `table` already has a column named `column`. */
function hasColumn(db: Database.Database, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === column);
}

/** Adds a column only when it is missing, keeping existing rows intact. */
function addColumnIfMissing(
  db: Database.Database,
  table: string,
  column: string,
  definition: string
): void {
  if (!hasColumn(db, table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

const STEPS: MigrationStep[] = [
  {
    version: 1,
    description: 'baseline: schema.sql already applied',
    up: () => {
      // The baseline is whatever schema.sql created. Nothing to do.
    }
  },
  {
    version: 2,
    description:
      'server-side session revocation, account disablement and idempotent mutation storage',
    up: (db) => {
      // Token version lets a logout / password change / account disable revoke
      // every previously issued stateless session for that user.
      addColumnIfMissing(db, 'user_credentials', 'token_version', 'INTEGER NOT NULL DEFAULT 0');

      // A disabled account must be unable to authenticate or use an existing
      // session, without deleting its rows.
      addColumnIfMissing(db, 'users', 'is_disabled', 'INTEGER NOT NULL DEFAULT 0');

      // Idempotency store for mutations. Keys are scoped to the authenticated
      // user and the operation, and the stored response is replayed for a
      // legitimate retry of an identical request.
      db.exec(`
        CREATE TABLE IF NOT EXISTS idempotency_keys (
          id TEXT NOT NULL,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          scope TEXT NOT NULL,
          request_hash TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'IN_PROGRESS',
          response_json TEXT,
          status_code INTEGER,
          resource_id TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          expires_at TEXT NOT NULL,
          PRIMARY KEY (user_id, scope, id)
        );
      `);
      db.exec(
        'CREATE INDEX IF NOT EXISTS idx_idempotency_expiry ON idempotency_keys(expires_at);'
      );

      // Drawdown needs an equity high-water mark. Portfolio snapshots already
      // exist; the index makes the peak lookup cheap.
      db.exec(
        'CREATE INDEX IF NOT EXISTS idx_snapshots_portfolio_time ON portfolio_snapshots(portfolio_id, timestamp);'
      );

      // Daily-loss and daily-order limits scan by portfolio and date.
      db.exec(
        'CREATE INDEX IF NOT EXISTS idx_orders_portfolio_time ON orders(portfolio_id, submitted_at);'
      );
      db.exec(
        'CREATE INDEX IF NOT EXISTS idx_executions_portfolio_time ON executions(portfolio_id, executed_at);'
      );
    }
  },
  {
    version: 3,
    description: 'record realised P&L per execution so daily-loss can be computed per IST day',
    up: (db) => {
      // Lifetime portfolio.realised_pnl cannot answer "how much did we lose
      // today". Each execution now carries the P&L booked by that fill, so the
      // daily-loss control can sum only today's rows.
      addColumnIfMissing(db, 'executions', 'realised_pnl', 'REAL NOT NULL DEFAULT 0.0');
    }
  },
  {
    version: 4,
    description: 'scope idempotency keys per (user, operation) rather than globally',
    up: (db) => {
      const tableExists = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'idempotency_keys'")
        .get();
      if (!tableExists) return;

      // A single-column primary key would collide across users. Rebuild the
      // table with the composite key, preserving every existing row.
      const pkColumns = (db.prepare('PRAGMA table_info(idempotency_keys)').all() as Array<{
        name: string;
        pk: number;
      }>)
        .filter((row) => row.pk > 0)
        .map((row) => row.name);

      if (pkColumns.length > 1) return;

      db.exec(`
        CREATE TABLE IF NOT EXISTS idempotency_keys_v4 (
          id TEXT NOT NULL,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          scope TEXT NOT NULL,
          request_hash TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'IN_PROGRESS',
          response_json TEXT,
          status_code INTEGER,
          resource_id TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          expires_at TEXT NOT NULL,
          PRIMARY KEY (user_id, scope, id)
        );
        INSERT OR IGNORE INTO idempotency_keys_v4
          (id, user_id, scope, request_hash, status, response_json, status_code, resource_id, created_at, expires_at)
        SELECT id, user_id, scope, request_hash, status, response_json, status_code, resource_id, created_at, expires_at
        FROM idempotency_keys;
        DROP TABLE idempotency_keys;
        ALTER TABLE idempotency_keys_v4 RENAME TO idempotency_keys;
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_idempotency_expiry ON idempotency_keys(expires_at);');
    }
  }
];

export interface MigrationResult {
  from: number;
  to: number;
  applied: string[];
}

/**
 * Applies any pending migrations. Never destructive: it only adds columns,
 * tables and indexes, so an existing database keeps all of its rows.
 */
export function runMigrations(db: Database.Database): MigrationResult {
  const from = Number(db.pragma('user_version', { simple: true }) ?? 0);
  const applied: string[] = [];

  for (const step of STEPS) {
    if (step.version <= from) continue;
    const apply = db.transaction(() => {
      step.up(db);
      db.pragma(`user_version = ${step.version}`);
    });
    apply.immediate();
    applied.push(`v${step.version}: ${step.description}`);
  }

  return {
    from,
    to: Number(db.pragma('user_version', { simple: true }) ?? from),
    applied
  };
}
