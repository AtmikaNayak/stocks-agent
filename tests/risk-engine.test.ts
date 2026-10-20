import { describe, it, expect } from 'vitest';
import db from '../src/db';
import { evaluateProposalRisk } from '../src/lib/risk-engine';

describe('Deterministic Risk Management Engine', () => {
  it('blocks order that exceeds single stock position concentration (15%)', () => {
    // Virtual portfolio has ₹25,000 total value.
    // 15% is ₹3,750 max. An order of ₹10,000 should fail concentration check.
    const result = evaluateProposalRisk({
      portfolioId: 'port_virt_01',
      assetId: 'ast_reliance',
      side: 'BUY',
      quantity: 5,
      price: 2942.50 // ~₹14,712 > 15% limit
    });

    expect(result.passed).toBe(false);
    expect(result.reasons.some(r => r.includes('concentration'))).toBe(true);
  });

  it('allows safe conservative order within position and cash limits', () => {
    // 1 share of TATAMOTORS at ₹924 is ~3.7% of ₹25,000 -> well within 15%
    const result = evaluateProposalRisk({
      portfolioId: 'port_virt_01',
      assetId: 'ast_tatamotors',
      side: 'BUY',
      quantity: 1,
      price: 924.10
    });

    expect(result.passed).toBe(true);
    expect(result.reasons.length).toBe(0);
    expect(result.calculatedPositionPct).toBeLessThanOrEqual(15.0);
  });

  it('strictly blocks real money execution when broker is disconnected', () => {
    // Real portfolio has broker disconnected
    const result = evaluateProposalRisk({
      portfolioId: 'port_real_01',
      assetId: 'ast_reliance',
      side: 'BUY',
      quantity: 1,
      price: 2942.50
    });

    expect(result.passed).toBe(false);
    expect(result.reasons.some(r => r.includes('broker') || r.includes('Broker'))).toBe(true);
  });

  it('immediately blocks all orders when emergency stop is triggered', () => {
    // Enable emergency stop
    db.execute('UPDATE user_settings SET emergency_stop_enabled = 1, emergency_stop_reason = ? WHERE user_id = ?', ['Manual drill test', 'usr_pilot_01']);

    const result = evaluateProposalRisk({
      portfolioId: 'port_virt_01',
      assetId: 'ast_tatamotors',
      side: 'BUY',
      quantity: 1,
      price: 924.10
    });

    expect(result.passed).toBe(false);
    expect(result.reasons.some(r => r.includes('Emergency stop'))).toBe(true);

    // Revert emergency stop for subsequent tests
    db.execute('UPDATE user_settings SET emergency_stop_enabled = 0, emergency_stop_reason = NULL WHERE user_id = ?', ['usr_pilot_01']);
  });
});
