import type Database from 'better-sqlite3';
import db from '../../db';
import marketData from '../market-data';
import { validateQuoteForExecution } from '../market-data/validation';
import { calculateIndianCharges } from '../tax-calculator';
import { evaluateProposalRisk, recordPortfolioSnapshot } from '../risk-engine';
import { explainabilityAgent } from './explainability';
import { AppError, IdempotencyConflictError, IdempotencyInProgressError } from '../errors';
import {
  claimIdempotencyKey,
  completeIdempotencyKey,
  generateIdempotencyKey,
  hashRequest,
  normalizeIdempotencyKey
} from '../idempotency';
import { OrderSide, ProductType, IndianChargesBreakdown, RiskCheckResult } from '../types';

/**
 * Virtual-account order execution.
 *
 * ── Concurrency model ──────────────────────────────────────────────────────
 * Everything that decides *whether* a trade may happen and everything that
 * records it happen inside ONE synchronous `writeTransaction` (BEGIN
 * IMMEDIATE). Consequences:
 *
 *  - Mutable portfolio state (cash, positions, proposal status, order counts)
 *    is re-read inside the transaction, so two simultaneous requests can never
 *    both act on the same stale cash balance. The second one sees the first
 *    one's committed effect.
 *  - The risk engine runs inside the transaction against that fresh state.
 *  - All financial rows (order, execution, ledger, position, portfolio totals,
 *    proposal status, audit, notification, snapshot) commit or roll back
 *    together. A failure anywhere leaves no partial state.
 *  - No `await` occurs inside the transaction. Quotes and fundamentals are
 *    fetched before it starts, so a slow network call can never hold a write
 *    lock.
 *
 * Node is single-threaded and better-sqlite3 is synchronous, so requests in one
 * process cannot interleave here at all. Across processes BEGIN IMMEDIATE plus
 * `busy_timeout` make SQLite serialise the writers.
 *
 * ── What this does NOT do ─────────────────────────────────────────────────
 * It does not contact a broker. There is no live adapter, no broker order id
 * and no exchange confirmation. Every fill here is a simulator fill against a
 * stored (synthetic) quote. REAL portfolios are rejected before anything else.
 */

export type OrderMode = 'MANUAL' | 'AI_PROPOSAL_APPROVED' | 'AUTONOMOUS_VIRTUAL' | 'AUTONOMOUS_LIVE';

const ORDER_MODES: readonly OrderMode[] = [
  'MANUAL',
  'AI_PROPOSAL_APPROVED',
  'AUTONOMOUS_VIRTUAL',
  'AUTONOMOUS_LIVE'
];

/** Documented simulator slippage assumption, applied before turnover. */
export const SIMULATION_SLIPPAGE_PCT = 0.05;

export const IDEMPOTENCY_SCOPE_ORDER = 'order';

export interface ExecuteOrderParams {
  portfolioId: string;
  assetId: string;
  side: OrderSide;
  quantity: number;
  /** Supplied prices are rejected; the simulator fills from its stored quote. */
  price?: number;
  orderMode: OrderMode;
  proposalId?: string;
  productType?: ProductType;
  /** Caller-supplied idempotency key. A random one is generated when omitted. */
  idempotencyKey?: string;
  /** Injectable clock (tests). Production uses the real clock. */
  now?: Date;
  /** Explicit, audited override of the trading-window check. */
  bypassMarketHours?: boolean;
}

export interface ExecutionResult {
  orderId: string;
  executionId: string;
  assetSymbol: string;
  side: OrderSide;
  quantity: number;
  productType: ProductType;
  fillPrice: number;
  quotePrice: number;
  quoteProvider: string;
  quoteFreshness: string;
  simulated: boolean;
  charges: IndianChargesBreakdown;
  newCash: number;
  newNav: number;
  decisionId: string;
  proposalId: string | null;
  idempotencyKey: string;
  replayed: boolean;
  riskAssessment: {
    passed: boolean;
    unavailableControls: string[];
  };
}

