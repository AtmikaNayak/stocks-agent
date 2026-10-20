import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Guards the shipped configuration example. These are cheap static checks that
 * catch the two regressions that broke local sign-in before: a production
 * NODE_ENV baked into .env.example, and a session secret with a real value.
 */

const root = process.cwd();
const envExample = fs.readFileSync(path.join(root, '.env.example'), 'utf-8');
const activeLines = envExample
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line !== '' && !line.startsWith('#'));

function activeValue(key: string): string | undefined {
  const line = activeLines.find((entry) => entry.startsWith(`${key}=`));
  if (!line) return undefined;
  return line.slice(key.length + 1).trim().replace(/^"(.*)"$/, '$1');
}

describe('.env.example defaults', () => {
  it('does not pin NODE_ENV, so the command decides the environment', () => {
    expect(activeLines.some((line) => line.startsWith('NODE_ENV='))).toBe(false);
    expect(envExample).toMatch(/npm run dev\s+-> development/i);
  });

  it('keeps the session secret as an empty placeholder', () => {
    expect(activeValue('INVESTPILOT_SESSION_SECRET')).toBe('');
    expect(envExample).toMatch(/no production fallback/i);
  });

  it('documents that production cookies are Secure and need HTTPS', () => {
    expect(envExample).toMatch(/`Secure` is added\s*\n?#?\s*whenever NODE_ENV=production/i);
    expect(envExample).toMatch(/HTTPS/);
    expect(envExample).toMatch(/npm run dev/);
  });

  it('defaults operator privileges to nobody', () => {
    expect(activeValue('INVESTPILOT_SYSTEM_ADMIN_USER_IDS')).toBe('');
    expect(envExample).toMatch(/no signed-in user has operator privileges/i);
  });

  it('keeps provider allowlists empty (default deny)', () => {
    for (const key of [
      'INVESTPILOT_TRUSTED_QUOTE_PROVIDERS',
      'INVESTPILOT_TRUSTED_FUNDAMENTAL_SOURCES'
    ]) {
      const value = activeValue(key);
      expect(value === undefined || value === '').toBe(true);
    }
  });

  it('contains no real secrets or credentials', () => {
    for (const line of activeLines) {
      const [key, ...rest] = line.split('=');
      const value = rest.join('=').replace(/^"(.*)"$/, '$1');
      if (!value) continue;

      // Only non-secret operational defaults may carry a value.
      const allowed = new Set([
        'PORT',
        'INVESTPILOT_DB_PATH',
        'DATABASE_URL',
        'INVESTPILOT_SYSTEM_ADMIN_USER_IDS'
      ]);
      if (allowed.has(key!)) continue;

      // Any other populated key must look like an obvious placeholder.
      expect(value, `${key} should stay empty or use a placeholder`).toMatch(
        /^(|your-.*|placeholder.*|<.*>|changeme|example.*)$/i
      );
    }
  });

  it('does not ship a real .env file in the repository', () => {
    expect(fs.existsSync(path.join(root, '.env'))).toBe(false);
  });
});
