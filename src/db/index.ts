import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Ensure data directory exists
const DB_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const DB_PATH = path.join(DB_DIR, 'investpilot.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    _db.pragma('synchronous = NORMAL');
    initSchema(_db);
  }
  return _db;
}

export function initSchema(db: Database.Database) {
  const schemaPath = path.resolve(process.cwd(), 'src/db/schema.sql');
  if (fs.existsSync(schemaPath)) {
    const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
    db.exec(schemaSql);

    // This codebase intentionally has no real broker authentication or order-fill
    // adapter. Downgrade any "connected" mock sessions from earlier versions so
    // they cannot be mistaken for authenticated broker connections.
    db.prepare(`
      UPDATE broker_connections
      SET status = 'DISCONNECTED',
          encrypted_access_token = NULL,
          status_message = 'Live broker adapter is not implemented in this build; no authenticated session is active.',
          updated_at = datetime('now')
      WHERE status IN ('CONNECTED', 'CONNECTING')
    `).run();
    db.prepare(`
      UPDATE portfolio_permissions
      SET allow_autonomous_trading = 0
      WHERE portfolio_id IN (SELECT id FROM portfolios WHERE type = 'REAL')
    `).run();
    db.prepare(`
      UPDATE user_settings
      SET control_mode = CASE
            WHEN control_mode = 'AUTHORISED_LIVE' THEN 'COPILOT'
            ELSE control_mode
          END,
          updated_at = datetime('now')
    `).run();
    // Relabel the known seeded fixture rows from old versions, even if the
    // operator does not rerun the seed script after upgrading.
    db.prepare(`
      UPDATE market_data_points
      SET provider = 'SYNTHETIC_SEED', freshness_status = 'SYNTHETIC', quality_score = 0.0
      WHERE id GLOB 'mdp_ast_*'
    `).run();
    db.prepare(`
      UPDATE company_fundamentals
      SET source = 'SYNTHETIC_SEED — illustrative metrics; not verified'
      WHERE id GLOB 'fnd_ast_*'
    `).run();
    const demoNews = [
      ['news_01', '[DEMO DATA] Example Reliance Industries headline'],
      ['news_02', '[DEMO DATA] Example TCS headline'],
      ['news_03', '[DEMO DATA] Example HDFC Bank / RBI headline'],
      ['news_04', '[DEMO DATA] Example Tata Motors headline'],
      ['news_05', '[DEMO DATA] Example Infosys headline']
    ];
    const relabelNews = db.prepare(`
      UPDATE news_items
      SET headline = ?, summary = 'Demo fixture only; this is not a real or verified market-news item.',
          source = 'DEMO_SEED', sentiment_score = 0.0, sentiment_label = 'NEUTRAL'
      WHERE id = ?
    `);
    for (const [id, headline] of demoNews) relabelNews.run(headline, id);

    db.prepare(`
      UPDATE strategy_versions
      SET status = 'PAPER_TESTING', approved_by = NULL, approved_at = NULL,
          approval_notes = 'Seed fixture only; live use is not approved. Requires real data and independent validation.'
      WHERE id IN ('ver_strat_1_v12', 'ver_strat_2_v20')
    `).run();
    db.prepare(`
      UPDATE backtest_runs
      SET asset_universe = 'DEMO FIXTURE — NO VERIFIED BACKTEST',
          initial_capital = 25000.0, final_capital = 25000.0,
          total_return_pct = 0.0, cagr_pct = 0.0, max_drawdown_pct = 0.0,
          sharpe_ratio = 0.0, sortino_ratio = 0.0, win_rate_pct = 0.0,
          total_trades = 0, turnover_ratio = 0.0, slippage_assumed_pct = 0.0,
          brokerage_assumed = 0.0, out_of_sample_tested = 0,
          results_json = '{"demoFixture":true,"verified":false,"message":"Placeholder only; no actual backtest has been run."}'
      WHERE id = 'bt_strat_1_2024_2026'
    `).run();
    db.prepare(`
      UPDATE scheduled_jobs
      SET last_run_status = 'NOT_RUN',
          last_run_message = 'Seed fixture; no worker execution has been verified.'
      WHERE id GLOB 'job_*'
        AND last_run_message = 'Executed on schedule with verified status.'
    `).run();
  }
}

// Helpers for clean querying
export const db = {
  get: getDb,
  query<T = any>(sql: string, params: any[] = []): T[] {
    const stmt = getDb().prepare(sql);
    return stmt.all(...params) as T[];
  },
  queryOne<T = any>(sql: string, params: any[] = []): T | undefined {
    const stmt = getDb().prepare(sql);
    return stmt.get(...params) as T | undefined;
  },
  execute(sql: string, params: any[] = []): Database.RunResult {
    const stmt = getDb().prepare(sql);
    return stmt.run(...params);
  },
  transaction<T>(fn: (db: Database.Database) => T): T {
    const database = getDb();
    const runTx = database.transaction(() => fn(database));
    return runTx();
  }
};

export default db;
