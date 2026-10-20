import fs from 'node:fs';
import path from 'node:path';
import { beforeAll } from 'vitest';

// Keep automated tests away from data/investpilot.db, which may contain a
// user's persistent virtual portfolio state.
const dataDir = path.resolve(process.cwd(), 'data');
fs.mkdirSync(dataDir, { recursive: true });
const testDbPath = path.join(dataDir, 'investpilot.test.db');

for (const suffix of ['', '-wal', '-shm']) {
  fs.rmSync(testDbPath + suffix, { force: true });
}

process.env.INVESTPILOT_DB_PATH = testDbPath;

// Import the seed dynamically after selecting the isolated test path.
// beforeAll keeps this compatible with Next.js TypeScript checks (no top-level await).
beforeAll(async () => {
  const { runSeed } = await import('../src/db/seed');
  runSeed();
});
