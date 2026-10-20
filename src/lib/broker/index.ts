import db from '../../db';

export interface BrokerAuthInput {
  userId: string;
  brokerName: 'ZERODHA' | 'ANGEL_ONE' | 'UPSTOX';
  clientId: string;
  apiKey: string;
  apiSecret: string;
  totpCode?: string;
  complianceAcknowledged: boolean;
}

/**
 * This repository currently has no real broker adapter. Do not mark a connection
 * as connected or synthesize a margin balance/access token. Keep live trading
 * fail-closed until broker-specific OAuth/session, order submission, order
 * status polling and fill reconciliation are implemented and tested.
 */
export class BrokerIntegrationService {
  async connectBroker(input: BrokerAuthInput) {
    const { userId, brokerName, clientId, apiKey, complianceAcknowledged } = input;
    if (!complianceAcknowledged) {
      throw new Error('Compliance acknowledgement is required before broker connection.');
    }
    if (!clientId || !apiKey || !input.apiSecret) {
      throw new Error('Client ID, API key and API secret are required.');
    }
    const user = db.queryOne<{ id: string }>('SELECT id FROM users WHERE id = ?', [userId]);
    if (!user) throw new Error('User not found.');

    // Fail closed. This build cannot authenticate a broker; invalidate any old
    // mock connection state for the user instead of leaving an apparently-live session.
    db.execute(`
      UPDATE broker_connections SET status = 'DISCONNECTED',
        encrypted_access_token = NULL,
        status_message = 'Live broker adapter is not implemented; no authenticated session is active.',
        updated_at = datetime('now')
      WHERE user_id = ?
    `, [userId]);
    db.execute(`
      UPDATE portfolio_permissions SET allow_autonomous_trading = 0
      WHERE portfolio_id IN (SELECT id FROM portfolios WHERE user_id = ? AND type = 'REAL')
    `, [userId]);
    db.execute(`
      UPDATE user_settings
      SET control_mode = CASE WHEN control_mode = 'AUTHORISED_LIVE' THEN 'COPILOT' ELSE control_mode END,
          updated_at = datetime('now')
      WHERE user_id = ?
    `, [userId]);
    throw new Error('Live broker connection is not available yet. This build has no verified broker authentication or order/fill adapter. Virtual trading remains available.');
  }

  async disconnectBroker(userId: string) {
    const brokers = db.query<{ id: string; broker_name: string }>(
      'SELECT id, broker_name FROM broker_connections WHERE user_id = ?',
      [userId]
    );
    db.transaction((database) => {
      database.prepare(`
        UPDATE broker_connections SET status = 'DISCONNECTED',
          encrypted_access_token = NULL,
          status_message = 'Disconnected by user; live execution disabled.',
          updated_at = datetime('now')
        WHERE user_id = ?
      `).run(userId);
      database.prepare(`
        UPDATE portfolio_permissions SET allow_autonomous_trading = 0
        WHERE portfolio_id IN (SELECT id FROM portfolios WHERE user_id = ? AND type = 'REAL')
      `).run(userId);
      database.prepare(`
        UPDATE user_settings SET control_mode = CASE
          WHEN control_mode = 'AUTHORISED_LIVE' THEN 'COPILOT' ELSE control_mode END,
          updated_at = datetime('now') WHERE user_id = ?
      `).run(userId);
      database.prepare(`
        INSERT INTO audit_logs (id, user_id, action_type, actor, details, created_at)
        VALUES (?, ?, 'BROKER_DISCONNECTED', 'USER', ?, datetime('now'))
      `).run(
        `aud_disc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        userId,
        `Broker connections set to disconnected (${brokers.length} record(s)); live execution remains disabled.`
      );
    });
    return { status: 'DISCONNECTED' as const };
  }
}

export const brokerService = new BrokerIntegrationService();
export default brokerService;
