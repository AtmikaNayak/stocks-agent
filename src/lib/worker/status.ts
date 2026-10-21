import db from '../../db';
import { workerScheduler } from './scheduler';
import { HeartbeatRow, readHeartbeats } from './heartbeat';

/**
 * Truthful worker reporting.
 *
 * The background scheduler can run in two places:
 *  - inside this server process (only if someone called `workerScheduler.start()`), or
 *  - in a separate daemon (`npm run worker`), which this process cannot observe.
 *
 * This module therefore never claims the worker is active unless the in-process
 * scheduler actually says so. When it is not running in-process, the state is
 * reported as UNKNOWN, with evidence (the last recorded job run) that the UI can
 * show without turning it into a claim.
 */

export type WorkerStatusValue =
  | 'RUNNING_IN_PROCESS'
  | 'RUNNING_EXTERNAL'
  | 'STALE'
  | 'STOPPED'
  | 'UNKNOWN';

export interface WorkerEvidence {
  /** Most recent `scheduled_jobs.last_run_at` value (UTC ISO string), or null. */
  lastJobRunAt: string | null;
  lastJobRunStatus: string | null;
  /**
   * True when a recorded job run is recent enough to suggest *some* worker is
   * alive. This is evidence, not proof, and never upgrades the status.
   */
  recentlyActive: boolean;
  /** The window used for `recentlyActive`, in seconds. */
  observationWindowSeconds: number;
}

export interface WorkerStatusReport {
  status: WorkerStatusValue;
  inProcessSchedulerRunning: boolean;
  /** Human-readable explanation safe to render directly in the UI. */
  summary: string;
  evidence: WorkerEvidence;
  /** Newest heartbeat, when one exists. Never used to claim liveness by itself. */
  heartbeat: {
    workerId: string;
    status: string;
    lastBeatAt: string | null;
    ageSeconds: number | null;
    intervalSeconds: number;
  } | null;
  uptimeSeconds: number;
}

/** Never report a window shorter than this, even for fast test schedules. */
export const MIN_OBSERVATION_WINDOW_SECONDS = 120;

/**
 * Upper bound on the evidence window. Long-interval jobs (e.g. a daily thesis
 * review) must not turn a day-old timestamp into "recent activity".
 */
export const MAX_OBSERVATION_WINDOW_SECONDS = 900;

/**
 * `last_run_status = 'NOT_RUN'` is what the seed fixture writes: it means no run
 * has happened, so it is never counted as evidence of a live worker.
 */
const RECORDED_RUN_STATUSES = new Set(['SUCCESS', 'FAILED']);

/**
 * SQLite stores `datetime('now')` as UTC "YYYY-MM-DD HH:MM:SS" with no zone.
 * `Date.parse` would read that as local time, so the zone is made explicit.
 */
export function parseSqliteUtc(value: string | null | undefined): number | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const withZone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(normalized) ? normalized : `${normalized}Z`;
  const parsed = Date.parse(withZone);
  return Number.isFinite(parsed) ? parsed : null;
}

interface JobRow {
  job_name: string;
  interval_seconds: number | null;
  last_run_at: string | null;
  last_run_status: string | null;
}

