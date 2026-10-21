import { NextResponse } from 'next/server';
import db from '@/db';
import backtestEngine from '@/lib/backtesting/engine';
import { ValidationError } from '@/lib/validation';
import { requireAuth, requireSameOrigin } from '@/lib/auth/guard';
import { consumeQuota } from '@/lib/auth/quota';
import { AppError } from '@/lib/errors';
import { errorResponse, readJsonBody } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * Backtests are research artifacts shared by the workspace, not per-user data,
 * so they are not row-scoped. They still require an authenticated session and
 * are quota-limited because the computation is CPU-bound.
 */
export async function GET(request: Request) {
  const auth = requireAuth(request);
  if (!auth.ok) return auth.response;

  const backtests = db.query(`
    SELECT b.*, v.version_tag, s.name as strategy_name 
    FROM backtest_runs b
    JOIN strategy_versions v ON b.strategy_version_id = v.id
    JOIN strategy_definitions s ON v.strategy_id = s.id
    ORDER BY b.created_at DESC
    LIMIT 100
  `);

  const strategies = db.query(`
    SELECT s.*, v.version_tag, v.parameters_json, v.status as version_status
    FROM strategy_definitions s
    LEFT JOIN strategy_versions v ON s.active_version_id = v.id
  `);

  return NextResponse.json({ backtests, strategies }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const auth = requireAuth(request);
  if (!auth.ok) return auth.response;

  const sameOrigin = requireSameOrigin(request);
  if (!sameOrigin.ok) return sameOrigin.response;

  const quota = consumeQuota('backtest', auth.value.id);
  if (!quota.allowed) {
    return NextResponse.json(
      { error: 'Backtest quota exceeded. Try again later.', code: 'QUOTA_EXCEEDED' },
      {
        status: 429,
        headers: { 'Cache-Control': 'no-store', 'Retry-After': String(quota.retryAfterSeconds) }
      }
    );
  }

  try {
    const body = await readJsonBody(request, { maxBytes: 8_192 });

    // Explicit presence checks: `||` would silently replace a legitimate 0
    // (a zero slippage assumption is valid) with the default.
    const result = await backtestEngine.runBacktest({
      strategyVersionId:
        body.strategyVersionId === undefined ? 'ver_strat_1_v12' : (body.strategyVersionId as string),
      assetSymbols:
        body.assetSymbols === undefined
          ? ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK']
          : (body.assetSymbols as string[]),
      initialCapital: body.initialCapital === undefined ? 25_000 : Number(body.initialCapital),
      slippagePct: body.slippagePct === undefined ? 0.05 : Number(body.slippagePct),
      brokeragePerTrade:
        body.brokeragePerTrade === undefined ? 20 : Number(body.brokeragePerTrade)
    });

    return NextResponse.json(
      { success: true, result, quotaRemaining: quota.remaining },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err: unknown) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message, code: 'INVALID_BACKTEST_INPUT' }, { status: 400 });
    }
    if (err instanceof AppError) return errorResponse(err, 'backtest');
    // The engine refuses to emit numbers it cannot support; that is a 422, not
    // a server fault.
    if (err instanceof Error && /no trades/i.test(err.message)) {
      return NextResponse.json({ error: err.message, code: 'NO_TRADES' }, { status: 422 });
    }
    return errorResponse(err, 'backtest');
  }
}
