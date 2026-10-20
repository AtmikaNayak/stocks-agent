import path from 'node:path';
import { beforeAll } from 'vitest';

// Keep tests isolated from the user's persistent demo database.
process.env.INVESTPILOT_DB_PATH = path.resolve(
  process.cwd(),
  'data',
  'investpilot.test.db'
);

// Deterministic, test-only signing secret. Production never falls back to a
// default: a missing INVESTPILOT_SESSION_SECRET disables authentication.
process.env.INVESTPILOT_SESSION_SECRET =
  process.env.INVESTPILOT_SESSION_SECRET ?? 'test-only-session-signing-secret-0123456789';

beforeAll(async () => {
  const { runSeed } = await import('../src/db/seed');
  runSeed();
});