export function buildWorkerStatus(
  options: {
    inProcessRunning?: boolean;
    now?: number;
    jobs?: JobRow[];
    uptimeSeconds?: number;
    /** Inject heartbeats in tests; omitted means "read the database". */
    heartbeats?: HeartbeatRow[];
  } = {}
): WorkerStatusReport {
  const inProcessRunning = options.inProcessRunning ?? workerScheduler.isRunning;
  const now = options.now ?? Date.now();
  const jobs = options.jobs ?? db.query<JobRow>(
    'SELECT job_name, interval_seconds, last_run_at, last_run_status FROM scheduled_jobs'
  );
  const heartbeats = options.heartbeats ?? readHeartbeats();
  const uptimeSeconds = options.uptimeSeconds ?? Math.round(process.uptime());

  let latestRunAt: number | null = null;
  let latestRunStatus: string | null = null;
  let windowSeconds = MIN_OBSERVATION_WINDOW_SECONDS;

  for (const job of jobs) {
    const interval = Number(job.interval_seconds);
    if (Number.isFinite(interval) && interval > 0) {
      windowSeconds = Math.min(
        MAX_OBSERVATION_WINDOW_SECONDS,
        Math.max(windowSeconds, Math.round(interval * 3))
      );
    }
    // A placeholder/never-run row is not evidence that a worker is alive.
    if (!RECORDED_RUN_STATUSES.has(String(job.last_run_status ?? ''))) continue;
    const parsed = parseSqliteUtc(job.last_run_at);
    if (parsed === null) continue;
    if (latestRunAt === null || parsed > latestRunAt) {
      latestRunAt = parsed;
      latestRunStatus = job.last_run_status ?? null;
    }
  }

  const recentlyActive =
    latestRunAt !== null && now - latestRunAt <= windowSeconds * 1000 && latestRunAt <= now + 60_000;

  // Newest heartbeat wins; a heartbeat is evidence of a live process only while
  // it is fresh, and only when that process did not report STOPPED.
  let newestBeat: { row: HeartbeatRow; parsed: number } | null = null;
  for (const beat of heartbeats) {
    const parsed = parseSqliteUtc(beat.last_beat_at) ?? Date.parse(beat.last_beat_at);
    if (!Number.isFinite(parsed)) continue;
    if (!newestBeat || parsed > newestBeat.parsed) newestBeat = { row: beat, parsed };
  }

  const heartbeat = newestBeat
    ? {
        workerId: newestBeat.row.worker_id,
        status: newestBeat.row.status,
        lastBeatAt: new Date(newestBeat.parsed).toISOString(),
        ageSeconds: Math.max(0, Math.round((now - newestBeat.parsed) / 1000)),
        intervalSeconds: Number(newestBeat.row.interval_seconds)
      }
    : null;

  const heartbeatFresh =
    heartbeat !== null &&
    heartbeat.status === 'RUNNING' &&
    heartbeat.ageSeconds !== null &&
    heartbeat.ageSeconds <= Math.max(MIN_OBSERVATION_WINDOW_SECONDS, heartbeat.intervalSeconds * 3);

  const evidence: WorkerEvidence = {
    lastJobRunAt: latestRunAt === null ? null : new Date(latestRunAt).toISOString(),
    lastJobRunStatus: latestRunStatus,
    recentlyActive,
    observationWindowSeconds: windowSeconds
  };

  let status: WorkerStatusValue;
  let summary: string;

  if (inProcessRunning) {
    status = 'RUNNING_IN_PROCESS';
    summary = 'The scheduler is running inside this server process.';
  } else if (heartbeatFresh) {
    status = 'RUNNING_EXTERNAL';
    summary = `Worker ${heartbeat.workerId} last sent a heartbeat ${heartbeat.ageSeconds}s ago (interval ${heartbeat.intervalSeconds}s).`;
  } else if (heartbeat && heartbeat.status === 'RUNNING') {
    status = 'STALE';
    summary =
      `Worker ${heartbeat.workerId} has not sent a heartbeat for ${heartbeat.ageSeconds}s, ` +
      `which is longer than its ${heartbeat.intervalSeconds}s interval. Its state cannot be confirmed.`;
  } else if (heartbeat && heartbeat.status === 'STOPPED') {
    status = 'STOPPED';
    summary = `Worker ${heartbeat.workerId} reported a graceful shutdown at ${heartbeat.lastBeatAt}.`;
  } else if (evidence.lastJobRunAt) {
    status = 'UNKNOWN';
    summary =
      `The scheduler is not running in this server process. The last recorded job run was ${evidence.lastJobRunAt}` +
      (recentlyActive
        ? `, which suggests a separate worker is alive, but that cannot be confirmed from here.`
        : ` and no recent activity was observed.`);
  } else {
    status = 'UNKNOWN';
    summary =
      'The scheduler is not running in this server process and no job has ever recorded a run, so worker state is unknown.';
  }

  return {
    status,
    inProcessSchedulerRunning: inProcessRunning,
    summary,
    evidence,
    heartbeat,
    uptimeSeconds
  };
}
