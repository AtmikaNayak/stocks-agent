import { NextResponse } from 'next/server';
import db from '@/db';
import { getSessionUser, jsonError, requireSameOrigin } from '@/lib/auth/guard';
import { serializeClearedSessionCookie } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/logout — revokes the session server-side and clears the cookie.
 *
 * Policy (documented, not implied): logging out increments the account's
 * `token_version`, which invalidates **every** token issued for that account,
 * including on other devices. Per-device revocation would need a session table;
 * account-wide revocation is the safe approximation available with stateless
 * signed tokens.
 */
export async function POST(request: Request) {
  const sameOrigin = requireSameOrigin(request);
  if (!sameOrigin.ok) return sameOrigin.response;

  const user = getSessionUser(request);
  if (user) {
    try {
      db.writeTransaction((database) => {
        database
          .prepare(
            `UPDATE user_credentials
             SET token_version = token_version + 1
             WHERE user_id = ?`
          )
          .run(user.id);
        database
          .prepare(
            `INSERT INTO audit_logs (id, user_id, action_type, actor, details, created_at)
             VALUES (?, ?, 'AUTH_LOGOUT', 'USER', 'User signed out; all sessions revoked.', datetime('now'))`
          )
          .run(`aud_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, user.id);
      });
    } catch {
      // Logging must never block a logout.
    }
  }

  const response = NextResponse.json(
    { success: true },
    { headers: { 'Cache-Control': 'no-store' } }
  );
  response.headers.append('Set-Cookie', serializeClearedSessionCookie());
  return response;
}

export async function GET() {
  return jsonError('Use POST to sign out.', 405);
}
