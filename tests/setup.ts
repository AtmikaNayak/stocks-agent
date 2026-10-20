import fs from 'node:fs';
import path from 'node:path';

// Keep automated tests away from data/investpilot.db, which may contain a
// user's persistent virtual portfolio state.
const dataDir = path.resolve(process.cwd(), 'data');
fs.mkdirSync(dataDir, { recursive: true });
const testDbPath = path.join(dataDir, 'investpilot.test.db');

for (const suffix of ['', '-wal', '-shm']) {
  fs.rmSync(testDbPath + suffix, { force: true });
}

process.env.INVESTPILOT_DB_PATH = testDbPath;

// Create a fresh schema and deterministic synthetic fixtures for every test run.
const { runSeed } = await import('../src/db/seed');
runSeed();
