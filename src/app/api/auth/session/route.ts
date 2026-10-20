import { NextResponse } from 'next/server';
import { getSessionUser, jsonError } from '@/lib/auth/guard';
import { isOperatorUserId } from '@/lib/auth/operator';

export const dynamic = 'force-dynamic';

/**
 * GET /api/auth/session — returns the signed-in user, or 401.
 *
 * `isOperator` reports the caller's own system-operator status so the UI can
 * hide controls that would otherwise only produce a 403. It is derived from
 * the verified session id plus INVESTPILOT_SYSTEM_ADMIN_USER_IDS.
 */
export async function GET(request: Request) {
  const user = getSessionUser(request);
  if (!user) return jsonError('Authentication required.', 401);

  return NextResponse.json(
    {
      user: { id: user.id, email: user.email, name: user.name },
      isOperator: isOperatorUserId(user.id)
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
