import { NextResponse } from 'next/server';
import db from '@/db';
import portfolioExecutionAgent from '@/lib/agents/portfolio-execution';
import { requireAuth, requireOwnedPortfolio } from '@/lib/auth/guard';

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

export async function POST(request: Request) {
  const auth = requireAuth(request);
  if (!auth.ok) return auth.response;
  const userId = auth.value.id;

  try {
    const body = await request.json();
    const { portfolioId, assetId, side, quantity, price, orderMode = 'MANUAL', productType = 'CNC', proposalId } = body;

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
      return NextResponse.json({ error: 'quantity must be a positive whole number of shares' }, { status: 400 });
    }
    if (price !== undefined) {
      return NextResponse.json({ error: 'Custom fill prices are not supported. Use the stored quote for simulation.' }, { status: 400 });
    }

    const result = await portfolioExecutionAgent.executeOrder({
      portfolioId: owned.value.id,
      assetId,
      side,
      quantity: numericQuantity,
      orderMode,
      productType,
      proposalId
    });

    return NextResponse.json({ success: true, result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Execution error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
