import { NextResponse } from 'next/server';
import { getSessionUser, jsonError } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';

/** GET /api/auth/session — returns the signed-in user, or 401. */
export async function GET(request: Request) {
  const user = getSessionUser(request);
  if (!user) return jsonError('Authentication required.', 401);

  return NextResponse.json(
    { user: { id: user.id, email: user.email, name: user.name } },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
