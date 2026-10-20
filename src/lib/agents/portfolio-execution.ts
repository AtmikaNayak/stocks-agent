import db from '../../db';
import marketData from '../market-data';
import { calculateIndianCharges } from '../tax-calculator';
import { evaluateProposalRisk } from '../risk-engine';
import { explainabilityAgent } from './explainability';
import { OrderSide, ProductType } from '../types';

export interface ExecuteOrderParams {
  portfolioId: string;
  assetId: string;
  side: OrderSide;
  quantity: number;
  price?: number; // supplied prices are rejected; simulated fills use the stored quote
  orderMode: 'MANUAL' | 'AI_PROPOSAL_APPROVED' | 'AUTONOMOUS_VIRTUAL' | 'AUTONOMOUS_LIVE';
  proposalId?: string;
  productType?: ProductType;
}

export class PortfolioExecutionAgent {
  name = 'PORTFOLIO_EXECUTION';

  async executeOrder(params: ExecuteOrderParams) {
    if (!Number.isSafeInteger(params.quantity) || params.quantity <= 0) {
      throw new Error('Quantity must be a positive whole number of shares.');
    }
    if (params.side !== 'BUY' && params.side !== 'SELL') {
      throw new Error('Unsupported order side.');
    }
    if (!['CNC', 'MIS'].includes(params.productType ?? 'CNC')) {
      throw new Error('Unsupported product type.');
    }
    if (!['MANUAL', 'AI_PROPOSAL_APPROVED', 'AUTONOMOUS_VIRTUAL', 'AUTONOMOUS_LIVE'].includes(params.orderMode)) {
      throw new Error('Unsupported order mode.');
    }
    if (params.price !== undefined) {
      throw new Error('Custom fill prices are disabled. The simulator uses its stored market-data quote.');
    }

    const {
      portfolioId,
      assetId,
      side,
      quantity,
      orderMode,
      proposalId,
      productType = 'CNC'
    } = params;

    // 1. Fetch Portfolio
    const portfolio = db.queryOne<{
      id: string;
      user_id: string;
      type: 'REAL' | 'VIRTUAL';
      current_cash: number;
      invested_value: number;
      total_value: number;
      realised_pnl: number;
      is_active: number;
      broker_connection_id: string | null;
    }>('SELECT * FROM portfolios WHERE id = ?', [portfolioId]);

    if (!portfolio || !portfolio.is_active) {
      throw new Error(`Portfolio ${portfolioId} is not active or not found.`);
    }

    // Fail closed for real-money accounts. No verified broker order submission
    // and fill reconciliation adapter exists in this repository yet.
    if (portfolio.type === 'REAL') {
      throw new Error('REAL portfolio execution is disabled: a verified broker order adapter and fill reconciliation are not implemented. Use the virtual portfolio.');
    }

    if (orderMode === 'AUTONOMOUS_LIVE') {
      throw new Error('AUTONOMOUS_LIVE is disabled in this build. Use a virtual portfolio.');
    }
    if (orderMode === 'AUTONOMOUS_VIRTUAL' && portfolio.type !== 'VIRTUAL') {
      throw new Error('AUTONOMOUS_VIRTUAL orders require a virtual portfolio.');
    }
    if (orderMode === 'AI_PROPOSAL_APPROVED') {
      if (!proposalId) {
        throw new Error('An approved proposal ID is required for AI-proposal execution.');
      }
      const proposal = db.queryOne<{
        id: string;
        portfolio_id: string;
        asset_id: string;
        action: string;
        proposed_quantity: number;
        status: string;
        expires_at: string;
      }>(
        'SELECT id, portfolio_id, asset_id, action, proposed_quantity, status, expires_at FROM investment_proposals WHERE id = ? AND portfolio_id = ? AND asset_id = ?',
        [proposalId, portfolioId, assetId]
      );
      if (
        !proposal ||
        proposal.status !== 'APPROVED' ||
        proposal.action !== side ||
        proposal.proposed_quantity !== quantity ||
        !Number.isFinite(Date.parse(proposal.expires_at)) ||
        Date.parse(proposal.expires_at) <= Date.now()
      ) {
        throw new Error('Proposal execution rejected: proposal must be approved, unexpired, and match the portfolio, asset, side, and quantity.');
      }
    } else if (proposalId) {
      throw new Error('A proposal ID can only be executed with AI_PROPOSAL_APPROVED mode.');
    }

    // 2. Fetch Asset & Current Price
    const asset = db.queryOne<{ id: string; symbol: string; name: string }>(
      'SELECT id, symbol, name FROM assets WHERE id = ?',
      [assetId]
    );
    if (!asset) throw new Error(`Asset ${assetId} not found.`);

    const quote = await marketData.getQuote(asset.symbol);
    if (!quote) throw new Error(`Market data unavailable for ${asset.symbol}. Order rejected.`);
    if (quote.freshness === 'STALE') {
      throw new Error(`Market data for ${asset.symbol} is stale. Refresh the data before simulating an order.`);
    }

    const execPrice = quote.price;
    if (!Number.isFinite(execPrice) || execPrice <= 0) {
      throw new Error(`Invalid market quote for ${asset.symbol}. Order rejected.`);
    }

    // 3. Strict Deterministic Risk Check
    const riskResult = evaluateProposalRisk({
      portfolioId,
      assetId,
      side,
      quantity,
      price: execPrice
    });

    if (!riskResult.passed) {
      const rejectionReason = riskResult.reasons.join('; ');
      // Record rejected order in audit logs
      db.execute(`
        INSERT INTO audit_logs (id, user_id, portfolio_id, action_type, actor, details, created_at)
        VALUES (?, ?, ?, 'ORDER_REJECTED_RISK', 'AGENT_EXECUTION', ?, datetime('now'))
      `, [
        `aud_rej_${Date.now()}`,
        portfolio.user_id,
        portfolio.id,
        `Order to ${side} ${quantity} ${asset.symbol} rejected by risk engine: ${rejectionReason}`
      ]);

      throw new Error(`Risk checks failed: ${rejectionReason}`);
    }

    // 4. Strict Real-Money Isolation Safeguard
    if (portfolio.type === 'REAL') {
      const broker = portfolio.broker_connection_id ? db.queryOne<{
        status: string;
        compliance_acknowledged: number;
      }>('SELECT status, compliance_acknowledged FROM broker_connections WHERE id = ?', [portfolio.broker_connection_id]) : null;

      if (!broker || broker.status !== 'CONNECTED' || broker.compliance_acknowledged !== 1) {
        throw new Error(
          'REAL portfolio execution blocked: Broker is not connected or statutory SEBI risk disclosures are pending.'
        );
      }
    }

    // 5. Calculate Realistic Indian Transaction Costs and Slippage
    const charges = calculateIndianCharges({
      side,
      quantity,
      price: execPrice,
      productType,
      slippagePct: 0.05
    });

    // 6. Pre-Execution Decision Audit Record (Agent 4)
    const decisionRecord = await explainabilityAgent.recordPreExecutionDecision({
      portfolioId,
      assetId,
      action: side,
      quantity,
      price: execPrice,
      proposalId,
      riskResult,
      charges
    });

    // 7. Atomic Database Transaction for Ledger, Positions and Orders
    const orderId = `ord_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const execId = `exc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const idempotencyKey = `idem_${orderId}`;

    return db.transaction((database) => {
      // A. Create Order record
      database.prepare(`
        INSERT INTO orders (
          id, portfolio_id, asset_id, decision_id, proposal_id, portfolio_type,
          order_mode, side, order_type, product_type, quantity, filled_quantity,
          price, average_fill_price, status, idempotency_key, submitted_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'LIMIT', ?, ?, ?, ?, ?, 'FILLED', ?, datetime('now'), datetime('now'))
      `).run(
        orderId,
        portfolioId,
        assetId,
        decisionRecord.id,
        proposalId || null,
        portfolio.type,
        orderMode,
        side,
        productType,
        quantity,
        quantity,
        execPrice,
        execPrice,
        idempotencyKey
      );

      // B. Create Execution record
      database.prepare(`
        INSERT INTO executions (
          id, order_id, portfolio_id, asset_id, portfolio_type, side,
          quantity, fill_price, gross_amount, brokerage, stt_charges,
          exchange_turnover_charges, stamp_duty, sebi_charges, gst, total_charges,
          net_amount, executed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        execId,
        orderId,
        portfolioId,
        assetId,
        portfolio.type,
        side,
        quantity,
        execPrice,
        charges.turnover,
        charges.brokerage,
        charges.stt,
        charges.exchangeTurnoverCharges,
        charges.stampDuty,
        charges.sebiTurnoverCharges,
        charges.gst,
        charges.totalCharges,
        charges.netAmount
      );

      // C. Update Cash and Ledger
      let newCash = portfolio.current_cash;
      let newRealisedPnl = portfolio.realised_pnl;

      if (side === 'BUY') {
        newCash -= charges.netAmount;
        database.prepare(`
          INSERT INTO cash_ledger_entries (
            id, portfolio_id, portfolio_type, entry_type, amount, balance_after,
            reference_id, description, created_at
          ) VALUES (?, ?, ?, 'BUY_ORDER', ?, ?, ?, ?, datetime('now'))
        `).run(
          `csh_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
          portfolioId,
          portfolio.type,
          -charges.netAmount,
          newCash,
          execId,
          `Buy execution for ${quantity} ${asset.symbol} @ ₹${execPrice} (Turnover: ₹${charges.turnover}, Charges: ₹${charges.totalCharges})`
        );
      } else {
        newCash += charges.netAmount;
        database.prepare(`
          INSERT INTO cash_ledger_entries (
            id, portfolio_id, portfolio_type, entry_type, amount, balance_after,
            reference_id, description, created_at
          ) VALUES (?, ?, ?, 'SELL_ORDER', ?, ?, ?, ?, datetime('now'))
        `).run(
          `csh_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
          portfolioId,
          portfolio.type,
          charges.netAmount,
          newCash,
          execId,
          `Sell execution for ${quantity} ${asset.symbol} @ ₹${execPrice} (Net credited: ₹${charges.netAmount})`
        );
      }

      // D. Update Position
      const existingPos = database.prepare<[string, string, string], {
        id: string;
        quantity: number;
        average_buy_price: number;
        invested_amount: number;
        realised_pnl: number;
      }>(
        'SELECT * FROM positions WHERE portfolio_id = ? AND asset_id = ? AND product_type = ?'
      ).get(portfolioId, assetId, productType);

      if (side === 'BUY') {
        if (existingPos) {
          const totalQty = existingPos.quantity + quantity;
          const totalCost = (existingPos.quantity * existingPos.average_buy_price) + (quantity * execPrice);
          const newAvgPrice = Math.round((totalCost / totalQty) * 100) / 100;
          const currentMktVal = Math.round(totalQty * execPrice * 100) / 100;
          const unrealised = Math.round((currentMktVal - totalCost) * 100) / 100;
          const unrealisedPct = Math.round((unrealised / totalCost) * 10000) / 100;

          database.prepare(`
            UPDATE positions SET
              quantity = ?,
              average_buy_price = ?,
              current_price = ?,
              invested_amount = ?,
              current_market_value = ?,
              unrealised_pnl = ?,
              unrealised_pnl_pct = ?,
              last_updated_at = datetime('now')
            WHERE id = ?
          `).run(totalQty, newAvgPrice, execPrice, totalCost, currentMktVal, unrealised, unrealisedPct, existingPos.id);
        } else {
          const invested = Math.round(quantity * execPrice * 100) / 100;
          database.prepare(`
            INSERT INTO positions (
              id, portfolio_id, asset_id, portfolio_type, product_type,
              quantity, average_buy_price, current_price, invested_amount,
              current_market_value, unrealised_pnl, unrealised_pnl_pct, realised_pnl, last_updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0.0, 0.0, 0.0, datetime('now'))
          `).run(
            `pos_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            portfolioId,
            assetId,
            portfolio.type,
            productType,
            quantity,
            execPrice,
            execPrice,
            invested,
            invested
          );
        }
      } else if (side === 'SELL' && existingPos) {
        const remainingQty = existingPos.quantity - quantity;
        const tradeRealised = ((execPrice - existingPos.average_buy_price) * quantity) - charges.totalCharges;
        newRealisedPnl += tradeRealised;

        if (remainingQty <= 0) {
          // Position fully closed
          database.prepare('DELETE FROM positions WHERE id = ?').run(existingPos.id);
        } else {
          const newInvested = Math.round(remainingQty * existingPos.average_buy_price * 100) / 100;
          const currentMktVal = Math.round(remainingQty * execPrice * 100) / 100;
          const unrealised = Math.round((currentMktVal - newInvested) * 100) / 100;
          const unrealisedPct = Math.round((unrealised / newInvested) * 10000) / 100;

          database.prepare(`
            UPDATE positions SET
              quantity = ?,
              current_price = ?,
              invested_amount = ?,
              current_market_value = ?,
              unrealised_pnl = ?,
              unrealised_pnl_pct = ?,
              realised_pnl = realised_pnl + ?,
              last_updated_at = datetime('now')
            WHERE id = ?
          `).run(remainingQty, execPrice, newInvested, currentMktVal, unrealised, unrealisedPct, tradeRealised, existingPos.id);
        }
      }

      // E. Recalculate Portfolio Total Invested and Total NAV
      const posSum = database.prepare<[string], { total_inv: number; total_mkt: number; total_unrealised: number }>(`
        SELECT 
          COALESCE(SUM(invested_amount), 0) as total_inv,
          COALESCE(SUM(current_market_value), 0) as total_mkt,
          COALESCE(SUM(unrealised_pnl), 0) as total_unrealised
        FROM positions WHERE portfolio_id = ?
      `).get(portfolioId);

      const totalInvested = posSum?.total_inv || 0;
      const totalMktVal = posSum?.total_mkt || 0;
      const totalUnrealised = posSum?.total_unrealised || 0;
      const totalNav = Math.round((newCash + totalMktVal) * 100) / 100;

      database.prepare(`
        UPDATE portfolios SET
          current_cash = ?,
          invested_value = ?,
          total_value = ?,
          realised_pnl = ?,
          unrealised_pnl = ?,
          updated_at = datetime('now')
        WHERE id = ?
      `).run(newCash, totalInvested, totalNav, newRealisedPnl, totalUnrealised, portfolioId);

      // F. If tied to a proposal, update proposal status to EXECUTED
      if (proposalId) {
        database.prepare("UPDATE investment_proposals SET status = 'EXECUTED' WHERE id = ?").run(proposalId);
      }

      // G. Log to immutable audit log
      database.prepare(`
        INSERT INTO audit_logs (id, user_id, portfolio_id, action_type, actor, details, created_at)
        VALUES (?, ?, ?, 'EXECUTION_FILLED', 'AGENT_EXECUTION', ?, datetime('now'))
      `).run(
        `aud_fill_${Date.now()}`,
        portfolio.user_id,
        portfolioId,
        `Executed ${side} ${quantity} ${asset.symbol} @ ₹${execPrice}. Total charges: ₹${charges.totalCharges}. New Portfolio NAV: ₹${totalNav}`
      );

      // H. Create In-App Notification
      database.prepare(`
        INSERT INTO notifications (id, user_id, portfolio_id, type, title, message, action_url, created_at)
        VALUES (?, ?, ?, 'EXECUTION', ?, ?, '/orders', datetime('now'))
      `).run(
        `notif_${Date.now()}`,
        portfolio.user_id,
        portfolioId,
        `Order Executed: ${side} ${quantity} ${asset.symbol}`,
        `Virtual simulator fill: ${quantity} shares at ₹${execPrice} using ${quote.provider} data (${quote.freshness}). Charges estimate: ₹${charges.totalCharges}.`
      );

      return {
        orderId,
        executionId: execId,
        assetSymbol: asset.symbol,
        side,
        quantity,
        fillPrice: execPrice,
        quoteProvider: quote.provider,
        quoteFreshness: quote.freshness,
        simulated: portfolio.type === 'VIRTUAL',
        charges,
        newCash,
        newNav: totalNav,
        decisionId: decisionRecord.id
      };
    });
  }
}

export const portfolioExecutionAgent = new PortfolioExecutionAgent();
export default portfolioExecutionAgent;
