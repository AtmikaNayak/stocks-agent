import { NextResponse } from 'next/server';
import db from '@/db';
import investmentStrategistAgent from '@/lib/agents/strategist';
import portfolioExecutionAgent from '@/lib/agents/portfolio-execution';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const portfolioId = searchParams.get('portfolioId');

  let sql = `
    SELECT p.*, a.symbol, a.name, a.sector,
      r.passed as risk_passed, r.rejection_reasons as risk_reasons,
      r.calculated_exposure_after_pct, r.calculated_position_pct, r.cash_remaining_after
    FROM investment_proposals p
    JOIN assets a ON p.asset_id = a.id
    LEFT JOIN risk_assessments r ON r.proposal_id = p.id
  `;
  const params: any[] = [];
  if (portfolioId) {
    sql += ' WHERE p.portfolio_id = ?';
    params.push(portfolioId);
  }
  sql += ' ORDER BY p.created_at DESC LIMIT 50';

  const proposals = db.query(sql, params);
  return NextResponse.json({ proposals });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    // Action 1: Generate Proposal
    if (action === 'generate') {
      const { portfolioId, assetId, side = 'BUY', horizon = 'LONG_TERM' } = body;
      const proposal = await investmentStrategistAgent.evaluateAndPropose({
        portfolioId,
        assetId,
        action: side,
        horizon
      });
      return NextResponse.json({ success: true, proposal });
    }

    // Action 2: User Decision (Approve / Reject)
    if (action === 'respond') {
      const { proposalId, decision } = body; // decision: 'APPROVE' | 'REJECT'
      const proposal = db.queryOne<{
        id: string;
        portfolio_id: string;
        asset_id: string;
        action: 'BUY' | 'SELL';
        proposed_quantity: number;
        proposed_price: number;
        status: string;
      }>('SELECT * FROM investment_proposals WHERE id = ?', [proposalId]);

      if (!proposal) {
        return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
      }

      if (decision === 'REJECT') {
        db.execute("UPDATE investment_proposals SET status = 'REJECTED_USER' WHERE id = ?", [proposalId]);
        return NextResponse.json({ success: true, status: 'REJECTED_USER' });
      }

      if (decision === 'APPROVE') {
        // Execute the approved proposal
        const exec = await portfolioExecutionAgent.executeOrder({
          portfolioId: proposal.portfolio_id,
          assetId: proposal.asset_id,
          side: proposal.action,
          quantity: proposal.proposed_quantity,
          price: proposal.proposed_price,
          orderMode: 'AI_PROPOSAL_APPROVED',
          proposalId: proposal.id
        });
        return NextResponse.json({ success: true, status: 'EXECUTED', execution: exec });
      }
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
