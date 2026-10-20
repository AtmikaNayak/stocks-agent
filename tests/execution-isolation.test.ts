import { describe, it, expect } from 'vitest';
import db from '../src/db';
import portfolioExecutionAgent from '../src/lib/agents/portfolio-execution';

describe('Financial Isolation & Execution Engine', () => {
  it('executes virtual order, debits cash ledger, updates position and leaves real portfolio untouched', async () => {
    // Initial virtual cash
    const initialVirt = db.queryOne<{ current_cash: number; total_value: number }>('SELECT current_cash, total_value FROM portfolios WHERE id = ?', ['port_virt_01'])!;
    const initialReal = db.queryOne<{ current_cash: number; total_value: number }>('SELECT current_cash, total_value FROM portfolios WHERE id = ?', ['port_real_01'])!;

    const execResult = await portfolioExecutionAgent.executeOrder({
      portfolioId: 'port_virt_01',
      assetId: 'ast_itc', // ₹492 per share
      side: 'BUY',
      quantity: 2,
      orderMode: 'AUTONOMOUS_VIRTUAL'
    });

    expect(execResult.executionId).toBeDefined();
    expect(execResult.charges.totalCharges).toBeGreaterThan(0);

    // Verify virtual portfolio cash decreased
    const afterVirt = db.queryOne<{ current_cash: number; invested_value: number }>('SELECT current_cash, invested_value FROM portfolios WHERE id = ?', ['port_virt_01'])!;
    expect(afterVirt.current_cash).toBeLessThan(initialVirt.current_cash);
    expect(afterVirt.invested_value).toBeGreaterThan(0);

    // Verify real portfolio remained 100% untouched
    const afterReal = db.queryOne<{ current_cash: number; total_value: number }>('SELECT current_cash, total_value FROM portfolios WHERE id = ?', ['port_real_01'])!;
    expect(afterReal.current_cash).toBe(initialReal.current_cash);
    expect(afterReal.total_value).toBe(initialReal.total_value);

    // Check double-entry cash ledger entry exists
    const ledger = db.queryOne<{ amount: number; entry_type: string }>(
      'SELECT amount, entry_type FROM cash_ledger_entries WHERE portfolio_id = ? AND reference_id = ?',
      ['port_virt_01', execResult.executionId]
    );
    expect(ledger).toBeDefined();
    expect(ledger?.entry_type).toBe('BUY_ORDER');
    expect(ledger?.amount).toBeLessThan(0);
  });

  it('blocks every real-money execution attempt before changing ledger or order state', async () => {
    const beforePortfolio = db.queryOne<{ current_cash: number; total_value: number }>(
      'SELECT current_cash, total_value FROM portfolios WHERE id = ?',
      ['port_real_01']
    )!;
    const beforeOrders = db.queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM orders WHERE portfolio_id = ?',
      ['port_real_01']
    )!.count;

    await expect(portfolioExecutionAgent.executeOrder({
      portfolioId: 'port_real_01',
      assetId: 'ast_itc',
      side: 'BUY',
      quantity: 1,
      orderMode: 'MANUAL'
    })).rejects.toThrow('REAL portfolio execution is disabled');

    const afterPortfolio = db.queryOne<{ current_cash: number; total_value: number }>(
      'SELECT current_cash, total_value FROM portfolios WHERE id = ?',
      ['port_real_01']
    )!;
    const afterOrders = db.queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM orders WHERE portfolio_id = ?',
      ['port_real_01']
    )!.count;

    expect(afterPortfolio.current_cash).toBe(beforePortfolio.current_cash);
    expect(afterPortfolio.total_value).toBe(beforePortfolio.total_value);
    expect(afterOrders).toBe(beforeOrders);
  });

  it('rejects non-positive or fractional quantities before touching a portfolio', async () => {
    await expect(portfolioExecutionAgent.executeOrder({
      portfolioId: 'port_virt_01',
      assetId: 'ast_itc',
      side: 'BUY',
      quantity: 0,
      orderMode: 'MANUAL'
    })).rejects.toThrow('positive whole number');

    await expect(portfolioExecutionAgent.executeOrder({
      portfolioId: 'port_virt_01',
      assetId: 'ast_itc',
      side: 'BUY',
      quantity: 1.5,
      orderMode: 'MANUAL'
    })).rejects.toThrow('positive whole number');
  });

  it('rejects client-supplied prices rather than simulating a forged fill', async () => {
    await expect(portfolioExecutionAgent.executeOrder({
      portfolioId: 'port_virt_01',
      assetId: 'ast_itc',
      side: 'BUY',
      quantity: 1,
      price: 1,
      orderMode: 'MANUAL'
    })).rejects.toThrow('Custom fill prices are disabled');
  });
});
