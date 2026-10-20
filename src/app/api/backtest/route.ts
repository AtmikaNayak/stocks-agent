import { NextResponse } from 'next/server';
import db from '@/db';
import backtestEngine from '@/lib/backtesting/engine';

export async function GET() {
  const backtests = db.query(`
    SELECT b.*, v.version_tag, s.name as strategy_name 
    FROM backtest_runs b
    JOIN strategy_versions v ON b.strategy_version_id = v.id
    JOIN strategy_definitions s ON v.strategy_id = s.id
    ORDER BY b.created_at DESC
  `);

  const strategies = db.query(`
    SELECT s.*, v.version_tag, v.parameters_json, v.status as version_status
    FROM strategy_definitions s
    LEFT JOIN strategy_versions v ON s.active_version_id = v.id
  `);

  return NextResponse.json({ backtests, strategies });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { strategyVersionId = 'ver_strat_1_v12', assetSymbols = ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK'] } = body;

    const result = await backtestEngine.runBacktest({
      strategyVersionId,
      assetSymbols,
      initialCapital: body.initialCapital || 25000.0,
      slippagePct: body.slippagePct || 0.05,
      brokeragePerTrade: body.brokeragePerTrade || 20.0
    });

    return NextResponse.json({ success: true, result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
