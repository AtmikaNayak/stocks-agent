import { NextResponse } from 'next/server';
import db from '@/db';
import portfolioExecutionAgent from '@/lib/agents/portfolio-execution';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const portfolioId = searchParams.get('portfolioId');

  let ordersSql = `
    SELECT o.*, a.symbol, a.name 
    FROM orders o 
    JOIN assets a ON o.asset_id = a.id
  `;
  const params: any[] = [];

  if (portfolioId) {
    ordersSql += ' WHERE o.portfolio_id = ?';
    params.push(portfolioId);
  }
  ordersSql += ' ORDER BY o.submitted_at DESC LIMIT 50';

  const orders = db.query(ordersSql, params);

  const executions = db.query(`
    SELECT e.*, a.symbol, a.name 
    FROM executions e 
    JOIN assets a ON e.asset_id = a.id
    ${portfolioId ? 'WHERE e.portfolio_id = ?' : ''}
    ORDER BY e.executed_at DESC LIMIT 50
  `, params);

  return NextResponse.json({ orders, executions });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { portfolioId, assetId, side, quantity, price, orderMode = 'MANUAL', productType = 'CNC', proposalId } = body;

    if (!portfolioId || !assetId || !side || quantity === undefined || quantity === null) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }
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
      portfolioId,
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
