import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { openDatabaseAt, openManagedDatabase } from '../src/db';
import {
  DatabaseIntegrityError,
  SchemaTooNewError,
  applyBaseSchema,
  provisionDatabase,
  readSchemaVersion
} from '../src/db/provision';
import { CURRENT_SCHEMA_VERSION, runMigrations } from '../src/db/migrations';

/**
 * Database initialisation safety.
 *
 * The previous startup path executed `schema.sql` and then a batch of
 * normalisation `UPDATE`s on every open, *before* checking the file's integrity
 * and with no version guard. These tests pin the corrected contract on isolated
 * databases, so they can destroy whatever they like:
 *
 *   1. a database newer than this build is refused, with no schema or row change;
 *   2. an integrity-check failure causes no migration writes;
 *   3. a supported upgrade preserves every existing row and value;
 *   4. repeated initialisation is safe and changes nothing after the first run;
 *   5. the normal application startup path applies the same guards and stops
 *      rewriting rows on every open.
 *
 * The integrity-failure case injects the checker. Deliberately corrupting a
 * SQLite file to make `integrity_check` fail is not reproducible (SQLite often
 * reports page-level damage only for specific byte patterns), so the test drives
 * the same code path with the same failure result instead of pretending to
 * simulate bit rot.
 */

const tempFiles: string[] = [];

