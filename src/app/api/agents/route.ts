import { NextResponse } from 'next/server';
import db from '@/db';
import marketIntelligenceAgent from '@/lib/agents/market-intelligence';
import { requireAuth } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = requireAuth(request);
  if (!auth.ok) return auth.response;
  const userId = auth.value.id;

  const runs = db.query('SELECT * FROM agent_runs ORDER BY started_at DESC LIMIT 20');
  const observations = db.query(`
    SELECT o.*, a.symbol, a.name 
    FROM agent_observations o
    JOIN assets a ON o.asset_id = a.id
    ORDER BY o.observed_at DESC LIMIT 30
  `);
  const theses = db.query(`
    SELECT t.*, a.symbol, a.name
    FROM investment_theses t
    JOIN portfolios pt ON t.portfolio_id = pt.id
    JOIN assets a ON t.asset_id = a.id
    WHERE pt.user_id = ?
    ORDER BY t.created_at DESC
  `, [userId]);

  return NextResponse.json({ runs, observations, theses });
}

export async function POST(request: Request) {
  const auth = requireAuth(request);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { action = 'scan' } = body;

    if (action === 'scan') {
      const scanResult = await marketIntelligenceAgent.runScan('MANUAL');
      return NextResponse.json({ success: true, scanResult });
    }

    return NextResponse.json({ error: 'Unknown agent action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
