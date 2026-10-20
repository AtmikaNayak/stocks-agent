import path from 'node:path';
import { beforeAll } from 'vitest';

// Keep tests isolated from the user's persistent demo database.
process.env.INVESTPILOT_DB_PATH = path.resolve(
  process.cwd(),
  'data',
  'investpilot.test.db'
);

beforeAll(async () => {
  const { runSeed } = await import('../src/db/seed');
  runSeed();
});
