import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { provisionDatabase } from './provision';

export {
  SchemaTooNewError,
  DatabaseIntegrityError,
  provisionDatabase,
  readSchemaVersion,
  assertSupportedSchemaVersion
} from './provision';

// Ensure data directory exists
const DB_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// Tests can set INVESTPILOT_DB_PATH to an isolated database so test runs never
// mutate the user's working portfolio database.
const DB_PATH = process.env.INVESTPILOT_DB_PATH
  ? path.resolve(process.env.INVESTPILOT_DB_PATH)
  : path.join(DB_DIR, 'investpilot.db');

let _db: Database.Database | null = null;

/**
 * Opens the configured database for the application.
 *
 * Order matters, and it is the whole point of this function:
 *
 *   1. open the file and set connection-level pragmas (no writes to the data);
 *   2. GUARD — refuse a database newer than this build, before any DDL;
 *   3. GUARD — refuse a database that fails `PRAGMA integrity_check`;
 *   4. only then create missing tables and apply pending migrations.
 *
 * Previously this called `initSchema()` first, which executed `schema.sql` and a
 * batch of normalisation `UPDATE`s on every open — before the integrity check
 * and with no version guard at all. Startup now never rewrites existing rows;
 * once-only data corrections live in migration v6.
 */
export function openManagedDatabase(filePath: string): Database.Database {
  const handle = new Database(filePath);
  // Connection-level settings only: these do not modify the database file.
  handle.pragma('busy_timeout = 5000');
  handle.pragma('foreign_keys = ON');

  // Throws SchemaTooNewError / DatabaseIntegrityError before any write.
  provisionDatabase(handle);

  // Applied after the guards, because changing the journal mode rewrites the
  // file header. WAL is what lets the API and worker processes run together.
  handle.pragma('journal_mode = WAL');
  handle.pragma('synchronous = NORMAL');

  return handle;
}

export function getDb(): Database.Database {
  if (!_db) {
    _db = openManagedDatabase(DB_PATH);
  }
  return _db;
}

/**
 * Opens a database without running the schema or migrations. Used only by the
 * migration-safety test, so it can exercise an "old" database before it is
 * upgraded.
 */
export function openDatabaseAt(filePath: string): Database.Database {
  const handle = new Database(filePath);
  handle.pragma('journal_mode = WAL');
  handle.pragma('foreign_keys = ON');
  handle.pragma('busy_timeout = 5000');
  return handle;
}

/**
 * Applies the base schema only (`CREATE ... IF NOT EXISTS`).
 *
 * It deliberately does NOT normalise data. That block used to live here and ran
 * on every process start; it is now migration v6, which runs once inside a
 * transaction. Kept exported because tests build "previous release" databases
 * with it.
 */
export function initSchema(db: Database.Database, schemaSql?: string) {
  const schemaPath = path.resolve(process.cwd(), 'src/db/schema.sql');
  if (schemaSql !== undefined) {
    db.exec(schemaSql);
    return;
  }
  if (fs.existsSync(schemaPath)) {
    db.exec(fs.readFileSync(schemaPath, 'utf-8'));
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
  },
  /**
   * Runs a synchronous callback inside an IMMEDIATE transaction.
   *
   * Unlike the legacy deferred `transaction` helper this acquires the write
   * lock up front, so a read made inside the callback cannot be invalidated by
   * another writer before the corresponding write commits. Financial mutations
   * MUST use this: a deferred transaction can upgrade to a write lock only if
   * no other writer moved first, and SQLite then fails or (worse) the caller
   * keeps using a snapshot read before the upgrade.
   *
   * Combined with `busy_timeout`, this serialises concurrent order execution
   * across processes as well as within one Node process.
   */
  writeTransaction<T>(fn: (db: Database.Database) => T): T {
    const database = getDb();
    const runTx = database.transaction(() => fn(database));
    return runTx.immediate();
  }
};

export default db;
