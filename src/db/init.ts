/**
 * Initialises the configured database: schema, then additive migrations.
 *
 *   npm run db:init
 *
 * This is SAFE to run against an existing database. It creates missing tables
 * and applies additive migrations; it never drops, truncates, reseeds or
 * rewrites existing rows. Seeding demo fixtures is a separate, explicit command
 * (`npm run db:seed`) and is intentionally not part of initialisation.
 *
 * The target file is `INVESTPILOT_DB_PATH` (default ./data/investpilot.db). The
 * resolved path is printed so an operator can see exactly which database was
 * touched — especially useful before running anything against a real one.
 */
import path from 'node:path';
import { getDb } from './index';
import { CURRENT_SCHEMA_VERSION } from './migrations';

function main() {
  const target = process.env.INVESTPILOT_DB_PATH
    ? path.resolve(process.env.INVESTPILOT_DB_PATH)
    : path.resolve(process.cwd(), 'data', 'investpilot.db');

  console.log(`Database target: ${target}`);

  const db = getDb();
  const version = Number(db.pragma('user_version', { simple: true }) ?? 0);

  if (version > CURRENT_SCHEMA_VERSION) {
    console.error(
      `This database is at schema version ${version}, but this build only understands ${CURRENT_SCHEMA_VERSION}. ` +
        'Refusing to run — upgrade the application instead of downgrading the data.'
    );
    process.exitCode = 1;
    return;
  }

  const integrity = db.pragma('integrity_check', { simple: true });
  if (integrity !== 'ok') {
    console.error(`Integrity check failed: ${integrity}. Take a backup before proceeding.`);
    process.exitCode = 1;
    return;
  }

  console.log(`Schema is at version ${version} (current: ${CURRENT_SCHEMA_VERSION}).`);
  console.log('Initialisation complete. No rows were modified or deleted.');
  console.log('Demo fixtures are only inserted by the explicit `npm run db:seed` command.');
}

main();
