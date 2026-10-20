import { NextResponse } from 'next/server';
import db from '@/db';

export async function GET() {
  const settings = db.queryOne('SELECT * FROM user_settings WHERE user_id = "usr_pilot_01"');
  const permissions = db.query(`
    SELECT p.*, pt.type as portfolio_type, pt.name as portfolio_name 
    FROM portfolio_permissions p
    JOIN portfolios pt ON p.portfolio_id = pt.id
  `);
  const notifications = db.query('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 20');

  return NextResponse.json({ settings, permissions, notifications });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'toggle_emergency_stop') {
      const { enable, reason = 'User triggered emergency halt' } = body;
      db.execute(`
        UPDATE user_settings SET 
          emergency_stop_enabled = ?,
          emergency_stop_reason = ?,
          emergency_stopped_at = datetime('now')
        WHERE user_id = 'usr_pilot_01'
      `, [enable ? 1 : 0, enable ? reason : null]);

      db.execute(`
        INSERT INTO audit_logs (id, user_id, action_type, actor, details, created_at)
        VALUES (?, 'usr_pilot_01', ?, 'EMERGENCY_STOP', ?, datetime('now'))
      `, [
        `aud_em_${Date.now()}`,
        enable ? 'EMERGENCY_STOP_TRIGGERED' : 'EMERGENCY_STOP_RELEASED',
        enable ? `Emergency stop engaged: ${reason}` : 'Emergency stop disengaged by user.'
      ]);

      return NextResponse.json({ success: true, emergency_stop_enabled: enable });
    }

    if (action === 'update_mode') {
      const { controlMode, experienceMode } = body;
      if (controlMode) {
        db.execute('UPDATE user_settings SET control_mode = ? WHERE user_id = "usr_pilot_01"', [controlMode]);
      }
      if (experienceMode) {
        db.execute('UPDATE user_settings SET experience_mode = ? WHERE user_id = "usr_pilot_01"', [experienceMode]);
      }
      return NextResponse.json({ success: true, controlMode, experienceMode });
    }

    if (action === 'update_permissions') {
      const { portfolioId, maxPositionPct, maxExposurePct, minCashPct, allowAutonomous } = body;
      db.execute(`
        UPDATE portfolio_permissions SET
          max_position_pct = COALESCE(?, max_position_pct),
          max_portfolio_exposure_pct = COALESCE(?, max_portfolio_exposure_pct),
          min_cash_reserve_pct = COALESCE(?, min_cash_reserve_pct),
          allow_autonomous_trading = COALESCE(?, allow_autonomous_trading)
        WHERE portfolio_id = ?
      `, [maxPositionPct, maxExposurePct, minCashPct, allowAutonomous, portfolioId]);

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid settings action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
