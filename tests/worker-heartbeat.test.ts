import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import db from '../src/db';
import { buildWorkerStatus } from '../src/lib/worker/status';
import { writeHeartbeat, readHeartbeats } from '../src/lib/worker/heartbeat';
import { workerScheduler, categorizeError } from '../src/lib/worker/scheduler';

/**
 * Worker liveness, staleness and overlap protection.
 *
 * The API process and the worker daemon share only the database, so a heartbeat
 * row is the only honest liveness signal. These tests assert that the status
 * never upgrades itself to "running" without one, and that two workers cannot
 * run the same job at the same time.
 */

function clearHeartbeats() {
  db.execute('DELETE FROM worker_heartbeats');
}

function utcSqlite(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

beforeAll(() => {
  clearHeartbeats();
});

afterEach(() => {
  clearHeartbeats();
  db.execute("UPDATE scheduled_jobs SET locked_by = NULL, locked_at = NULL");
});

afterAll(() => {
  clearHeartbeats();
});

describe('worker heartbeat reporting', () => {
  it('reports UNKNOWN when nothing has ever registered', () => {
    const report = buildWorkerStatus({ inProcessRunning: false, jobs: [], heartbeats: [], now: 1_000_000 });
    expect(report.status).toBe('UNKNOWN');
    expect(report.heartbeat).toBeNull();
  });

  it('reports RUNNING_EXTERNAL for a fresh heartbeat', () => {
    const now = Date.now();
    writeHeartbeat({ workerId: 'wrk_test_1', intervalSeconds: 30, now: new Date(now) });

    const report = buildWorkerStatus({ inProcessRunning: false, jobs: [], now });
    expect(report.status).toBe('RUNNING_EXTERNAL');
    expect(report.heartbeat?.workerId).toBe('wrk_test_1');
    expect(report.summary).toMatch(/heartbeat/i);
  });

  it('reports STALE once the beat is older than three intervals', () => {
    const now = Date.parse('2026-10-21T12:00:00Z');
    const report = buildWorkerStatus({
      inProcessRunning: false,
      jobs: [],
      now,
      heartbeats: [
        {
          worker_id: 'wrk_stale',
          status: 'RUNNING',
          host: 'test',
          pid: 1,
          interval_seconds: 30,
          started_at: utcSqlite(new Date(now - 3_600_000)),
          last_beat_at: utcSqlite(new Date(now - 600_000))
        }
      ]
    });
    expect(report.status).toBe('STALE');
    expect(report.heartbeat?.ageSeconds).toBe(600);
    expect(report.summary).toMatch(/cannot be confirmed/i);
  });

  it('reports STOPPED after a graceful shutdown', () => {
    const now = Date.parse('2026-10-21T12:00:00Z');
    const report = buildWorkerStatus({
      inProcessRunning: false,
      jobs: [],
      now,
      heartbeats: [
        {
          worker_id: 'wrk_stopped',
          status: 'STOPPED',
          host: 'test',
          pid: 1,
          interval_seconds: 30,
          started_at: utcSqlite(new Date(now - 3_600_000)),
          last_beat_at: utcSqlite(new Date(now - 60_000))
        }
      ]
    });
    expect(report.status).toBe('STOPPED');
  });

  it('never upgrades stale job history into a running claim', () => {
    const now = Date.parse('2026-10-21T12:00:00Z');
    const report = buildWorkerStatus({
      inProcessRunning: false,
      now,
      heartbeats: [],
      jobs: [
        {
          job_name: 'market_session_monitor',
          interval_seconds: 30,
          last_run_at: utcSqlite(new Date(now - 5_000)),
          last_run_status: 'SUCCESS'
        }
      ]
    });
    expect(report.status).toBe('UNKNOWN');
    expect(report.evidence.recentlyActive).toBe(true);
  });

  it('prefers the in-process scheduler flag over any heartbeat', () => {
    const report = buildWorkerStatus({
      inProcessRunning: true,
      jobs: [],
      heartbeats: [
        {
          worker_id: 'wrk_other',
          status: 'STOPPED',
          host: 'test',
          pid: 2,
          interval_seconds: 30,
          started_at: utcSqlite(new Date()),
          last_beat_at: utcSqlite(new Date())
        }
      ]
    });
    expect(report.status).toBe('RUNNING_IN_PROCESS');
  });

  it('writes and reads a heartbeat row', () => {
    writeHeartbeat({ workerId: 'wrk_roundtrip', intervalSeconds: 45 });
    const rows = readHeartbeats();
    expect(rows.some((row) => row.worker_id === 'wrk_roundtrip')).toBe(true);
    expect(rows.find((row) => row.worker_id === 'wrk_roundtrip')?.interval_seconds).toBe(45);
  });
});

describe('overlapping job protection', () => {
  it('refuses to run a job another worker has locked', async () => {
    db.execute(
      "UPDATE scheduled_jobs SET locked_by = 'wrk_other', locked_at = datetime('now') WHERE job_name = 'market_session_monitor'"
    );

    const result = await workerScheduler.runJob('market_session_monitor');
    expect(result.success).toBe(false);
    expect(result.skipped).toBe(true);
    expect(String(result.error)).toMatch(/already running/i);
  });

  it('reclaims a lock left behind by a crashed worker', async () => {
    db.execute(
      `UPDATE scheduled_jobs
       SET locked_by = 'wrk_dead', locked_at = datetime('now', '-2 hours')
       WHERE job_name = 'market_session_monitor'`
    );

    const result = await workerScheduler.runJob('market_session_monitor');
    expect(result.success).toBe(true);
  });

  it('releases the lock after a job finishes', async () => {
    await workerScheduler.runJob('market_session_monitor');
    const row = db.queryOne<{ locked_by: string | null }>(
      "SELECT locked_by FROM scheduled_jobs WHERE job_name = 'market_session_monitor'"
    )!;
    expect(row.locked_by).toBeNull();
  });

  it('records a failure category instead of only free text', () => {
    // Categorisation is pure, so assert it directly rather than corrupting a job
    // row just to force a failure.
    expect(categorizeError(new Error('SQLITE_BUSY: database is locked'))).toBe('DATABASE_LOCKED');
    expect(categorizeError(new Error('no such table: nope'))).toBe('DATABASE_ERROR');
    expect(categorizeError(new Error('fetch failed'))).toBe('NETWORK_ERROR');
    expect(categorizeError(new Error('something odd'))).toBe('UNKNOWN');
  });
});

describe('reconciliation safety', () => {
  it('audits a cash discrepancy instead of silently rewriting it', async () => {
    const portfolioId = 'port_virt_01';
    const before = db.queryOne<{ current_cash: number }>(
      'SELECT current_cash FROM portfolios WHERE id = ?',
      [portfolioId]
    )!;

    // Introduce a deliberate one-rupee discrepancy.
    db.execute('UPDATE portfolios SET current_cash = current_cash + 1 WHERE id = ?', [portfolioId]);
    db.execute("DELETE FROM audit_logs WHERE action_type = 'CASH_RECONCILED' AND portfolio_id = ?", [
      portfolioId
    ]);

    const result = await workerScheduler.runJob('order_reconciliation_engine');
    expect(result.success).toBe(true);

    const after = db.queryOne<{ current_cash: number }>(
      'SELECT current_cash FROM portfolios WHERE id = ?',
      [portfolioId]
    )!;
    expect(after.current_cash).toBe(before.current_cash);

    const audit = db.queryOne<{ details: string }>(
      "SELECT details FROM audit_logs WHERE action_type = 'CASH_RECONCILED' AND portfolio_id = ?",
      [portfolioId]
    );
    expect(audit).toBeDefined();
    expect(audit?.details).toMatch(/reconciliation adjusted simulated cash/i);
  });

  it('never rewrites a REAL portfolio during reconciliation', async () => {
    const realBefore = db.queryOne<{ current_cash: number }>(
      "SELECT current_cash FROM portfolios WHERE id = 'port_real_01'"
    )!;
    await workerScheduler.runJob('order_reconciliation_engine');
    const realAfter = db.queryOne<{ current_cash: number }>(
      "SELECT current_cash FROM portfolios WHERE id = 'port_real_01'"
    )!;
    expect(realAfter.current_cash).toBe(realBefore.current_cash);
  });
});
