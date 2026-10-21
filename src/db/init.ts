/**
 * Initialises the configured database.
 *
 *   npm run db:init
 *
 * What it does, in order, and nothing else:
 *
 *   1. reads `user_version` and refuses a database written by a newer release
 *      (before any write at all);
 *   2. runs `PRAGMA integrity_check` and refuses a database that fails it
 *      (still before any write);
 *   3. executes `schema.sql`, which only contains `CREATE ... IF NOT EXISTS`, so
 *      it can add missing tables and indexes but never alter or drop one;
 *   4. applies pending versioned migrations, each in a single transaction.
 *
 * It never deletes, truncates or reseeds. Migrations are additive, with one
 * exception worth stating plainly: **v6 is a once-only data normalisation** that
 * relabels demo fixture rows and disables live-mode flags. On a database that is
 * already at the current version it does nothing at all.
 *
 * Demo fixtures are inserted only by the separate, explicit `npm run db:seed`.
 */
import path from 'node:path';
import Database from 'better-sqlite3';
import {
  CURRENT_SCHEMA_VERSION
} from './migrations';
import {
  DatabaseIntegrityError,
  SchemaTooNewError,
  provisionDatabase,
  readSchemaVersion
} from './provision';

function main() {
  const target = process.env.INVESTPILOT_DB_PATH
    ? path.resolve(process.env.INVESTPILOT_DB_PATH)
    : path.resolve(process.cwd(), 'data', 'investpilot.db');

  console.log(`Database target: ${target}`);

  // A file that cannot even be opened is an initialisation failure like any
  // other: report it, exit non-zero, and do not proceed. There is no handle to
  // close in this case.
  let db: Database.Database;
  try {
    db = new Database(target);
  } catch (error) {
    console.error(
      `Could not open ${target}: ${error instanceof Error ? error.message : String(error)}`
    );
    console.error('No schema change, migration or row update was performed.');
    process.exitCode = 1;
    return;
  }

  // Exactly one connection is opened here, so there is exactly one place that
  // closes it. Every exit path — success, refusal or an unexpected failure —
  // runs the `finally` block. Previously the refusal branches returned before
  // `db.close()`, leaking the descriptor and holding the file open.
  try {
    db.pragma('busy_timeout = 5000');
    db.pragma('foreign_keys = ON');

    const result = provisionDatabase(db);
    const version = readSchemaVersion(db);

    console.log(`Integrity check: ok`);
    console.log(
      `Schema version: ${result.fromVersion} -> ${result.toVersion} (this build supports up to ${CURRENT_SCHEMA_VERSION})`
    );

    if (result.applied.length === 0) {
      console.log('Migrations applied: none — the database was already at the current version.');
    } else {
      console.log('Migrations applied:');
      for (const entry of result.applied) console.log(`  - ${entry}`);
      if (result.applied.some((entry) => entry.startsWith('v6'))) {
        console.log(
          '  (v6 performs a one-time data normalisation: demo-data provenance labels and disabled live/broker flags.)'
        );
      }
    }

    console.log(
      result.baseSchemaApplied
        ? 'Base schema: executed (CREATE ... IF NOT EXISTS only; no existing table, column or index was altered or dropped).'
        : 'Base schema: skipped (src/db/schema.sql not found).'
    );
    console.log('Rows deleted or tables dropped: none.');
    console.log(`Reported version after this run: ${version}.`);
    console.log('Demo fixtures are only inserted by the explicit `npm run db:seed` command.');
  } catch (error) {
    if (error instanceof SchemaTooNewError || error instanceof DatabaseIntegrityError) {
      console.error(error.message);
      console.error('No schema change, migration or row update was performed.');
    } else {
      // An unexpected failure must be visible, but it must not skip the close.
      console.error(
        `Unexpected error during initialisation: ${error instanceof Error ? error.message : String(error)}`
      );
      if (error instanceof Error && error.stack) console.error(error.stack);
    }
    process.exitCode = 1;
  } finally {
    try {
      if (db.open) db.close();
    } catch {
      // Never replace the original failure with a close error.
    }
  }
}

main();
