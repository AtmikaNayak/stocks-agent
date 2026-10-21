import { NextResponse } from 'next/server';
import db from '@/db';
import portfolioExecutionAgent from '@/lib/agents/portfolio-execution';
import { requireAuth, requireOwnedPortfolio } from '@/lib/auth/guard';
import { AppError } from '@/lib/errors';
import { IDEMPOTENCY_HEADER } from '@/lib/idempotency';
import { errorResponse, readJsonBody } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = requireAuth(request);
  if (!auth.ok) return auth.response;
  const userId = auth.value.id;

  const { searchParams } = new URL(request.url);
  const portfolioId = searchParams.get('portfolioId');

  if (portfolioId) {
    // A portfolio id that is not yours is reported exactly like a missing one.
    const owned = requireOwnedPortfolio(userId, portfolioId);
    if (!owned.ok) return owned.response;
  }

  const filter = portfolioId ? ' AND o.portfolio_id = ?' : '';
  const params: string[] = portfolioId ? [userId, portfolioId] : [userId];

  const orders = db.query(
    `SELECT o.*, a.symbol, a.name
     FROM orders o
     JOIN portfolios p ON o.portfolio_id = p.id
     JOIN assets a ON o.asset_id = a.id
     WHERE p.user_id = ?${filter}
     ORDER BY o.submitted_at DESC LIMIT 50`,
    params
  );

  const executions = db.query(
    `SELECT e.*, a.symbol, a.name
     FROM executions e
     JOIN portfolios p ON e.portfolio_id = p.id
     JOIN assets a ON e.asset_id = a.id
     WHERE p.user_id = ?${filter}
     ORDER BY e.executed_at DESC LIMIT 50`,
    params
  );

  return NextResponse.json({ orders, executions }, { headers: { 'Cache-Control': 'no-store' } });
}

/**
 * POST /api/orders — simulate an order in a VIRTUAL portfolio.
 *
 * Idempotency:
 *   Send `Idempotency-Key: <8–200 chars>` (or `idempotencyKey` in the body).
 *   The key is bound to the authenticated user and to a hash of the order
 *   details. Repeating the identical request returns the original result and
 *   performs no second trade; reusing the key with different details returns
 *   409. Without a key the server generates a random one, which provides
 *   storage uniqueness but no duplicate suppression — clients that need retry
 *   safety must supply a key.
 */
export async function POST(request: Request) {
  const auth = requireAuth(request);
  if (!auth.ok) return auth.response;
  const userId = auth.value.id;

  try {
    const body = await readJsonBody(request);
    const {
      portfolioId,
      assetId,
      side,
      quantity,
      price,
      orderMode = 'MANUAL',
      productType = 'CNC',
      proposalId,
      idempotencyKey
    } = body as Record<string, unknown>;

    if (!portfolioId || !assetId || !side || quantity === undefined || quantity === null) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    // Ownership is checked before the execution agent runs.
    const owned = requireOwnedPortfolio(userId, portfolioId);
    if (!owned.ok) return owned.response;

    if (side !== 'BUY' && side !== 'SELL') {
      return NextResponse.json({ error: 'side must be BUY or SELL' }, { status: 400 });
    }
    const numericQuantity = Number(quantity);
    if (!Number.isSafeInteger(numericQuantity) || numericQuantity <= 0) {
      return NextResponse.json(
        { error: 'quantity must be a positive whole number of shares' },
        { status: 400 }
      );
    }
    if (price !== undefined) {
      return NextResponse.json(
        { error: 'Custom fill prices are not supported. Use the stored quote for simulation.' },
        { status: 400 }
      );
    }

    // The header wins; a body field may only agree with it.
    const headerKey = request.headers.get(IDEMPOTENCY_HEADER);
    const bodyKey = typeof idempotencyKey === 'string' ? idempotencyKey : undefined;
    if (headerKey && bodyKey && headerKey.trim() !== bodyKey.trim()) {
      return NextResponse.json(
        { error: 'Idempotency-Key header and body idempotencyKey disagree.' },
        { status: 400 }
      );
    }
    const resolvedKey = headerKey ?? bodyKey;

    const result = await portfolioExecutionAgent.executeOrder({
      portfolioId: owned.value.id,
      assetId: String(assetId),
      side,
      quantity: numericQuantity,
      orderMode: (typeof orderMode === 'string' ? orderMode : 'MANUAL') as
        | 'MANUAL'
        | 'AI_PROPOSAL_APPROVED'
        | 'AUTONOMOUS_VIRTUAL'
        | 'AUTONOMOUS_LIVE',
      productType: (productType === 'MIS' ? 'MIS' : 'CNC') as 'CNC' | 'MIS',
      proposalId: typeof proposalId === 'string' ? proposalId : undefined,
      idempotencyKey: resolvedKey ?? undefined
    });

    return NextResponse.json(
      { success: true, result, replayed: result.replayed },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err: unknown) {
    return errorResponse(err, 'orders');
  }
}