interface ProposalRow {
  id: string;
  portfolio_id: string;
  asset_id: string;
  action: string;
  proposed_quantity: number;
  proposed_price: number;
  status: string;
  expires_at: string;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

export class PortfolioExecutionAgent {
  name = 'PORTFOLIO_EXECUTION';

  async executeOrder(params: ExecuteOrderParams): Promise<ExecutionResult> {
    const now = params.now ?? new Date();

    // ── 1. Structural validation, before any expensive work ────────────────
    this.validateParams(params);

    const {
      portfolioId,
      assetId,
      side,
      quantity,
      orderMode,
      proposalId,
      productType = 'CNC'
    } = params;

    // ── 2. Cheap, read-only preconditions ─────────────────────────────────
    const portfolio = db.queryOne<{
      id: string;
      user_id: string;
      type: 'REAL' | 'VIRTUAL';
      current_cash: number;
      invested_value: number;
      total_value: number;
      realised_pnl: number;
      is_active: number;
    }>('SELECT * FROM portfolios WHERE id = ?', [portfolioId]);

    if (!portfolio || !portfolio.is_active) {
      throw new AppError(`Portfolio ${portfolioId} is not active or not found.`, 404, 'PORTFOLIO_NOT_FOUND');
    }

    // Fail closed for real-money accounts. No verified broker order submission
    // and fill-reconciliation adapter exists in this repository.
    if (portfolio.type === 'REAL') {
      throw new AppError(
        'REAL portfolio execution is disabled: a verified broker order adapter and fill reconciliation are not implemented. Use the virtual portfolio.',
        403,
        'REAL_EXECUTION_DISABLED'
      );
    }

    if (orderMode === 'AUTONOMOUS_LIVE') {
      throw new AppError(
        'AUTONOMOUS_LIVE is disabled in this build. Use a virtual portfolio.',
        403,
        'LIVE_MODE_DISABLED'
      );
    }
    if (orderMode === 'AUTONOMOUS_VIRTUAL' && portfolio.type !== 'VIRTUAL') {
      throw new AppError(
        'AUTONOMOUS_VIRTUAL orders require a virtual portfolio.',
        400,
        'MODE_PORTFOLIO_MISMATCH'
      );
    }

    if (orderMode === 'AI_PROPOSAL_APPROVED') {
      if (!proposalId) {
        throw new AppError(
          'An approved proposal ID is required for AI-proposal execution.',
          400,
          'PROPOSAL_REQUIRED'
        );
      }
    } else if (proposalId) {
      throw new AppError(
        'A proposal ID can only be executed with AI_PROPOSAL_APPROVED mode.',
        400,
        'PROPOSAL_MODE_MISMATCH'
      );
    }

    // ── 3. Asset and quote (network/DB reads, deliberately outside the tx) ─
    const asset = db.queryOne<{ id: string; symbol: string; name: string; sector: string | null }>(
      'SELECT id, symbol, name, sector FROM assets WHERE id = ?',
      [assetId]
    );
    if (!asset) throw new AppError(`Asset ${assetId} not found.`, 404, 'ASSET_NOT_FOUND');

    const quote = await marketData.getQuote(asset.symbol);
    const quoteCheck = validateQuoteForExecution(quote, { now });
    if (!quoteCheck.ok || !quote) {
      throw new AppError(
        `Market data for ${asset.symbol} cannot be used to price a simulated trade: ${quoteCheck.reasons.join('; ')}`,
        409,
        'QUOTE_UNUSABLE'
      );
    }

    const fundamentals = await marketData.getFundamentals(asset.symbol);

    // ── 4. Transaction costs, based on the price actually simulated ────────
    const charges = calculateIndianCharges({
      side,
      quantity,
      price: quote.price,
      productType,
      slippagePct: SIMULATION_SLIPPAGE_PCT
    });

    const orderCost = {
      grossAmount: charges.turnover,
      buyCashRequired: side === 'BUY' ? charges.netAmount : undefined,
      sellCashProceeds: side === 'SELL' ? charges.netAmount : undefined,
      totalCharges: charges.totalCharges
    };

    // ── 5. Idempotency key ────────────────────────────────────────────────
    const suppliedKey = normalizeIdempotencyKey(params.idempotencyKey);
    const idempotencyKey = suppliedKey ?? generateIdempotencyKey('auto_order');
    const requestHash = hashRequest({
      portfolioId,
      assetId,
      side,
      quantity,
      productType,
      orderMode,
      proposalId: proposalId ?? null
    });

    // orders.idempotency_key is UNIQUE across the whole table, so the stored
    // value is namespaced by user. The key itself stays scoped per user, as
    // documented — two users may legitimately use the same key string.
    const storedIdempotencyKey = `${IDEMPOTENCY_SCOPE_ORDER}:${portfolio.user_id}:${idempotencyKey}`;

    const orderId = `ord_${now.getTime()}_${Math.random().toString(36).substring(2, 8)}`;
    const executionId = `exc_${now.getTime()}_${Math.random().toString(36).substring(2, 8)}`;

    let riskResult: RiskCheckResult | null = null;

    try {
      const result = db.writeTransaction((database) => {
        // ── 5a. Claim the idempotency key inside the transaction ──────────
        const claim = claimIdempotencyKey({
          database,
          userId: portfolio.user_id,
          scope: IDEMPOTENCY_SCOPE_ORDER,
          key: idempotencyKey,
          requestHash,
          nowMs: now.getTime()
        });

        if (claim.state === 'REPLAY') {
          return { ...(claim.response as ExecutionResult), replayed: true };
        }
        if (claim.state === 'CONFLICT') {
          throw new IdempotencyConflictError(
            'This Idempotency-Key was already used with different order details.'
          );
        }
        if (claim.state === 'IN_PROGRESS') {
          throw new IdempotencyInProgressError(
            'An earlier request with this Idempotency-Key has not completed. Refusing to execute a second time; check the order history before retrying.'
          );
        }

        // ── 5b. Re-read mutable state from the live transaction ───────────
        const fresh = database
          .prepare(
            'SELECT id, user_id, type, current_cash, invested_value, total_value, realised_pnl, is_active FROM portfolios WHERE id = ?'
          )
          .get(portfolioId) as typeof portfolio | undefined;

        if (!fresh || !fresh.is_active || fresh.type === 'REAL') {
          throw new AppError('Portfolio is no longer available for simulated execution.', 409, 'PORTFOLIO_UNAVAILABLE');
        }

        // ── 5c. Proposal lifecycle, re-verified under the write lock ──────
        let proposal: ProposalRow | undefined;
        if (proposalId) {
          proposal = database
            .prepare(
              `SELECT id, portfolio_id, asset_id, action, proposed_quantity, proposed_price, status, expires_at
               FROM investment_proposals WHERE id = ?`
            )
            .get(proposalId) as ProposalRow | undefined;

          this.assertProposalExecutable(proposal, {
            portfolioId,
            assetId,
            side,
            quantity,
            now
          });
        }

        // ── 5d. Authoritative risk evaluation on fresh state ──────────────
        const assessed = evaluateProposalRisk({
          portfolioId,
          assetId,
          side,
          quantity,
          price: quote.price,
          productType,
          orderCost,
          now,
          bypassMarketHours: params.bypassMarketHours ?? false,
          database
        });
        riskResult = assessed;

        if (!assessed.passed) {
          throw new AppError(
            `Risk checks failed: ${assessed.reasons.join('; ')}`,
            422,
            'RISK_REJECTED',
            assessed
          );
        }

        // ── 5e. Decision record (same transaction as the trade) ───────────
        const decision = explainabilityAgent.recordPreExecutionDecisionWithDatabase(
          {
            portfolioId,
            assetId,
            action: side,
            quantity,
            price: charges.effectivePrice,
            proposalId,
            riskResult: assessed,
            charges
          },
          {
            asset,
            quote,
            fundamentals,
            portfolio: { total_value: fresh.total_value, current_cash: fresh.current_cash },
            database
          }
        );

        // ── 5f. Order ─────────────────────────────────────────────────────
        database
          .prepare(
            `INSERT INTO orders (
               id, portfolio_id, asset_id, decision_id, proposal_id, portfolio_type,
               order_mode, side, order_type, product_type, quantity, filled_quantity,
               price, average_fill_price, status, idempotency_key, submitted_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'LIMIT', ?, ?, ?, ?, ?, 'FILLED', ?, datetime('now'), datetime('now'))`
          )
          .run(
            orderId,
            portfolioId,
            assetId,
            decision.id,
            proposalId ?? null,
            fresh.type,
            orderMode,
            side,
            productType,
            quantity,
            quantity,
            charges.effectivePrice,
            charges.effectivePrice,
            storedIdempotencyKey
          );

        // ── 5g. Position state, read inside the transaction ───────────────
        const existingPos = database
          .prepare(
            `SELECT id, quantity, average_buy_price, invested_amount, current_market_value, realised_pnl
             FROM positions WHERE portfolio_id = ? AND asset_id = ? AND product_type = ?`
          )
          .get(portfolioId, assetId, productType) as
          | {
              id: string;
              quantity: number;
              average_buy_price: number;
              invested_amount: number;
              current_market_value: number;
              realised_pnl: number;
            }
          | undefined;

        if (side === 'SELL' && (!existingPos || existingPos.quantity < quantity)) {
          // Defence in depth: the risk engine already rejects this, but a free
          // cash credit must be impossible even if that check were bypassed.
          throw new AppError(
            `Insufficient ${productType} holdings: held ${existingPos?.quantity ?? 0}, attempted to sell ${quantity}.`,
            422,
            'INSUFFICIENT_HOLDINGS'
          );
        }

        // ── 5h. Realised P&L for this fill ────────────────────────────────
        const realisedPnl =
          side === 'SELL' && existingPos
            ? round2((charges.effectivePrice - existingPos.average_buy_price) * quantity - charges.totalCharges)
            : 0;

        // ── 5i. Execution ─────────────────────────────────────────────────
        database
          .prepare(
            `INSERT INTO executions (
               id, order_id, portfolio_id, asset_id, portfolio_type, side,
               quantity, fill_price, gross_amount, brokerage, stt_charges,
               exchange_turnover_charges, stamp_duty, sebi_charges, gst, total_charges,
               net_amount, realised_pnl, executed_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
          )
          .run(
            executionId,
            orderId,
            portfolioId,
            assetId,
            fresh.type,
            side,
            quantity,
            charges.effectivePrice,
            charges.turnover,
            charges.brokerage,
            charges.stt,
            charges.exchangeTurnoverCharges,
            charges.stampDuty,
            charges.sebiTurnoverCharges,
            charges.gst,
            charges.totalCharges,
            charges.netAmount,
            realisedPnl
          );

        // ── 5j. Cash, from the freshly read balance ───────────────────────
        const cashDelta = side === 'BUY' ? -charges.netAmount : charges.netAmount;
        const newCash = round2(fresh.current_cash + cashDelta);
        if (newCash < -0.005) {
          // Unreachable when the risk engine ran, but never write negative cash.
          throw new AppError(
            `Insufficient settled cash: balance ₹${round2(fresh.current_cash)} would become ₹${newCash}.`,
            422,
            'INSUFFICIENT_CASH'
          );
        }

        database
          .prepare(
            `INSERT INTO cash_ledger_entries (
               id, portfolio_id, portfolio_type, entry_type, amount, balance_after,
               reference_id, description, created_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
          )
          .run(
            `csh_${executionId}`,
            portfolioId,
            fresh.type,
            side === 'BUY' ? 'BUY_ORDER' : 'SELL_ORDER',
            cashDelta,
            newCash,
            executionId,
            side === 'BUY'
              ? `Buy ${quantity} ${asset.symbol} @ ₹${charges.effectivePrice} (turnover ₹${charges.turnover}, charges ₹${charges.totalCharges})`
              : `Sell ${quantity} ${asset.symbol} @ ₹${charges.effectivePrice} (turnover ₹${charges.turnover}, charges ₹${charges.totalCharges})`
          );

        // ── 5k. Position write ────────────────────────────────────────────
        if (side === 'BUY') {
          if (existingPos) {
            const totalQty = existingPos.quantity + quantity;
            const totalCost = round2(existingPos.invested_amount + charges.turnover);
            const newAvgPrice = round2(totalCost / totalQty);
            const marketValue = round2(totalQty * charges.effectivePrice);
            const unrealised = round2(marketValue - totalCost);
            const unrealisedPct = totalCost > 0 ? round2((unrealised / totalCost) * 100) : 0;

            database
              .prepare(
                `UPDATE positions SET
                   quantity = ?, average_buy_price = ?, current_price = ?,
                   invested_amount = ?, current_market_value = ?, unrealised_pnl = ?,
                   unrealised_pnl_pct = ?, last_updated_at = datetime('now')
                 WHERE id = ? AND portfolio_id = ?`
              )
              .run(
                totalQty,
                newAvgPrice,
                charges.effectivePrice,
                totalCost,
                marketValue,
                unrealised,
                unrealisedPct,
                existingPos.id,
                portfolioId
              );
          } else {
            const marketValue = round2(quantity * charges.effectivePrice);
            database
              .prepare(
                `INSERT INTO positions (
                   id, portfolio_id, asset_id, portfolio_type, product_type,
                   quantity, average_buy_price, current_price, invested_amount,
                   current_market_value, unrealised_pnl, unrealised_pnl_pct, realised_pnl, last_updated_at
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0.0, 0.0, 0.0, datetime('now'))`
              )
              .run(
                `pos_${executionId}`,
                portfolioId,
                assetId,
                fresh.type,
                productType,
                quantity,
                charges.effectivePrice,
                charges.effectivePrice,
                charges.turnover,
                marketValue
              );
          }
        } else if (existingPos) {
          const remainingQty = existingPos.quantity - quantity;
          if (remainingQty === 0) {
            database
              .prepare('DELETE FROM positions WHERE id = ? AND portfolio_id = ?')
              .run(existingPos.id, portfolioId);
          } else {
            const remainingCost = round2(remainingQty * existingPos.average_buy_price);
            const marketValue = round2(remainingQty * charges.effectivePrice);
            const unrealised = round2(marketValue - remainingCost);
            const unrealisedPct = remainingCost > 0 ? round2((unrealised / remainingCost) * 100) : 0;
            database
              .prepare(
                `UPDATE positions SET
                   quantity = ?, current_price = ?, invested_amount = ?,
                   current_market_value = ?, unrealised_pnl = ?, unrealised_pnl_pct = ?,
                   realised_pnl = realised_pnl + ?, last_updated_at = datetime('now')
                 WHERE id = ? AND portfolio_id = ?`
              )
              .run(
                remainingQty,
                charges.effectivePrice,
                remainingCost,
                marketValue,
                unrealised,
                unrealisedPct,
                realisedPnl,
                existingPos.id,
                portfolioId
              );
          }
        }

        // ── 5l. Portfolio totals, recomputed from positions ───────────────
        const totals = database
          .prepare(
            `SELECT COALESCE(SUM(invested_amount), 0) AS invested,
                    COALESCE(SUM(current_market_value), 0) AS market,
                    COALESCE(SUM(unrealised_pnl), 0) AS unrealised
             FROM positions WHERE portfolio_id = ?`
          )
          .get(portfolioId) as { invested: number; market: number; unrealised: number };

        const investedValue = round2(Number(totals.invested));
        const marketValue = round2(Number(totals.market));
        const unrealisedPnl = round2(Number(totals.unrealised));
        const totalNav = round2(newCash + marketValue);
        const newRealised = round2(Number(fresh.realised_pnl) + realisedPnl);

        database
          .prepare(
            `UPDATE portfolios SET
               current_cash = ?, invested_value = ?, total_value = ?,
               realised_pnl = ?, unrealised_pnl = ?, updated_at = datetime('now')
             WHERE id = ? AND type = 'VIRTUAL'`
          )
          .run(newCash, investedValue, totalNav, newRealised, unrealisedPnl, portfolioId);

        // ── 5m. Proposal transition, atomically with the execution ────────
        if (proposal) {
          const transition = database
            .prepare("UPDATE investment_proposals SET status = 'EXECUTED' WHERE id = ? AND status = 'APPROVED'")
            .run(proposal.id);
          if (transition.changes !== 1) {
            // Two approvals raced, or the status changed. Roll everything back.
            throw new AppError(
              'Proposal is no longer in an executable state (it may have been executed concurrently).',
              409,
              'PROPOSAL_NOT_EXECUTABLE'
            );
          }
        }

        // ── 5n. Audit + notification + snapshot ───────────────────────────
        database
          .prepare(
            `INSERT INTO audit_logs (id, user_id, portfolio_id, action_type, actor, details, created_at)
             VALUES (?, ?, ?, 'EXECUTION_FILLED', 'AGENT_EXECUTION', ?, datetime('now'))`
          )
          .run(
            `aud_fill_${executionId}`,
            fresh.user_id,
            portfolioId,
            `Simulated ${side} ${quantity} ${asset.symbol} (${productType}) @ ₹${charges.effectivePrice} against ` +
              `${quote.provider} ${quote.freshness} data. Charges ₹${charges.totalCharges}. New NAV ₹${totalNav}.` +
              (proposal ? ` Proposal ${proposal.id} marked EXECUTED.` : '')
          );

        database
          .prepare(
            `INSERT INTO notifications (id, user_id, portfolio_id, type, title, message, action_url, created_at)
             VALUES (?, ?, ?, 'EXECUTION', ?, ?, '/orders', datetime('now'))`
          )
          .run(
            `notif_${executionId}`,
            fresh.user_id,
            portfolioId,
            `Order Executed: ${side} ${quantity} ${asset.symbol}`,
            `Virtual simulator fill: ${quantity} shares at ₹${charges.effectivePrice} using ${quote.provider} data (${quote.freshness}). Charges estimate: ₹${charges.totalCharges}. This is not an exchange execution.`
          );

        const result: ExecutionResult = {
          orderId,
          executionId,
          assetSymbol: asset.symbol,
          side,
          quantity,
          productType,
          fillPrice: charges.effectivePrice,
          quotePrice: quote.price,
          quoteProvider: quote.provider,
          quoteFreshness: quote.freshness,
          simulated: true,
          charges,
          newCash,
          newNav: totalNav,
          decisionId: decision.id,
          proposalId: proposal?.id ?? null,
          idempotencyKey,
          replayed: false,
          riskAssessment: {
            passed: true,
            unavailableControls: assessed.checks
              .filter((check) => check.status === 'UNAVAILABLE')
              .map((check) => check.ruleName)
          }
        };

        // ── 5o. Close the idempotency record ──────────────────────────────
        completeIdempotencyKey({
          database,
          userId: fresh.user_id,
          scope: IDEMPOTENCY_SCOPE_ORDER,
          key: idempotencyKey,
          response: result,
          statusCode: 200,
          resourceId: orderId
        });

        return result;
      });

      // Snapshot after commit so a rolled-back transaction never leaves a NAV
      // reading that never happened.
      if (!result.replayed) {
        try {
          recordPortfolioSnapshot(portfolioId, now);
        } catch {
          // Snapshot collection must never fail a completed trade.
        }
      }

      return result;
    } catch (err) {
      // Record the rejection outside the rolled-back transaction so the reason
      // survives, then re-throw for the caller.
      if (err instanceof AppError && err.code === 'RISK_REJECTED') {
        this.auditRiskRejection(portfolio.user_id, portfolioId, asset.symbol, side, quantity, err.message);
      }
      throw err;
    }
  }

  /** Structural input validation. Runs before any I/O. */
  private validateParams(params: ExecuteOrderParams): void {
    if (!params || typeof params !== 'object') {
      throw new AppError('Order parameters are required.', 400, 'INVALID_ORDER');
    }
    if (typeof params.portfolioId !== 'string' || params.portfolioId.trim() === '') {
      throw new AppError('portfolioId is required.', 400, 'INVALID_ORDER');
    }
    if (typeof params.assetId !== 'string' || params.assetId.trim() === '') {
      throw new AppError('assetId is required.', 400, 'INVALID_ORDER');
    }
    if (!Number.isSafeInteger(params.quantity) || params.quantity <= 0) {
      throw new AppError('Quantity must be a positive whole number of shares.', 400, 'INVALID_QUANTITY');
    }
    if (params.side !== 'BUY' && params.side !== 'SELL') {
      throw new AppError('Unsupported order side.', 400, 'INVALID_SIDE');
    }
    if (params.productType !== undefined && !['CNC', 'MIS'].includes(params.productType)) {
      throw new AppError('Unsupported product type.', 400, 'INVALID_PRODUCT_TYPE');
    }
    if (!ORDER_MODES.includes(params.orderMode)) {
      throw new AppError('Unsupported order mode.', 400, 'INVALID_ORDER_MODE');
    }
    if (params.price !== undefined) {
      throw new AppError(
        'Custom fill prices are disabled. The simulator uses its stored market-data quote.',
        400,
        'PRICE_NOT_ALLOWED'
      );
    }
  }

  /**
   * A proposal may only be executed when it is APPROVED, unexpired and matches
   * the portfolio, asset, side and quantity exactly. Every condition is checked
   * again inside the write transaction.
   */
  private assertProposalExecutable(
    proposal: ProposalRow | undefined,
    expected: {
      portfolioId: string;
      assetId: string;
      side: OrderSide;
      quantity: number;
      now: Date;
    }
  ): void {
    const rejectReason = !proposal
      ? 'the proposal does not exist'
      : proposal.status !== 'APPROVED'
        ? `its status is ${proposal.status}`
        : proposal.portfolio_id !== expected.portfolioId
          ? 'it belongs to a different portfolio'
          : proposal.asset_id !== expected.assetId
            ? 'it targets a different asset'
            : proposal.action !== expected.side
              ? 'its direction does not match this order'
              : proposal.proposed_quantity !== expected.quantity
                ? 'its quantity does not match this order'
                : !Number.isFinite(Date.parse(proposal.expires_at))
                  ? 'its expiry timestamp is invalid'
                  : Date.parse(proposal.expires_at) <= expected.now.getTime()
                    ? 'it has expired'
                    : null;

    if (rejectReason) {
      throw new AppError(
        `Proposal execution rejected: ${rejectReason}. A proposal must be approved, unexpired, and match the portfolio, asset, side, and quantity.`,
        409,
        'PROPOSAL_NOT_EXECUTABLE'
      );
    }
  }

  private auditRiskRejection(
    userId: string,
    portfolioId: string,
    symbol: string,
    side: OrderSide,
    quantity: number,
    message: string
  ): void {
    try {
      db.execute(
        `INSERT INTO audit_logs (id, user_id, portfolio_id, action_type, actor, details, created_at)
         VALUES (?, ?, ?, 'ORDER_REJECTED_RISK', 'AGENT_EXECUTION', ?, datetime('now'))`,
        [
          `aud_rej_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          userId,
          portfolioId,
          `Order to ${side} ${quantity} ${symbol} rejected. ${message}`
        ]
      );
    } catch {
      // Auditing a rejection must never mask the rejection itself.
    }
  }
}

export const portfolioExecutionAgent = new PortfolioExecutionAgent();
export default portfolioExecutionAgent;
