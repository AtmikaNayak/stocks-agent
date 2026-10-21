import os from 'node:os';
import db from '../../db';

/**
 * Worker heartbeats.
 *
 * A worker registers itself here while it is alive and deregisters on shutdown.
 * The API process reads this table to answer "is a worker running?" — the
 * answer is only ever as good as the beat, which is why `status.ts` treats an
 * old beat as STALE rather than as running.
 *
 * Multi-process limitation: heartbeats are advisory. If a worker process is
 * killed with SIGKILL it cannot deregister, so its last beat simply ages out.
 */

export interface HeartbeatRow {
  worker_id: string;
  status: string;
  host: string | null;
  pid: number | null;
  interval_seconds: number;
  started_at: string;
  last_beat_at: string;
}

/** Stable identity for this worker process (host + pid + start time). */
export function createWorkerId(now: Date = new Date()): string {
  return `wrk_${os.hostname()}_${process.pid}_${now.getTime()}`;
}

export function writeHeartbeat(options: {
  workerId: string;
  intervalSeconds: number;
  status?: 'RUNNING' | 'STOPPED';
  now?: Date;
}): void {
  const { workerId, intervalSeconds, status = 'RUNNING', now = new Date() } = options;
  const stamp = now.toISOString();

  db.execute(
    `INSERT INTO worker_heartbeats
       (worker_id, status, host, pid, interval_seconds, started_at, last_beat_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(worker_id) DO UPDATE SET
       status = excluded.status,
       interval_seconds = excluded.interval_seconds,
       last_beat_at = excluded.last_beat_at`,
    [workerId, status, os.hostname(), process.pid, Math.max(1, Math.round(intervalSeconds)), stamp, stamp]
  );
}

export function readHeartbeats(): HeartbeatRow[] {
  try {
    return db.query<HeartbeatRow>('SELECT * FROM worker_heartbeats');
  } catch {
    // Table absent (pre-migration database): report nothing rather than crash.
    return [];
  }
}

export interface HeartbeatController {
  workerId: string;
  stop: () => void;
}

/**
 * Starts a periodic heartbeat. Returns a controller so the caller can stop it
 * and mark the worker as STOPPED on a graceful shutdown.
 */
export function startHeartbeat(intervalMs = 30_000): HeartbeatController {
  const intervalSeconds = Math.max(1, Math.round(intervalMs / 1000));
  const workerId = createWorkerId();

  const beat = (status: 'RUNNING' | 'STOPPED' = 'RUNNING') => {
    try {
      writeHeartbeat({ workerId, intervalSeconds, status });
    } catch (err) {
      console.warn(
        '[worker] heartbeat write failed:',
        err instanceof Error ? err.message : 'unknown error'
      );
    }
  };

  beat('RUNNING');
  const timer = setInterval(() => beat('RUNNING'), intervalMs);
  // Do not keep the process alive purely for the heartbeat.
  if (typeof timer.unref === 'function') timer.unref();

  return {
    workerId,
    stop: () => {
      clearInterval(timer);
      beat('STOPPED');
    }
  };
}
