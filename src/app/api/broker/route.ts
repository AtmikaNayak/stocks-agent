import { NextResponse } from 'next/server';
import db from '@/db';
import brokerService from '@/lib/broker';
import { requireAuth } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = requireAuth(request);
  if (!auth.ok) return auth.response;
  const userId = auth.value.id;

  // Never return encrypted tokens, secrets, or full credential records to the browser.
  const connections = db.query(
    `SELECT id, broker_name, client_id, api_key_masked, status, status_message,
            compliance_acknowledged, token_expires_at, last_synced_at, created_at, updated_at
     FROM broker_connections
     WHERE user_id = ?
     ORDER BY created_at DESC`,
    [userId]
  );
  return NextResponse.json({ connections }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const auth = requireAuth(request);
  if (!auth.ok) return auth.response;
  const userId = auth.value.id;

  try {
    const body = await request.json();
    const { action, userId: bodyUserId } = body;

    // A client-supplied user id can never override the session identity.
    if (bodyUserId !== undefined && bodyUserId !== userId) {
      return NextResponse.json({ error: 'userId cannot be supplied by the client.' }, { status: 400 });
    }

    if (action === 'connect') {
      const { brokerName, clientId, apiKey, apiSecret, complianceAcknowledged } = body;
      const res = await brokerService.connectBroker({
        userId,
        brokerName,
        clientId,
        apiKey,
        apiSecret,
        complianceAcknowledged
      });
      return NextResponse.json({ success: true, res });
    }

    if (action === 'disconnect') {
      const res = await brokerService.disconnectBroker(userId);
      return NextResponse.json({ success: true, res });
    }

    return NextResponse.json({ error: 'Invalid broker action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
