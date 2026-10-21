import { NextResponse } from 'next/server';
import db from '@/db';
import explainabilityAgent from '@/lib/agents/explainability';
import { requireAuth, requirePortfolioForRequest, requireSameOrigin } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = requireAuth(request);
  if (!auth.ok) return auth.response;
  const userId = auth.value.id;

  const { searchParams } = new URL(request.url);
  const requestedPortfolioId = searchParams.get('portfolioId');
  const type = searchParams.get('type');

  const portfolio = requirePortfolioForRequest(userId, requestedPortfolioId);
  if (!portfolio.ok) return portfolio.response;
  const portfolioId = portfolio.value.id;

  if (type === 'report') {
    const report = explainabilityAgent.generateDailyReport(portfolioId);
    return NextResponse.json({ report }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const decisions = db.query(
    `SELECT d.*, a.symbol, a.name
     FROM decision_records d
     JOIN assets a ON d.asset_id = a.id
     WHERE d.portfolio_id = ?
     ORDER BY d.decision_timestamp DESC LIMIT 30`,
    [portfolioId]
  );

  // Evidence is scoped to decisions made for this portfolio only.
  const evidence = db.query(
    `SELECT e.*, d.asset_id, a.symbol
     FROM decision_evidence e
     JOIN decision_records d ON e.decision_id = d.id
     JOIN assets a ON d.asset_id = a.id
     WHERE d.portfolio_id = ?
     ORDER BY e.source_timestamp DESC LIMIT 50`,
    [portfolioId]
  );

  return NextResponse.json({ decisions, evidence }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const auth = requireAuth(request);
  if (!auth.ok) return auth.response;
  const userId = auth.value.id;

  try {
    const sameOrigin = requireSameOrigin(request);
    if (!sameOrigin.ok) return sameOrigin.response;

    const body = await request.json();
    const { portfolioId: requestedPortfolioId, question } = body;

    const portfolio = requirePortfolioForRequest(userId, requestedPortfolioId);
    if (!portfolio.ok) return portfolio.response;

    if (!question) {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 });
    }

    const answer = await explainabilityAgent.answerHistoricalQuestion(portfolio.value.id, question);
    return NextResponse.json({ success: true, answer });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
