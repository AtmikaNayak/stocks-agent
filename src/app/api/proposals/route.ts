import { NextResponse } from 'next/server';
import db from '@/db';
import investmentStrategistAgent from '@/lib/agents/strategist';
import portfolioExecutionAgent from '@/lib/agents/portfolio-execution';
import { ValidationError } from '@/lib/validation';

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
      // The strategist agent validates its own inputs and rejects malformed requests.
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
        expires_at: string;
      }>('SELECT * FROM investment_proposals WHERE id = ?', [proposalId]);

      if (!proposal) {
        return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
      }

      if (decision !== 'APPROVE' && decision !== 'REJECT') {
        return NextResponse.json({ error: "decision must be 'APPROVE' or 'REJECT'" }, { status: 400 });
      }

      if (proposal.status !== 'PENDING') {
        return NextResponse.json(
          { error: `Proposal is ${proposal.status} and can no longer be changed.` },
          { status: 409 }
        );
      }

      const expiresAt = Date.parse(proposal.expires_at ?? '');
      if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
        db.execute("UPDATE investment_proposals SET status = 'EXPIRED' WHERE id = ? AND status = 'PENDING'", [
          proposalId
        ]);
        return NextResponse.json({ error: 'Proposal has expired. Ask for a fresh idea.' }, { status: 409 });
      }

      if (decision === 'REJECT') {
        db.execute("UPDATE investment_proposals SET status = 'REJECTED_USER' WHERE id = ?", [proposalId]);
        return NextResponse.json({ success: true, status: 'REJECTED_USER' });
      }

      if (decision === 'APPROVE') {
        // Execution requires an explicitly APPROVED proposal, so record the
        // approval first and roll it back if the order is rejected.
        const approval = db.execute(
          "UPDATE investment_proposals SET status = 'APPROVED' WHERE id = ? AND status = 'PENDING'",
          [proposalId]
        );
        if (!approval || (approval as any).changes === 0) {
          return NextResponse.json({ error: 'Proposal is no longer pending.' }, { status: 409 });
        }

        // Execute the approved proposal.
        // No client- or proposal-supplied price is passed: the execution agent
        // must fill from its own stored quote.
        try {
          const exec = await portfolioExecutionAgent.executeOrder({
            portfolioId: proposal.portfolio_id,
            assetId: proposal.asset_id,
            side: proposal.action,
            quantity: proposal.proposed_quantity,
            orderMode: 'AI_PROPOSAL_APPROVED',
            proposalId: proposal.id
          });
          db.execute("UPDATE investment_proposals SET status = 'EXECUTED' WHERE id = ?", [proposalId]);
          return NextResponse.json({ success: true, status: 'EXECUTED', execution: exec });
        } catch (execError: any) {
          // Rejected by the risk engine or execution guards: put the proposal
          // back to PENDING so the user can retry or decline it.
          db.execute("UPDATE investment_proposals SET status = 'PENDING' WHERE id = ? AND status = 'APPROVED'", [
            proposalId
          ]);
          return NextResponse.json({ error: execError.message }, { status: 400 });
        }
      }
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: any) {
    const status = err instanceof ValidationError ? 400 : 400;
    return NextResponse.json({ error: err.message }, { status });
  }
}
