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
