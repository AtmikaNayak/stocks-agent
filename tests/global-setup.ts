import fs from 'node:fs';
import path from 'node:path';

export default function globalSetup() {
  const dataDir = path.resolve(process.cwd(), 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  const testDbPath = path.join(dataDir, 'investpilot.test.db');

  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    fs.rmSync(testDbPath + suffix, { force: true });
  }
}