function tempDatabaseFile(): string {
  const file = path.join(
    os.tmpdir(),
    `investpilot-init-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
  );
  tempFiles.push(file);
  return file;
}

/** Every table/index definition, plus every row's contents, for comparison. */
function snapshot(db: Database.Database): {
  schema: Array<{ type: string; name: string; sql: string | null }>;
  version: number;
} {
  return {
    schema: db
      .prepare("SELECT type, name, sql FROM sqlite_master ORDER BY type, name")
      .all() as Array<{ type: string; name: string; sql: string | null }>,
    version: readSchemaVersion(db)
  };
}

function tableExists(db: Database.Database, name: string): boolean {
  return Boolean(
    db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name)
  );
}

afterAll(() => {
  for (const file of tempFiles) {
    for (const suffix of ['', '-wal', '-shm', '-journal']) {
      fs.rmSync(file + suffix, { force: true });
    }
  }
});

describe('a newer schema version is refused before any write', () => {
  it('leaves the schema, the rows and the version untouched', () => {
    const file = tempDatabaseFile();
    const raw = new Database(file);
    raw.exec(`
      CREATE TABLE sentinel (id TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO sentinel (id, value) VALUES ('keep', 'exactly this');
    `);
    raw.pragma(`user_version = ${CURRENT_SCHEMA_VERSION + 1}`);

    const before = snapshot(raw);
    const rowsBefore = raw.prepare('SELECT * FROM sentinel').all();

    expect(() => provisionDatabase(raw)).toThrow(SchemaTooNewError);

    expect(snapshot(raw)).toEqual(before);
    expect(raw.prepare('SELECT * FROM sentinel').all()).toEqual(rowsBefore);
    // Proof that schema.sql never ran: a table only it creates is still absent.
    expect(tableExists(raw, 'worker_heartbeats')).toBe(false);
    raw.close();
  });

  it('refuses the same database through the application startup path', () => {
    const file = tempDatabaseFile();
    const setup = new Database(file);
    setup.exec(`CREATE TABLE sentinel (id TEXT PRIMARY KEY, value TEXT); INSERT INTO sentinel VALUES ('a','b');`);
    setup.pragma(`user_version = ${CURRENT_SCHEMA_VERSION + 5}`);
    const before = snapshot(setup);
    setup.close();

    expect(() => openManagedDatabase(file)).toThrow(SchemaTooNewError);

    const after = new Database(file);
    expect(snapshot(after)).toEqual(before);
    expect(tableExists(after, 'worker_heartbeats')).toBe(false);
    after.close();
  });

  it('also refuses a downgrade attempt from inside the migration runner', () => {
    const file = tempDatabaseFile();
    const raw = new Database(file);
    raw.pragma(`user_version = ${CURRENT_SCHEMA_VERSION + 1}`);
    expect(() => runMigrations(raw)).toThrow(/Refusing to migrate/i);
    expect(readSchemaVersion(raw)).toBe(CURRENT_SCHEMA_VERSION + 1);
    raw.close();
  });
});

describe('a failed integrity check causes no migration writes', () => {
  it('writes nothing at all, not even the base schema', () => {
    const file = tempDatabaseFile();
    const raw = new Database(file);
    raw.exec(`
      CREATE TABLE sentinel (id TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO sentinel (id, value) VALUES ('keep', 'untouched');
    `);
    raw.pragma('user_version = 0');

    const before = snapshot(raw);
    const rowsBefore = raw.prepare('SELECT * FROM sentinel').all();

    expect(() =>
      provisionDatabase(raw, { integrityCheck: () => 'database disk image is malformed' })
    ).toThrow(DatabaseIntegrityError);

    expect(snapshot(raw)).toEqual(before);
    expect(raw.prepare('SELECT * FROM sentinel').all()).toEqual(rowsBefore);
    expect(readSchemaVersion(raw)).toBe(0);
    expect(tableExists(raw, 'portfolios')).toBe(false);
    raw.close();
  });

  it('does not apply the pending data normalisation when the check fails', () => {
    const file = tempDatabaseFile();
    const raw = new Database(file);
    applyBaseSchema(raw);
    raw.pragma('user_version = 5');

    raw.exec(`
      INSERT INTO users (id, email, name) VALUES ('usr_g', 'g@test.invalid', 'G');
      INSERT INTO user_settings (id, user_id, control_mode)
        VALUES ('set_g', 'usr_g', 'AUTHORISED_LIVE');
      INSERT INTO broker_connections (id, user_id, broker_name, client_id, api_key_masked, status)
        VALUES ('brk_g', 'usr_g', 'ZERODHA', 'client', 'masked', 'CONNECTED');
    `);

    expect(() =>
      provisionDatabase(raw, { integrityCheck: () => 'row missing from index' })
    ).toThrow(DatabaseIntegrityError);

    // v6 did not run: the live flags are exactly as they were.
    const settings = raw.prepare('SELECT control_mode FROM user_settings WHERE id = ?').get('set_g') as {
      control_mode: string;
    };
    const broker = raw.prepare('SELECT status FROM broker_connections WHERE id = ?').get('brk_g') as {
      status: string;
    };
    expect(settings.control_mode).toBe('AUTHORISED_LIVE');
    expect(broker.status).toBe('CONNECTED');
    expect(readSchemaVersion(raw)).toBe(5);
    raw.close();
  });
});

describe('a supported upgrade preserves existing rows and values', () => {
  it('normalises demo labels once without touching a user portfolio', () => {
    const file = tempDatabaseFile();
    const raw = new Database(file);
    applyBaseSchema(raw);
    // A database written by the previous release.
    raw.pragma('user_version = 5');

    raw.exec(`
      INSERT INTO users (id, email, name) VALUES ('usr_up', 'up@test.invalid', 'Up');
      INSERT INTO portfolios
        (id, user_id, type, name, currency, initial_capital, current_cash, invested_value, total_value, realised_pnl)
        VALUES ('port_up', 'usr_up', 'VIRTUAL', 'My real portfolio name', 'INR', 25000, 23456.78, 1543.22, 25000, 12.34);
      INSERT INTO portfolio_permissions
        (id, portfolio_id, max_position_pct, allow_autonomous_trading)
        VALUES ('perm_up', 'port_up', 12.5, 1);
      INSERT INTO assets (id, symbol, name, exchange, sector)
        VALUES ('ast_up', 'UPX', 'Up Ltd', 'NSE', 'Testing');
      INSERT INTO market_data_points
        (id, asset_id, timestamp, open, high, low, close, volume, provider, freshness_status)
        VALUES ('mdp_ast_up_2026-01-01', 'ast_up', '2026-01-01', 100, 101, 99, 100.5, 1000, 'NSE_EOD_VERIFIED', 'LIVE');
      INSERT INTO broker_connections (id, user_id, broker_name, client_id, api_key_masked, status, encrypted_access_token)
        VALUES ('brk_up', 'usr_up', 'ZERODHA', 'client', 'masked', 'CONNECTED', 'token');
      INSERT INTO user_settings (id, user_id, control_mode) VALUES ('set_up', 'usr_up', 'AUTHORISED_LIVE');
    `);

    const result = provisionDatabase(raw);

    expect(result.fromVersion).toBe(5);
    expect(result.toVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.applied.some((entry) => entry.startsWith('v6'))).toBe(true);

    // User-owned values survive exactly.
    const portfolio = raw
      .prepare('SELECT name, current_cash, invested_value, realised_pnl FROM portfolios WHERE id = ?')
      .get('port_up') as Record<string, unknown>;
    expect(portfolio).toEqual({
      name: 'My real portfolio name',
      current_cash: 23456.78,
      invested_value: 1543.22,
      realised_pnl: 12.34
    });

    const permissions = raw
      .prepare('SELECT max_position_pct, allow_autonomous_trading FROM portfolio_permissions WHERE id = ?')
      .get('perm_up') as Record<string, unknown>;
    expect(permissions.max_position_pct).toBe(12.5);

    // Fixture labels are corrected, once.
    const point = raw
      .prepare('SELECT provider, freshness_status FROM market_data_points WHERE id = ?')
      .get('mdp_ast_up_2026-01-01') as Record<string, string>;
    expect(point).toEqual({ provider: 'SYNTHETIC_SEED', freshness_status: 'SYNTHETIC' });

    // Unsupported live states are cleared.
    expect(
      (raw.prepare('SELECT status FROM broker_connections WHERE id = ?').get('brk_up') as { status: string })
        .status
    ).toBe('DISCONNECTED');
    expect(
      (raw.prepare('SELECT control_mode FROM user_settings WHERE id = ?').get('set_up') as {
        control_mode: string;
      }).control_mode
    ).toBe('COPILOT');

    expect(raw.pragma('foreign_key_check')).toEqual([]);
    raw.close();
  });
});

describe('repeated initialisation is safe', () => {
  it('applies nothing the second time and changes no row', () => {
    const file = tempDatabaseFile();
    const raw = new Database(file);

    const first = provisionDatabase(raw);
    expect(first.fromVersion).toBe(0);
    expect(first.toVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(first.applied.length).toBeGreaterThan(0);

    raw.exec(`
      INSERT INTO users (id, email, name) VALUES ('usr_idem', 'idem@test.invalid', 'Idem');
      INSERT INTO user_settings (id, user_id, control_mode) VALUES ('set_idem', 'usr_idem', 'COPILOT');
    `);

    const schemaBefore = snapshot(raw);
    const userRowsBefore = raw.prepare('SELECT * FROM users ORDER BY id').all();
    const settingsRowsBefore = raw.prepare('SELECT * FROM user_settings ORDER BY id').all();

    const second = provisionDatabase(raw);
    const third = provisionDatabase(raw);

    expect(second.applied).toEqual([]);
    expect(second.fromVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(second.toVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(third.applied).toEqual([]);
    expect(snapshot(raw)).toEqual(schemaBefore);
    expect(raw.prepare('SELECT * FROM users ORDER BY id').all()).toEqual(userRowsBefore);
    expect(raw.prepare('SELECT * FROM user_settings ORDER BY id').all()).toEqual(settingsRowsBefore);
    raw.close();
  });

  it('reopening through the application path does not rewrite rows on startup', () => {
    const file = tempDatabaseFile();
    const first = openManagedDatabase(file);
    first.exec(`
      INSERT INTO users (id, email, name) VALUES ('usr_reopen', 're@test.invalid', 'Re');
      INSERT INTO user_settings (id, user_id, control_mode) VALUES ('set_reopen', 'usr_reopen', 'CO_PILOT_LEGACY');
      INSERT INTO broker_connections (id, user_id, broker_name, client_id, api_key_masked, status)
        VALUES ('brk_reopen', 'usr_reopen', 'UPSTOX', 'client', 'masked', 'CONNECTED');
    `);
    const settingsBefore = first.prepare('SELECT * FROM user_settings WHERE id = ?').get('set_reopen');
    const brokerBefore = first.prepare('SELECT * FROM broker_connections WHERE id = ?').get('brk_reopen');
    first.close();

    // Second and third opens: provisioning is a no-op, and startup must not
    // "helpfully" rewrite the operator's rows. Only the versioned migration may
    // do that, and it already ran.
    const second = openManagedDatabase(file);
    expect(second.prepare('SELECT * FROM user_settings WHERE id = ?').get('set_reopen')).toEqual(settingsBefore);
    expect(second.prepare('SELECT * FROM broker_connections WHERE id = ?').get('brk_reopen')).toEqual(brokerBefore);
    expect(readSchemaVersion(second)).toBe(CURRENT_SCHEMA_VERSION);
    second.close();

    const third = new Database(file);
    expect(third.prepare('SELECT * FROM broker_connections WHERE id = ?').get('brk_reopen')).toEqual(brokerBefore);
    third.close();
  });

  it('never runs against the user portfolio database', () => {
    const configured = process.env.INVESTPILOT_DB_PATH ?? '';
    expect(path.basename(configured)).toBe('investpilot.test.db');
    expect(path.resolve(configured)).not.toBe(path.resolve(process.cwd(), 'data', 'investpilot.db'));
    // openDatabaseAt is the "no provisioning" opener this suite relies on.
    const probe = openDatabaseAt(tempDatabaseFile());
    expect(tableExists(probe, 'users')).toBe(false);
    probe.close();
  });
});
