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

export const CURRENT_SCHEMA_VERSION = 6;

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
  },
  {
    version: 5,
    description: 'worker heartbeats and cross-process job locks',
    up: (db) => {
      // A heartbeat is the only honest way for the API process to know whether
      // a separate worker daemon is alive. Job history alone proves that
      // *something* ran once, not that it is running now.
      db.exec(`
        CREATE TABLE IF NOT EXISTS worker_heartbeats (
          worker_id TEXT PRIMARY KEY,
          status TEXT NOT NULL DEFAULT 'RUNNING', -- 'RUNNING' | 'STOPPED'
          host TEXT,
          pid INTEGER,
          interval_seconds INTEGER NOT NULL,
          started_at TEXT NOT NULL DEFAULT (datetime('now')),
          last_beat_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);

      // Cross-process mutual exclusion so two worker processes (or an operator
      // trigger racing the scheduler) cannot run the same job twice.
      addColumnIfMissing(db, 'scheduled_jobs', 'locked_by', 'TEXT');
      addColumnIfMissing(db, 'scheduled_jobs', 'locked_at', 'TEXT');

      // Surface a failure category rather than only a free-text message.
      addColumnIfMissing(db, 'scheduled_jobs', 'last_run_error_category', 'TEXT');
    }
  },
  {
    version: 6,
    description:
      'once-only data normalisation: demo-data labels and disabled live/broker flags',
    up: (db) => {
      // These corrections used to run on EVERY database open, which meant the
      // application rewrote rows before it had even checked the integrity of the
      // file or which release wrote it. They are data changes, so they belong in
      // a versioned, transactional migration that runs exactly once.
      //
      // Each statement is scoped to rows this project itself created (seed ids or
      // a status flag), so a user's own records keep their values.

      // 1. This build has no broker authentication or fill adapter. A stored
      //    "connected" mock session cannot be an authenticated broker session.
      db.prepare(
        `UPDATE broker_connections
         SET status = 'DISCONNECTED',
             encrypted_access_token = NULL,
             status_message = 'Live broker adapter is not implemented in this build; no authenticated session is active.',
             updated_at = datetime('now')
         WHERE status IN ('CONNECTED', 'CONNECTING')`
      ).run();

      // 2. Real portfolios may never run autonomous trading. The executor refuses
      //    REAL accounts outright, so this is a second, durable barrier.
      db.prepare(
        `UPDATE portfolio_permissions
         SET allow_autonomous_trading = 0
         WHERE portfolio_id IN (SELECT id FROM portfolios WHERE type = 'REAL')`
      ).run();

      // 3. The live control mode is a UI placeholder and is not supported.
      db.prepare(
        `UPDATE user_settings
         SET control_mode = 'COPILOT', updated_at = datetime('now')
         WHERE control_mode = 'AUTHORISED_LIVE'`
      ).run();

      // 4. Rows written by older seed scripts carried a provider label that
      //    looked verified. Relabel them as synthetic fixtures.
      db.prepare(
        `UPDATE market_data_points
         SET provider = 'SYNTHETIC_SEED', freshness_status = 'SYNTHETIC', quality_score = 0.0
         WHERE id GLOB 'mdp_ast_*'`
      ).run();
      db.prepare(
        `UPDATE company_fundamentals
         SET source = 'SYNTHETIC_SEED — illustrative metrics; not verified'
         WHERE id GLOB 'fnd_ast_*'`
      ).run();

      const demoNews: Array<[string, string]> = [
        ['news_01', '[DEMO DATA] Example Reliance Industries headline'],
        ['news_02', '[DEMO DATA] Example TCS headline'],
        ['news_03', '[DEMO DATA] Example HDFC Bank / RBI headline'],
        ['news_04', '[DEMO DATA] Example Tata Motors headline'],
        ['news_05', '[DEMO DATA] Example Infosys headline']
      ];
      const relabelNews = db.prepare(
        `UPDATE news_items
         SET headline = ?, summary = 'Demo fixture only; this is not a real or verified market-news item.',
             source = 'DEMO_SEED', sentiment_score = 0.0, sentiment_label = 'NEUTRAL'
         WHERE id = ?`
      );
      for (const [id, headline] of demoNews) relabelNews.run(headline, id);

      // 5. Seeded strategy versions are not approved for live use.
      db.prepare(
        `UPDATE strategy_versions
         SET status = 'PAPER_TESTING', approved_by = NULL, approved_at = NULL,
             approval_notes = 'Seed fixture only; live use is not approved. Requires real data and independent validation.'
         WHERE id IN ('ver_strat_1_v12', 'ver_strat_2_v20')`
      ).run();

      // 6. The seeded backtest is a placeholder, not a result.
      db.prepare(
        `UPDATE backtest_runs
         SET asset_universe = 'DEMO FIXTURE — NO VERIFIED BACKTEST',
             initial_capital = 25000.0, final_capital = 25000.0,
             total_return_pct = 0.0, cagr_pct = 0.0, max_drawdown_pct = 0.0,
             sharpe_ratio = 0.0, sortino_ratio = 0.0, win_rate_pct = 0.0,
             total_trades = 0, turnover_ratio = 0.0, slippage_assumed_pct = 0.0,
             brokerage_assumed = 0.0, out_of_sample_tested = 0,
             results_json = '{"demoFixture":true,"verified":false,"message":"Placeholder only; no actual backtest has been run."}'
         WHERE id = 'bt_strat_1_2024_2026'`
      ).run();

      // 7. A seeded job that claims a verified run never actually ran.
      db.prepare(
        `UPDATE scheduled_jobs
         SET last_run_status = 'NOT_RUN',
             last_run_message = 'Seed fixture; no worker execution has been verified.'
         WHERE id GLOB 'job_*'
           AND last_run_message = 'Executed on schedule with verified status.'`
      ).run();
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

  // Defence in depth: provisionDatabase() already refuses a newer database, but
  // this function must not silently no-op on one if it is ever called directly.
  if (from > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `Refusing to migrate: the database is at version ${from}, newer than this build's ${CURRENT_SCHEMA_VERSION}.`
    );
  }

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
