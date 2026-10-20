import { workerScheduler } from '../lib/worker/scheduler';

console.log('Starting InvestPilot AI 2.0 Background Worker...');
workerScheduler.start(30000);

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
