import { NextResponse } from 'next/server';
import db from '@/db';

const USER_ID = 'usr_pilot_01';
const CONTROL_MODES = new Set(['MANUAL', 'COPILOT', 'SUPERVISED', 'AUTONOMOUS_PAPER', 'AUTHORISED_LIVE']);
const EXPERIENCE_MODES = new Set(['BEGINNER', 'ADVANCED']);

export async function GET() {
  const settings = db.queryOne('SELECT * FROM user_settings WHERE user_id = ?', [USER_ID]);
  const permissions = db.query(`
    SELECT p.*, pt.type as portfolio_type, pt.name as portfolio_name
    FROM portfolio_permissions p
    JOIN portfolios pt ON p.portfolio_id = pt.id
    WHERE pt.user_id = ?
    ORDER BY pt.type
  `, [USER_ID]);
  const notifications = db.query(
    'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20',
    [USER_ID]
  );
  return NextResponse.json({ settings, permissions, notifications });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'toggle_emergency_stop') {
      const { enable, reason = 'User triggered emergency halt' } = body;
      if (typeof enable !== 'boolean') {
        return NextResponse.json({ error: 'enable must be a boolean' }, { status: 400 });
      }
      db.transaction((database) => {
        database.prepare(`
          UPDATE user_settings
          SET emergency_stop_enabled = ?, emergency_stop_reason = ?,
              emergency_stopped_at = CASE WHEN ? = 1 THEN datetime('now') ELSE NULL END,
              updated_at = datetime('now')
          WHERE user_id = ?
        `).run(enable ? 1 : 0, enable ? String(reason).slice(0, 500) : null, enable ? 1 : 0, USER_ID);
        database.prepare(`
          INSERT INTO audit_logs (id, user_id, action_type, actor, details, created_at)
          VALUES (?, ?, ?, 'USER', ?, datetime('now'))
        `).run(
          `aud_em_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          USER_ID,
          enable ? 'EMERGENCY_STOP_TRIGGERED' : 'EMERGENCY_STOP_RELEASED',
          enable ? `Emergency stop engaged: ${String(reason).slice(0, 500)}` : 'Emergency stop disengaged by user.'
        );
      });
      return NextResponse.json({ success: true, emergency_stop_enabled: enable });
    }

    if (action === 'update_mode') {
      const { controlMode, experienceMode } = body;
      if (controlMode !== undefined && !CONTROL_MODES.has(controlMode)) {
        return NextResponse.json({ error: 'Invalid controlMode' }, { status: 400 });
      }
      if (experienceMode !== undefined && !EXPERIENCE_MODES.has(experienceMode)) {
        return NextResponse.json({ error: 'Invalid experienceMode' }, { status: 400 });
      }
      if (controlMode === undefined && experienceMode === undefined) {
        return NextResponse.json({ error: 'No settings supplied' }, { status: 400 });
      }
      if (controlMode !== undefined) {
        // A UI setting alone must never enable live execution.
        if (controlMode === 'AUTHORISED_LIVE') {
          return NextResponse.json({ error: 'Live trading is disabled until a verified broker adapter and fill reconciliation are implemented.' }, { status: 403 });
        }
        db.execute('UPDATE user_settings SET control_mode = ?, updated_at = datetime(\'now\') WHERE user_id = ?', [controlMode, USER_ID]);
      }
      if (experienceMode !== undefined) {
        db.execute('UPDATE user_settings SET experience_mode = ?, updated_at = datetime(\'now\') WHERE user_id = ?', [experienceMode, USER_ID]);
      }
      return NextResponse.json({ success: true, controlMode, experienceMode });
    }

    if (action === 'update_permissions') {
      const { portfolioId, maxPositionPct, maxExposurePct, minCashPct, allowAutonomous } = body;
      const portfolio = db.queryOne<{ id: string; type: string; user_id: string }>(
        'SELECT id, type, user_id FROM portfolios WHERE id = ? AND user_id = ?',
        [portfolioId, USER_ID]
      );
      if (!portfolio) return NextResponse.json({ error: 'Portfolio not found' }, { status: 404 });
      if (portfolio.type === 'REAL' && allowAutonomous === true) {
        return NextResponse.json({ error: 'Autonomous live trading is disabled until real broker execution is implemented and verified.' }, { status: 403 });
      }
      const pctFields = [maxPositionPct, maxExposurePct, minCashPct];
      if (pctFields.some(v => v !== undefined && v !== null && (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 100))) {
        return NextResponse.json({ error: 'Risk percentages must be between 0 and 100' }, { status: 400 });
      }
      if (allowAutonomous !== undefined && typeof allowAutonomous !== 'boolean' && allowAutonomous !== 0 && allowAutonomous !== 1) {
        return NextResponse.json({ error: 'allowAutonomous must be a boolean' }, { status: 400 });
      }
      db.execute(`
        UPDATE portfolio_permissions SET
          max_position_pct = COALESCE(?, max_position_pct),
          max_portfolio_exposure_pct = COALESCE(?, max_portfolio_exposure_pct),
          min_cash_reserve_pct = COALESCE(?, min_cash_reserve_pct),
          allow_autonomous_trading = COALESCE(?, allow_autonomous_trading)
        WHERE portfolio_id = ?
      `, [maxPositionPct ?? null, maxExposurePct ?? null, minCashPct ?? null,
          allowAutonomous === undefined ? null : (allowAutonomous ? 1 : 0), portfolioId]);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid settings action' }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unexpected settings error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
