import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

/**
 * Session tokens.
 *
 * A session is a stateless HMAC-SHA256 signed token held in an HTTP-only
 * cookie:
 *
 *   v1.<base64url(payload)>.<base64url(hmac)>
 *
 * payload = { v: 1, sub: <user id>, iat: <unix seconds>, exp: <unix seconds> }
 *
 * Security properties enforced here:
 *  - the token is signed with a server-only secret and verified in constant time;
 *  - the version, structure, subject and expiry are all validated (fail closed);
 *  - the cookie is HTTP-only, SameSite=Lax, Path=/ and Secure in production;
 *  - the secret has no default value. In production a missing/weak secret
 *    disables authentication entirely (503) rather than falling back.
 */

export const SESSION_COOKIE = 'investpilot_session';

const TOKEN_VERSION = 'v1';
const MIN_SECRET_LENGTH = 32;
const DEFAULT_TTL_SECONDS = 8 * 60 * 60;
const MIN_TTL_SECONDS = 5 * 60;
const MAX_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface SessionPayload {
  userId: string;
  issuedAt: number;
  expiresAt: number;
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

let ephemeralSecret: string | null = null;
let warnedAboutEphemeralSecret = false;

/**
 * Returns the signing secret, or null when authentication cannot be
 * configured safely. In production an absent or short secret is a hard
 * failure (callers reject the request); outside production a per-process
 * random secret is generated so local development still works. That ephemeral
 * secret cannot be used in production because production never falls back.
 */
export function getSessionSecret(): string | null {
  const configured = process.env.INVESTPILOT_SESSION_SECRET;
  if (typeof configured === 'string' && configured.length >= MIN_SECRET_LENGTH) {
    return configured;
  }
  if (isProduction()) return null;

  if (!ephemeralSecret) {
    ephemeralSecret = randomBytes(32).toString('hex');
    if (!warnedAboutEphemeralSecret) {
      warnedAboutEphemeralSecret = true;
      console.warn(
        '[auth] INVESTPILOT_SESSION_SECRET is not set. Using a per-process random secret; ' +
          'all sessions become invalid on restart. Set INVESTPILOT_SESSION_SECRET (32+ characters) for stable sessions.'
      );
    }
  }
  return ephemeralSecret;
}

export function sessionTtlSeconds(): number {
  const raw = Number(process.env.INVESTPILOT_SESSION_TTL_SECONDS);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_TTL_SECONDS;
  return Math.min(MAX_TTL_SECONDS, Math.max(MIN_TTL_SECONDS, Math.floor(raw)));
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function sign(secret: string, data: string): string {
  return base64url(createHmac('sha256', secret).update(data).digest());
}

export function issueSessionToken(
  userId: string,
  now: number = Date.now()
): { token: string; payload: SessionPayload } {
  const secret = getSessionSecret();
  if (!secret) throw new Error('Session signing secret is not configured.');
  if (typeof userId !== 'string' || userId.trim() === '') throw new Error('A user id is required to issue a session.');

  const issuedAt = Math.floor(now / 1000);
  const expiresAt = issuedAt + sessionTtlSeconds();
  const payload: SessionPayload = { userId, issuedAt, expiresAt };
  const body = base64url(
    JSON.stringify({ v: 1, sub: userId, iat: issuedAt, exp: expiresAt })
  );
  return { token: `${TOKEN_VERSION}.${body}.${sign(secret, `${TOKEN_VERSION}.${body}`)}`, payload };
}

/**
 * Verifies a session token. Returns null for anything that is not a
 * well-formed, correctly signed, unexpired token.
 */
export function verifySessionToken(
  token: unknown,
  now: number = Date.now()
): SessionPayload | null {
  if (typeof token !== 'string' || token.length === 0 || token.length > 4096) return null;
  const secret = getSessionSecret();
  if (!secret) return null;

  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== TOKEN_VERSION) return null;
  const [, body, signature] = parts;
  if (!body || !signature) return null;

  const expected = sign(secret, `${TOKEN_VERSION}.${body}`);
  const provided = Buffer.from(signature, 'utf8');
  const computed = Buffer.from(expected, 'utf8');
  if (provided.length !== computed.length || !timingSafeEqual(provided, computed)) return null;

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!decoded || typeof decoded !== 'object') return null;

  const record = decoded as Record<string, unknown>;
  if (record.v !== 1) return null;
  if (typeof record.sub !== 'string' || record.sub.trim() === '') return null;
  if (!Number.isSafeInteger(record.iat) || !Number.isSafeInteger(record.exp)) return null;

  const issuedAt = record.iat as number;
  const expiresAt = record.exp as number;
  const nowSeconds = Math.floor(now / 1000);
  if (expiresAt <= nowSeconds) return null;
  if (expiresAt <= issuedAt) return null;
  // Reject tokens dated in the future beyond a small clock-skew allowance.
  if (issuedAt > nowSeconds + 60) return null;

  return { userId: record.sub, issuedAt, expiresAt };
}

export function serializeSessionCookie(token: string, maxAgeSeconds: number): string {
  const attributes = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`
  ];
  if (isProduction()) attributes.push('Secure');
  return attributes.join('; ');
}

export function serializeClearedSessionCookie(): string {
  const attributes = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (isProduction()) attributes.push('Secure');
  return attributes.join('; ');
}

/** Reads the raw session cookie from a plain Request (no Next.js runtime needed). */
export function readSessionCookie(request: Request): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() !== SESSION_COOKIE) continue;
    const value = part.slice(index + 1).trim();
    return value === '' ? null : value;
  }
  return null;
}
