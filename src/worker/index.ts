import { workerScheduler } from '../lib/worker/scheduler';

/**
 * Worker daemon.
 *
 * Starting the scheduler also starts a heartbeat row, which is the only signal
 * the API process (a different process, sharing only the database) can use to
 * tell a live worker from a dead one. SIGTERM/SIGINT mark the heartbeat STOPPED
 * so a graceful shutdown is reported as STOPPED rather than as STALE.
 */
const HEARTBEAT_INTERVAL_MS = 30_000;

console.log('Starting InvestPilot AI 2.0 Background Worker...');
console.log(`Worker id: ${workerScheduler.workerId}`);
workerScheduler.start(HEARTBEAT_INTERVAL_MS);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Caught SIGINT. Stopping worker...');
  workerScheduler.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Caught SIGTERM. Stopping worker...');
  workerScheduler.stop();
  process.exit(0);
});
