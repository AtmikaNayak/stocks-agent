import { NextResponse } from 'next/server';
import db from '@/db';
import marketIntelligenceAgent from '@/lib/agents/market-intelligence';
import { requireAuth } from '@/lib/auth/guard';
import { isOperatorUserId, requireOperator } from '@/lib/auth/operator';

export const dynamic = 'force-dynamic';

/**
 * GET /api/agents — shared research reads for any authenticated user.
 *
 * What is intentionally shared here:
 *  - `runs`: agent execution metadata (agent name, trigger, status, summary).
 *  - `observations`: market-wide observations joined to assets.
 *  Neither table has a user or portfolio column, so neither can expose one
 *  user's holdings to another.
 *
 * What is NOT shared: `investment_theses` are joined through portfolios and
 * filtered to the caller, because a thesis belongs to a specific portfolio.
 */
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

  return NextResponse.json(
    { viewer: { isOperator: isOperatorUserId(userId) }, runs, observations, theses },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

/**
 * POST /api/agents — operator only.
 *
 * A manual scan writes global `agent_runs` / `agent_observations` rows that
 * every user then reads, so it is a deployment-wide operation rather than a
 * per-user one. The role comes from the verified session id plus
 * INVESTPILOT_SYSTEM_ADMIN_USER_IDS — never from the request.
 */
export async function POST(request: Request) {
  const auth = requireOperator(request);
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
