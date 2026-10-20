import { NextResponse } from 'next/server';
import db from '@/db';
import explainabilityAgent from '@/lib/agents/explainability';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const portfolioId = searchParams.get('portfolioId') || 'port_virt_01';
  const type = searchParams.get('type');

  if (type === 'report') {
    const report = explainabilityAgent.generateDailyReport(portfolioId);
    return NextResponse.json({ report });
  }

  const decisions = db.query(`
    SELECT d.*, a.symbol, a.name 
    FROM decision_records d
    JOIN assets a ON d.asset_id = a.id
    WHERE d.portfolio_id = ?
    ORDER BY d.decision_timestamp DESC LIMIT 30
  `, [portfolioId]);

  const evidence = db.query(`
    SELECT e.*, d.asset_id, a.symbol 
    FROM decision_evidence e
    JOIN decision_records d ON e.decision_id = d.id
    JOIN assets a ON d.asset_id = a.id
    ORDER BY e.source_timestamp DESC LIMIT 50
  `);

  return NextResponse.json({ decisions, evidence });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { portfolioId = 'port_virt_01', question } = body;

    if (!question) {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 });
    }

    const answer = await explainabilityAgent.answerHistoricalQuestion(portfolioId, question);
    return NextResponse.json({ success: true, answer });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
