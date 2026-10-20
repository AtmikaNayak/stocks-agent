import { NextResponse } from 'next/server';
import db from '@/db';

export async function GET() {
  const portfolios = db.query(`
    SELECT p.*, 
      (SELECT COUNT(*) FROM positions WHERE portfolio_id = p.id) as position_count,
      (SELECT status FROM broker_connections WHERE id = p.broker_connection_id) as broker_status,
      (SELECT broker_name FROM broker_connections WHERE id = p.broker_connection_id) as broker_name
    FROM portfolios p
    ORDER BY p.type DESC
  `);

  const positions = db.query(`
    SELECT p.*, a.symbol, a.name, a.sector, a.exchange
    FROM positions p
    JOIN assets a ON p.asset_id = a.id
    ORDER BY p.invested_amount DESC
  `);

  const ledger = db.query(`
    SELECT * FROM cash_ledger_entries
    ORDER BY created_at DESC LIMIT 50
  `);

  return NextResponse.json({
    portfolios,
    positions,
    ledger
  });
}
