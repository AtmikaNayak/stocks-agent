import type Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { CURRENT_SCHEMA_VERSION, runMigrations } from './migrations';

/**
 * Guarded database provisioning.
 *
 * Every path that opens the application database — API process, worker daemon,
 * `npm run db:init`, tests — goes through `provisionDatabase()`. It exists
 * because the previous startup path did the opposite of what its documentation
 * claimed: it executed `schema.sql` and then ran a batch of data-normalisation
 * `UPDATE`s on *every* open, before checking anything. A database written by a
 * newer release, or a corrupt one, would have had DDL and row updates applied to
 * it before anyone noticed.
 *
 * The order below is deliberate and is the contract the tests pin:
 *
 *   1. read `user_version`                (read only)
 *   2. refuse a version newer than this build          (no writes at all)
 *   3. run `PRAGMA integrity_check`                    (read only)
 *   4. refuse a database that fails it                 (no writes at all)
 *   5. apply the base schema (`CREATE ... IF NOT EXISTS`)
 *   6. apply pending migrations, each in its own transaction
 *
 * Steps 1–4 issue no writes, so a refusal leaves the file byte-for-byte
 * unchanged in content: no tables created, no rows touched, `user_version`
 * untouched. A refused database is one the operator must deal with, not one that
 * should be half-provisioned.
 */

/** Thrown when the database was written by a newer release than this build. */
export class SchemaTooNewError extends Error {
  readonly databaseVersion: number;
  readonly supportedVersion: number;

  constructor(databaseVersion: number, supportedVersion: number) {
    super(
      `The database is at schema version ${databaseVersion}, but this build only understands ${supportedVersion}. ` +
        'Refusing to open it: downgrading the data would be destructive. Upgrade the application instead.'
    );
    this.name = 'SchemaTooNewError';
    this.databaseVersion = databaseVersion;
    this.supportedVersion = supportedVersion;
  }
}

/** Thrown when `PRAGMA integrity_check` does not report `ok`. */
export class DatabaseIntegrityError extends Error {
  readonly detail: string;

  constructor(detail: string) {
    super(
      `The database failed an integrity check (${detail}). Refusing to run any migration or schema change; ` +
        'restore from a backup before continuing.'
    );
    this.name = 'DatabaseIntegrityError';
    this.detail = detail;
  }
}

export type IntegrityChecker = (db: Database.Database) => string;

export interface ProvisionOptions {
  /** Injected only by tests, to simulate a database that fails the check. */
  integrityCheck?: IntegrityChecker;
  /** Injected only by tests, to supply schema SQL without touching disk. */
  schemaSql?: string;
  /** Injected only by tests, to prove reporting without the real file. */
  schemaPath?: string;
}

export interface ProvisionResult {
  fromVersion: number;
  toVersion: number;
  applied: string[];
  /** True when `schema.sql` was executed (it is idempotent DDL either way). */
  baseSchemaApplied: boolean;
  integrity: 'ok';
}

export function readSchemaVersion(db: Database.Database): number {
  const value = Number(db.pragma('user_version', { simple: true }) ?? 0);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

/**
 * Refuses a database newer than this build.
 *
 * Runs before any schema SQL, migration or update. A newer database may contain
 * columns or rows this build does not understand; writing to it with an older
 * schema contract is how data gets silently damaged.
 */
export function assertSupportedSchemaVersion(db: Database.Database): number {
  const version = readSchemaVersion(db);
  if (version > CURRENT_SCHEMA_VERSION) {
    throw new SchemaTooNewError(version, CURRENT_SCHEMA_VERSION);
  }
  return version;
}

/**
 * Default checker: the full `PRAGMA integrity_check`, not `quick_check`, because
 * this runs once per process start and a cheap check is not the point.
 */
export function defaultIntegrityCheck(db: Database.Database): string {
  const rows = db.pragma('integrity_check') as Array<{ integrity_check: string }>;
  const messages = rows.map((row) => String(row.integrity_check));
  if (messages.length === 1 && messages[0] === 'ok') return 'ok';
  return messages.join('; ') || 'integrity_check returned no result';
}

/** Refuses a database that fails the integrity check. Issues no writes. */
export function assertDatabaseIntegrity(
  db: Database.Database,
  checker: IntegrityChecker = defaultIntegrityCheck
): void {
  const result = checker(db);
  if (result !== 'ok') {
    throw new DatabaseIntegrityError(result);
  }
}

/**
 * Executes the base schema (all `CREATE ... IF NOT EXISTS`).
 *
 * This can create missing tables and indexes. It cannot alter or drop an
 * existing object, which is why every column change lives in `migrations.ts`.
 */
export function applyBaseSchema(
  db: Database.Database,
  schemaSql?: string,
  schemaPath?: string
): boolean {
  const resolved = schemaPath ?? path.resolve(process.cwd(), 'src/db/schema.sql');
  const sql = schemaSql ?? (fs.existsSync(resolved) ? fs.readFileSync(resolved, 'utf-8') : null);
  if (!sql) return false;
  db.exec(sql);
  return true;
}

/**
 * The one supported provisioning path: guard, check, create, migrate.
 *
 * Never drops, truncates, deletes or reseeds. Data normalisation lives in
 * versioned migrations so it runs once, inside a transaction, at a recorded
 * version — not on every process start.
 */
export function provisionDatabase(
  db: Database.Database,
  options: ProvisionOptions = {}
): ProvisionResult {
  // 1 & 2 — read the version and refuse an unsupported one before doing anything.
  const fromVersion = assertSupportedSchemaVersion(db);

  // 3 & 4 — verify the file before writing to it.
  assertDatabaseIntegrity(db, options.integrityCheck);

  // 5 — create anything missing (no existing object is altered).
  const baseSchemaApplied = applyBaseSchema(db, options.schemaSql, options.schemaPath);

  // 6 — additive, transactional, versioned.
  const migration = runMigrations(db);

  return {
    fromVersion,
    toVersion: migration.to,
    applied: migration.applied,
    baseSchemaApplied,
    integrity: 'ok'
  };
}
