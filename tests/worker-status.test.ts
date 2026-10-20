import { describe, it, expect, beforeAll } from 'vitest';
import db from '../src/db';
import { GET as getSystem } from '../src/app/api/system/route';
import { workerScheduler } from '../src/lib/worker/scheduler';
import { MIN_OBSERVATION_WINDOW_SECONDS, buildWorkerStatus, parseSqliteUtc } from '../src/lib/worker/status';
import { USER_A, ensureAllFixtures, sessionCookie } from './helpers/auth-fixtures';

const BASE = 'http://localhost';

function systemRequest(userId: string): Request {
  return new Request(`${BASE}/api/system`, { headers: { cookie: sessionCookie(userId) } });
}

function utcSqlite(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

beforeAll(() => {
  ensureAllFixtures();
});

describe('worker status reporting', () => {
  it('never claims the worker is running when the scheduler is stopped', async () => {
    expect(workerScheduler.isRunning).toBe(false);

    const response = await getSystem(systemRequest(USER_A.id));
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.workerStatus.status).not.toBe('RUNNING_IN_PROCESS');
    expect(body.workerStatus.status).toBe('UNKNOWN');
    expect(body.workerStatus.inProcessSchedulerRunning).toBe(false);
    // The previous payload forced `isRunning: true`; that field must be gone.
    expect(body.workerStatus.isRunning).toBeUndefined();
    expect(body.workerStatus.summary).toMatch(/not running in this server process/i);
  });

  it('reports RUNNING_IN_PROCESS only from the real scheduler flag', () => {
    const stopped = buildWorkerStatus({ inProcessRunning: false, jobs: [], now: 1_000_000 });
    expect(stopped.status).toBe('UNKNOWN');
    expect(stopped.inProcessSchedulerRunning).toBe(false);

    const running = buildWorkerStatus({ inProcessRunning: true, jobs: [], now: 1_000_000 });
    expect(running.status).toBe('RUNNING_IN_PROCESS');
    expect(running.summary).toMatch(/running inside this server process/i);
  });

  it('treats recent job activity as evidence, not as a running claim', () => {
    const now = Date.parse('2026-10-20T12:00:00Z');
    const jobs = [
      {
        job_name: 'market_session_monitor',
        interval_seconds: 30,
        last_run_at: utcSqlite(new Date(now - 20_000)),
        last_run_status: 'SUCCESS'
      }
    ];

    const report = buildWorkerStatus({ inProcessRunning: false, jobs, now });
    expect(report.status).toBe('UNKNOWN');
    expect(report.evidence.recentlyActive).toBe(true);
    expect(report.evidence.lastJobRunAt).toBe(new Date(now - 20_000).toISOString());
    expect(report.evidence.lastJobRunStatus).toBe('SUCCESS');
    expect(report.summary).toMatch(/cannot be confirmed/i);
  });

  it('does not treat old job activity as recent', () => {
    const now = Date.parse('2026-10-20T12:00:00Z');
    const jobs = [
      {
        job_name: 'order_reconciliation_engine',
        interval_seconds: 3600,
        last_run_at: utcSqlite(new Date(now - 6 * 3600 * 1000)),
        last_run_status: 'SUCCESS'
      }
    ];

    const report = buildWorkerStatus({ inProcessRunning: false, jobs, now });
    expect(report.status).toBe('UNKNOWN');
    expect(report.evidence.recentlyActive).toBe(false);
    expect(report.summary).toMatch(/no recent activity was observed/i);
  });

  it('reports unknown when no job has ever run', () => {
    const report = buildWorkerStatus({ inProcessRunning: false, jobs: [], now: 1_000_000 });
    expect(report.status).toBe('UNKNOWN');
    expect(report.evidence.lastJobRunAt).toBeNull();
    expect(report.evidence.recentlyActive).toBe(false);
    expect(report.evidence.observationWindowSeconds).toBeGreaterThanOrEqual(
      MIN_OBSERVATION_WINDOW_SECONDS
    );
    expect(report.summary).toMatch(/unknown/i);
  });

  it('ignores a future-dated run instead of treating it as proof of life', () => {
    const now = Date.parse('2026-10-20T12:00:00Z');
    const jobs = [
      {
        job_name: 'clock_skew',
        interval_seconds: 60,
        last_run_at: utcSqlite(new Date(now + 10 * 60 * 1000)),
        last_run_status: 'SUCCESS'
      }
    ];
    const report = buildWorkerStatus({ inProcessRunning: false, jobs, now });
    expect(report.evidence.recentlyActive).toBe(false);
    expect(report.status).toBe('UNKNOWN');
  });

  it('caps the evidence window so long-interval jobs cannot look recent', () => {
    const now = Date.parse('2026-10-20T12:00:00Z');
    const report = buildWorkerStatus({
      inProcessRunning: false,
      now,
      jobs: [
        {
          job_name: 'strategist_thesis_review',
          interval_seconds: 86_400,
          last_run_at: utcSqlite(new Date(now - 3 * 86_400 * 1000)),
          last_run_status: 'SUCCESS'
        }
      ]
    });
    expect(report.evidence.observationWindowSeconds).toBeLessThanOrEqual(900);
    expect(report.evidence.recentlyActive).toBe(false);
  });

  it('does not treat seed placeholders (NOT_RUN) as a recorded run', () => {
    const now = Date.parse('2026-10-20T12:00:00Z');
    const report = buildWorkerStatus({
      inProcessRunning: false,
      now,
      jobs: [
        {
          job_name: 'portfolio_valuation_worker',
          interval_seconds: 60,
          last_run_at: utcSqlite(new Date(now - 5_000)),
          last_run_status: 'NOT_RUN'
        }
      ]
    });
    expect(report.evidence.lastJobRunAt).toBeNull();
    expect(report.evidence.recentlyActive).toBe(false);
    expect(report.summary).toMatch(/unknown/i);
  });

  it('parses SQLite timestamps as UTC, not local time', () => {
    expect(parseSqliteUtc('2026-10-20 12:00:00')).toBe(Date.parse('2026-10-20T12:00:00Z'));
    expect(parseSqliteUtc('2026-10-20T12:00:00Z')).toBe(Date.parse('2026-10-20T12:00:00Z'));
    expect(parseSqliteUtc(null)).toBeNull();
    expect(parseSqliteUtc('')).toBeNull();
    expect(parseSqliteUtc('not-a-timestamp')).toBeNull();
  });

  it('reads left-over job state from the database without a DB-seeded claim', async () => {
    // A recorded run must still not upgrade the status while the scheduler is stopped.
    db.execute(
      "UPDATE scheduled_jobs SET last_run_at = datetime('now'), last_run_status = 'SUCCESS' WHERE job_name = 'market_session_monitor'"
    );

    const body = await (await getSystem(systemRequest(USER_A.id))).json();
    expect(body.workerStatus.status).toBe('UNKNOWN');
    expect(body.workerStatus.evidence.lastJobRunAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body.workerStatus.evidence.recentlyActive).toBe(true);
  });
});
