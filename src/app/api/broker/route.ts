import { NextResponse } from 'next/server';
import db from '@/db';
import brokerService from '@/lib/broker';

export async function GET() {
  const connections = db.query('SELECT * FROM broker_connections');
  return NextResponse.json({ connections });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'connect') {
      const { userId = 'usr_pilot_01', brokerName, clientId, apiKey, apiSecret, complianceAcknowledged } = body;
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
      const { userId = 'usr_pilot_01' } = body;
      const res = await brokerService.disconnectBroker(userId);
      return NextResponse.json({ success: true, res });
    }

    return NextResponse.json({ error: 'Invalid broker action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
