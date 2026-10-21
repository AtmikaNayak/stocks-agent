import { NextResponse } from 'next/server';
import db from '@/db';
import investmentStrategistAgent from '@/lib/agents/strategist';
import portfolioExecutionAgent from '@/lib/agents/portfolio-execution';
import { ValidationError } from '@/lib/validation';
import { requireAuth, requireId, requireOwnedPortfolio, requireSameOrigin } from '@/lib/auth/guard';
import { AppError } from '@/lib/errors';
import { errorResponse, readJsonBody } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = requireAuth(request);
  if (!auth.ok) return auth.response;
  const userId = auth.value.id;

  const { searchParams } = new URL(request.url);
  const portfolioId = searchParams.get('portfolioId');

  if (portfolioId) {
    const owned = requireOwnedPortfolio(userId, portfolioId);
    if (!owned.ok) return owned.response;
  }

  let sql = `
    SELECT p.*, a.symbol, a.name, a.sector,
      r.passed as risk_passed, r.rejection_reasons as risk_reasons,
      r.calculated_exposure_after_pct, r.calculated_position_pct, r.cash_remaining_after
    FROM investment_proposals p
    JOIN portfolios pt ON p.portfolio_id = pt.id
    JOIN assets a ON p.asset_id = a.id
    LEFT JOIN risk_assessments r ON r.proposal_id = p.id
    WHERE pt.user_id = ?
  `;
  const params: string[] = [userId];
  if (portfolioId) {
    sql += ' AND p.portfolio_id = ?';
    params.push(portfolioId);
  }
  sql += ' ORDER BY p.created_at DESC LIMIT 50';

  const proposals = db.query(sql, params);
  return NextResponse.json({ proposals }, { headers: { 'Cache-Control': 'no-store' } });
}

interface ProposalRecord {
  id: string;
  portfolio_id: string;
  asset_id: string;
  action: 'BUY' | 'SELL';
  proposed_quantity: number;
  proposed_price: number;
  status: string;
  expires_at: string;
}

/**
 * POST /api/proposals
 *
 * `action: 'generate'` — ask the strategist agent for a proposal.
 * `action: 'respond'`  — approve or reject a proposal the caller owns.
 *
 * Approval is a two-step state machine that is safe under concurrency:
 *   1. PENDING → APPROVED with a conditional UPDATE. Exactly one request can
 *      win; every loser receives 409 and executes nothing.
 *   2. The execution agent re-verifies APPROVED + unexpired + matching details
 *      *inside its own write transaction* and flips APPROVED → EXECUTED in that
 *      same transaction. A crash between the two steps therefore leaves the
 *      proposal APPROVED and unexecuted, never EXECUTED without an execution.
 *   3. If execution is rejected, APPROVED → PENDING is restored so the user can
 *      retry or decline.
 *
 * A retry of an already-executed proposal returns the recorded execution
 * instead of executing again, so an uncertain network response cannot duplicate
 * an order.
 */
