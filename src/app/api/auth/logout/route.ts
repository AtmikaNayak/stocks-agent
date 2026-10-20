import { NextResponse } from 'next/server';
import db from '@/db';
import { getSessionUser, jsonError } from '@/lib/auth/guard';
import { serializeClearedSessionCookie } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/logout — clears the session cookie.
 *
 * Sessions are stateless, so logout clears the cookie on the client. The
 * cookie is HTTP-only; the browser cannot read or forget it on its own.
 */
export async function POST(request: Request) {
  const user = getSessionUser(request);
  if (user) {
    try {
      db.execute(
        `INSERT INTO audit_logs (id, user_id, action_type, actor, details, created_at)
         VALUES (?, ?, 'AUTH_LOGOUT', 'USER', 'User signed out.', datetime('now'))`,
        [`aud_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, user.id]
      );
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
