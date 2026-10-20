import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

/**
 * Password hashing for the local credential store.
 *
 * Uses Node's built-in scrypt (memory-hard KDF) so no extra dependency is
 * required. Hashes are self-describing:
 *
 *   scrypt$<N>$<r>$<p>$<base64url salt>$<base64url derived key>
 *
 * There is deliberately no default password, no seeded credential, and no
 * environment variable that bypasses password verification.
 */

const KEY_LENGTH = 64;
const SALT_BYTES = 16;
const PARAMS = { N: 16384, r: 8, p: 1 } as const;
const MAX_MEM = 64 * 1024 * 1024;

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 512;

/** Invalid-hash placeholder used to keep login timing roughly constant. */
const DUMMY_SALT = Buffer.alloc(SALT_BYTES, 0).toString('base64url');
const DUMMY_KEY = Buffer.alloc(KEY_LENGTH, 0).toString('base64url');
export const DUMMY_PASSWORD_HASH = `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${DUMMY_SALT}$${DUMMY_KEY}`;

export function assertPasswordPolicy(password: unknown): string {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new Error(`Password must be at most ${MAX_PASSWORD_LENGTH} characters.`);
  }
  return password;
}

export function hashPassword(password: string): string {
  assertPasswordPolicy(password);
  const salt = randomBytes(SALT_BYTES);
  const derived = scryptSync(password, salt, KEY_LENGTH, { ...PARAMS, maxmem: MAX_MEM });
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

/**
 * Constant-time password verification. Any malformed hash, malformed input or
 * unsupported parameter set simply fails closed.
 */
export function verifyPassword(password: unknown, stored: unknown): boolean {
  if (typeof password !== 'string' || password.length === 0) return false;
  if (password.length > MAX_PASSWORD_LENGTH) return false;
  if (typeof stored !== 'string') return false;

  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isSafeInteger(N) || !Number.isSafeInteger(r) || !Number.isSafeInteger(p)) return false;
  if (N < 1024 || N > 1 << 20 || r < 1 || r > 32 || p < 1 || p > 16) return false;

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4], 'base64url');
    expected = Buffer.from(parts[5], 'base64url');
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0 || expected.length > 128) return false;

  let derived: Buffer;
  try {
    derived = scryptSync(password, salt, expected.length, { N, r, p, maxmem: MAX_MEM });
  } catch {
    return false;
  }
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
