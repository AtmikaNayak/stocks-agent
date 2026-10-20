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

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/login  { email, password }
 *
 * The only public write endpoint. Identity is proven by a password checked
 * against the local scrypt hash; there is no default account, no bypass header
 * and no environment variable that logs a user in without a password.
 */

const MAX_ATTEMPTS = 10;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const attempts = new Map<string, { count: number; resetAt: number }>();

function attemptKey(request: Request, email: string): string {
  const forwarded = request.headers.get('x-forwarded-for') ?? '';
  const ip = forwarded.split(',')[0]!.trim() || 'local';
  return `${ip}|${email}`;
}

function isRateLimited(key: string, now = Date.now()): boolean {
  const entry = attempts.get(key);
  if (!entry) return false;
  if (entry.resetAt <= now) {
    attempts.delete(key);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

function recordFailure(key: string, now = Date.now()): void {
  const entry = attempts.get(key);
  if (!entry || entry.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + ATTEMPT_WINDOW_MS });
    return;
  }
  entry.count += 1;
}

export function resetLoginRateLimits(): void {
  attempts.clear();
}

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

  const key = attemptKey(request, email.trim().toLowerCase());
  if (isRateLimited(key)) {
    return jsonError('Too many sign-in attempts. Try again later.', 429);
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
    recordFailure(key);
    return jsonError('Invalid email or password.', 401);
  }

  attempts.delete(key);

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