export async function POST(request: Request) {
  const auth = requireAuth(request);
  if (!auth.ok) return auth.response;
  const userId = auth.value.id;

  try {
    const sameOrigin = requireSameOrigin(request);
    if (!sameOrigin.ok) return sameOrigin.response;

    const body = await readJsonBody(request);
    const { action } = body;

    // ── Action 1: generate a proposal ─────────────────────────────────────
    if (action === 'generate') {
      const { portfolioId, assetId, side = 'BUY', horizon = 'LONG_TERM' } = body;

      const owned = requireOwnedPortfolio(userId, portfolioId);
      if (!owned.ok) return owned.response;

      const proposal = await investmentStrategistAgent.evaluateAndPropose({
        portfolioId: owned.value.id,
        assetId: String(assetId),
        action: side as 'BUY' | 'SELL',
        horizon: horizon as 'LONG_TERM' | 'SHORT_TERM'
      });
      return NextResponse.json({ success: true, proposal });
    }

    // ── Action 2: approve or reject ───────────────────────────────────────
    if (action === 'respond') {
      const proposalIdInput = requireId(body.proposalId, 'proposalId');
      if (!proposalIdInput.ok) return proposalIdInput.response;
      const proposalId = proposalIdInput.value;
      const { decision } = body;

      if (decision !== 'APPROVE' && decision !== 'REJECT') {
        return NextResponse.json(
          { error: "decision must be 'APPROVE' or 'REJECT'" },
          { status: 400 }
        );
      }

      // Ownership and existence in one query: another user's proposal is
      // indistinguishable from a missing one.
      const proposal = db.queryOne<ProposalRecord>(
        `SELECT p.id, p.portfolio_id, p.asset_id, p.action, p.proposed_quantity,
                p.proposed_price, p.status, p.expires_at
         FROM investment_proposals p
         JOIN portfolios pt ON p.portfolio_id = pt.id
         WHERE p.id = ? AND pt.user_id = ?`,
        [proposalId, userId]
      );

      if (!proposal) {
        return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
      }

      if (decision === 'REJECT') {
        if (proposal.status !== 'PENDING') {
          return NextResponse.json(
            { error: `Proposal is ${proposal.status} and can no longer be changed.` },
            { status: 409 }
          );
        }
        const rejected = db.execute(
          "UPDATE investment_proposals SET status = 'REJECTED_USER' WHERE id = ? AND status = 'PENDING'",
          [proposalId]
        );
        if (rejected.changes !== 1) {
          return NextResponse.json({ error: 'Proposal changed concurrently.' }, { status: 409 });
        }
        return NextResponse.json({ success: true, status: 'REJECTED_USER' });
      }

      // ── APPROVE ─────────────────────────────────────────────────────────
      // A retry after an uncertain response returns the original execution.
      if (proposal.status === 'EXECUTED') {
        const existing = db.queryOne(
          `SELECT o.id, o.submitted_at, e.id AS execution_id, e.fill_price, e.net_amount
           FROM orders o LEFT JOIN executions e ON e.order_id = o.id
           WHERE o.proposal_id = ? ORDER BY o.submitted_at ASC LIMIT 1`,
          [proposalId]
        );
        return NextResponse.json(
          { success: true, status: 'EXECUTED', replayed: true, execution: existing ?? null },
          { headers: { 'Cache-Control': 'no-store' } }
        );
      }

      if (proposal.status !== 'PENDING') {
        return NextResponse.json(
          { error: `Proposal is ${proposal.status} and can no longer be approved.` },
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

      // Exactly one concurrent approval can win this conditional update.
      const approval = db.execute(
        "UPDATE investment_proposals SET status = 'APPROVED' WHERE id = ? AND status = 'PENDING'",
        [proposalId]
      );
      if (approval.changes !== 1) {
        return NextResponse.json({ error: 'Proposal is no longer pending.' }, { status: 409 });
      }

      try {
        // No client- or proposal-supplied price: the execution agent fills from
        // its own stored quote and re-verifies every proposal field.
        const execution = await portfolioExecutionAgent.executeOrder({
          portfolioId: proposal.portfolio_id,
          assetId: proposal.asset_id,
          side: proposal.action,
          quantity: proposal.proposed_quantity,
          orderMode: 'AI_PROPOSAL_APPROVED',
          proposalId: proposal.id,
          idempotencyKey: `proposal_${proposal.id}`
        });
        return NextResponse.json(
          { success: true, status: 'EXECUTED', execution },
          { headers: { 'Cache-Control': 'no-store' } }
        );
      } catch (execError: unknown) {
        // The execution transaction rolled back, so nothing was written. Put the
        // proposal back to PENDING only if it is still APPROVED — if it is
        // already EXECUTED the trade committed and must not be reverted.
        db.execute(
          "UPDATE investment_proposals SET status = 'PENDING' WHERE id = ? AND status = 'APPROVED'",
          [proposalId]
        );

        if (execError instanceof AppError) {
          return NextResponse.json(
            { error: execError.message, code: execError.code, status: 'PENDING' },
            { status: execError.statusCode }
          );
        }
        throw execError;
      }
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: unknown) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return errorResponse(err, 'proposals');
  }
}
