import { NextResponse } from 'next/server';
import db from '@/db';
import { requireAuth } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';

/**
 * GET /api/portfolios — portfolios, positions and cash ledger for the caller
 * only. Every query is scoped by portfolios.user_id; there is no unscoped
 * fallback.
 */
export async function GET(request: Request) {
  const auth = requireAuth(request);
  if (!auth.ok) return auth.response;
  const userId = auth.value.id;

  const portfolios = db.query(
    `SELECT p.*,
       (SELECT COUNT(*) FROM positions WHERE portfolio_id = p.id) as position_count,
       (SELECT status FROM broker_connections WHERE id = p.broker_connection_id) as broker_status,
       (SELECT broker_name FROM broker_connections WHERE id = p.broker_connection_id) as broker_name
     FROM portfolios p
     WHERE p.user_id = ?
     ORDER BY p.type DESC`,
    [userId]
  );

  const positions = db.query(
    `SELECT pos.*, a.symbol, a.name, a.sector, a.exchange
     FROM positions pos
     JOIN portfolios p ON pos.portfolio_id = p.id
     JOIN assets a ON pos.asset_id = a.id
     WHERE p.user_id = ?
     ORDER BY pos.invested_amount DESC`,
    [userId]
  );

  const ledger = db.query(
    `SELECT l.*
     FROM cash_ledger_entries l
     JOIN portfolios p ON l.portfolio_id = p.id
     WHERE p.user_id = ?
     ORDER BY l.created_at DESC LIMIT 50`,
    [userId]
  );

  return NextResponse.json(
    { portfolios, positions, ledger },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
