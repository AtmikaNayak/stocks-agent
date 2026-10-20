import { NextResponse } from 'next/server';
import db from '@/db';
import { DUMMY_PASSWORD_HASH, verifyPassword } from '@/lib/auth/password';
import {
  getSessionSecret,
  issueSessionToken,
  serializeSessionCookie,
  sessionTtlSeconds
} from '@/lib/auth/session';
import { jsonError } from '@/lib/auth/guard';
import { getLoginThrottle, trustedClientIp } from '@/lib/auth/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/login  { email, password }
 *
 * The only public write endpoint. Identity is proven by a password checked
 * against the local scrypt hash; there is no default account, no bypass header
 * and no environment variable that logs a user in without a password.
 */

/**
 * Throttling notes:
 *  - the primary limiter key is the normalized email, never a request header;
 *  - a client-supplied X-Forwarded-For can only influence throttling when the
 *    operator explicitly sets INVESTPILOT_TRUST_PROXY=1 and a reverse proxy
 *    overwrites INVESTPILOT_TRUSTED_PROXY_HEADER on every request;
 *  - counters live in process memory (single-instance only) and the key map is
 *    bounded and swept — see src/lib/auth/rate-limit.ts.
 */
export { resetLoginRateLimits } from '@/lib/auth/rate-limit';

export async function POST(request: Request) {
  // Fail closed: without a signing secret the server cannot issue a safe session.
  if (!getSessionSecret()) {
    return jsonError('Authentication is not configured on this server.', 503);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('A JSON body is required.', 400);
  }
  if (!body || typeof body !== 'object') return jsonError('A JSON body is required.', 400);

  const { email, password } = body as { email?: unknown; password?: unknown };
  if (typeof email !== 'string' || email.trim() === '' || email.length > 320) {
    return jsonError('email and password are required.', 400);
  }
  if (typeof password !== 'string' || password === '' || password.length > 512) {
    return jsonError('email and password are required.', 400);
  }

  const throttle = getLoginThrottle();
  const attempt = { email: email.trim().toLowerCase(), ip: trustedClientIp(request) };
  const verdict = throttle.evaluate(attempt);
  if (verdict.limited) {
    return NextResponse.json(
      { error: 'Too many sign-in attempts. Try again later.' },
      {
        status: 429,
        headers: {
          'Cache-Control': 'no-store',
          'Retry-After': String(verdict.retryAfterSeconds)
        }
      }
    );
  }

  const row = db.queryOne<{ id: string; email: string; name: string; password_hash: string | null }>(
    `SELECT u.id, u.email, u.name, c.password_hash
     FROM users u
     LEFT JOIN user_credentials c ON c.user_id = u.id
     WHERE lower(u.email) = lower(?)`,
    [email.trim()]
  );

  // Always run a full scrypt verification so unknown accounts and accounts
  // without credentials are not distinguishable by response time.
  const passwordOk = verifyPassword(password, row?.password_hash ?? DUMMY_PASSWORD_HASH);
  if (!row || !row.password_hash || !passwordOk) {
    // Counted under the normalized email (and the proxy-supplied IP only when
    // proxy trust is explicitly configured).
    throttle.recordFailure(attempt);
    return jsonError('Invalid email or password.', 401);
  }

  throttle.reset(attempt);

  const { token, payload } = issueSessionToken(row.id);
  db.execute(
    "UPDATE user_credentials SET last_login_at = datetime('now') WHERE user_id = ?",
    [row.id]
  );
  db.execute(
    `INSERT INTO audit_logs (id, user_id, action_type, actor, details, created_at)
     VALUES (?, ?, 'AUTH_LOGIN', 'USER', 'User signed in.', datetime('now'))`,
    [`aud_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, row.id]
  );

  const response = NextResponse.json(
    {
      user: { id: row.id, email: row.email, name: row.name },
      expiresAt: new Date(payload.expiresAt * 1000).toISOString()
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
  response.headers.append('Set-Cookie', serializeSessionCookie(token, sessionTtlSeconds()));
  return response;
}
