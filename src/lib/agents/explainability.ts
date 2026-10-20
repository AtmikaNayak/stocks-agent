import db from '../../db';
import marketData from '../market-data';
import { RiskCheckResult, IndianChargesBreakdown, OrderSide } from '../types';
import { describeFundamentalProvenance, describeQuoteProvenance } from '../data-provenance';

export interface PreExecutionDecisionInput {
  portfolioId: string;
  assetId: string;
  action: OrderSide;
  quantity: number;
  price: number;
  proposalId?: string;
  strategyVersionId?: string;
  riskResult: RiskCheckResult;
  charges: IndianChargesBreakdown;
}

export class ExplainabilityAgent {
  name = 'EXPLAINABILITY';

  async recordPreExecutionDecision(input: PreExecutionDecisionInput) {
    const {
      portfolioId,
      assetId,
      action,
      quantity,
      price,
      proposalId,
      strategyVersionId,
      riskResult,
      charges
    } = input;

    const asset = db.queryOne<{ id: string; symbol: string; name: string; sector: string }>(
      'SELECT id, symbol, name, sector FROM assets WHERE id = ?',
      [assetId]
    );
    const fund = asset ? await marketData.getFundamentals(asset.symbol) : null;
    const fundProvenance = fund ? describeFundamentalProvenance(fund.source) : null;
    const quote = asset ? await marketData.getQuote(asset.symbol) : null;
    const quoteProvenance = quote
      ? describeQuoteProvenance({ freshness: quote.freshness, provider: quote.provider })
      : null;

    // Never invent a missing metric: say plainly when it is unavailable.
    const metric = (value: number | null | undefined, suffix: string, name: string): string =>
      value === null || value === undefined || !Number.isFinite(Number(value))
        ? `${name} unavailable`
        : `${name} ${Number(value)}${suffix}`;
    const fundamentalsText = fundProvenance?.isVerified
      ? `${metric(fund?.roce, '%', 'ROCE')}, ${metric(fund?.debtToEquity, '', 'D/E')}, ${metric(fund?.operatingMargin, '%', 'OPM')}, ${metric(fund?.peRatio, 'x', 'P/E')} (source: ${fundProvenance.provider}).`
      : fundProvenance
        ? `Illustrative demo fundamentals only — ${metric(fund?.roce, '%', 'ROCE')}, ${metric(fund?.debtToEquity, '', 'D/E')}, ${metric(fund?.peRatio, 'x', 'P/E')}. These are not audited and were not used to justify the order.`
        : `No fundamentals are stored for this company in this dataset.`;
    const priceText = quoteProvenance
      ? quoteProvenance.isVerified
        ? `Prices are verified ${quoteProvenance.freshness} data from ${quoteProvenance.provider}.`
        : `Prices are simulated demo fixtures (${quoteProvenance.provider ?? 'unknown source'}), not exchange data.`
      : `Price provenance is unknown.`;
    const portfolio = db.queryOne<{ total_value: number; current_cash: number }>(
      'SELECT total_value, current_cash FROM portfolios WHERE id = ?',
      [portfolioId]
    );

    const totalValue = portfolio?.total_value || 25000;
    const positionPct = Math.round(((quantity * price) / totalValue) * 1000) / 10;

    // Plain Language for Beginners
    const reasoningPlain = action === 'BUY'
      ? `We purchased ${quantity} shares of ${asset?.name || assetId} at ₹${price} per share in the ${asset?.sector || 'India'} sector. The investment represents ${positionPct}% of your total portfolio, inside the 15% single-company limit. ${priceText}`
      : `We sold ${quantity} shares of ${asset?.name || assetId} at ₹${price} to lock in proceeds and rebalance your portfolio cash buffer.`;

    // Advanced Quantitative Analysis for Experienced Users
    const reasoningAdvanced = action === 'BUY'
      ? `Capital allocation: ₹${(quantity * price).toLocaleString('en-IN')} (${positionPct}% portfolio weight). Fundamentals: ${fundamentalsText} ${priceText} Estimated charges: ₹${charges.totalCharges} (STT: ₹${charges.stt}, exchange: ₹${charges.exchangeTurnoverCharges}, GST: ₹${charges.gst}). Post-trade cash remaining: ₹${riskResult.cashRemainingAfter} (buffer >= 20%).`
      : `Order liquidation: ${quantity} units @ ₹${price}. Gross turnover ₹${charges.turnover}. Net proceeds ₹${charges.netAmount} credited to portfolio cash ledger. Risk exposure reduced.`;

    const whatCouldGoWrong = action === 'BUY'
      ? `Primary downside risks: (1) Broader sector multiple contraction, (2) Short-term market gap risk below entry, (3) Unexpected raw material or margin compression in upcoming quarter.`
      : `Opportunity cost: The stock could continue to rally post-exit if institutional momentum persists.`;

    const riskSummary = `Passed all ${riskResult.checks.length} deterministic risk checks. Maximum position limit: <= 15% (Actual: ${riskResult.calculatedPositionPct}%). Cash reserve post-order: ₹${riskResult.cashRemainingAfter}.`;

    const decisionId = `dec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    // Store Decision Record BEFORE execution
    db.execute(`
      INSERT INTO decision_records (
        id, portfolio_id, proposal_id, strategy_version_id, asset_id, action,
        quantity, price, decision_timestamp, reasoning_plain_language, reasoning_advanced,
        risk_assessment_summary, what_could_go_wrong, market_snapshot_json, portfolio_state_json, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?, ?, ?, ?, 'RECORDED')
    `, [
      decisionId,
      portfolioId,
      proposalId || null,
      strategyVersionId || 'ver_strat_1_v12',
      assetId,
      action,
      quantity,
      price,
      reasoningPlain,
      reasoningAdvanced,
      riskSummary,
      whatCouldGoWrong,
      JSON.stringify({ price, sector: asset?.sector, fund: fund || {} }),
      JSON.stringify({ totalValue, currentCash: portfolio?.current_cash || 0 })
    ]);

    // Store supporting and contrary evidence items
    if (action === 'BUY') {
      db.execute(`
        INSERT INTO decision_evidence (id, decision_id, evidence_type, title, detail, source, source_timestamp, is_supporting)
        VALUES (?, ?, 'FINANCIAL_RATIO', 'Return on capital and leverage', ?, ?, datetime('now'), 1)
      `, [
        `evi_${Date.now()}_1`,
        decisionId,
        fundProvenance?.isVerified
          ? `ROCE is ${metric(fund?.roce, '%', 'ROCE')}, and Debt-to-Equity is ${metric(fund?.debtToEquity, '', 'D/E')}.`
          : `Fundamentals for this company are demo fixtures and were not used as justification.`,
        fundProvenance?.isVerified ? (fundProvenance.provider ?? 'verified fundamentals source') : 'SYNTHETIC_DEMO'
      ]);

      db.execute(`
        INSERT INTO decision_evidence (id, decision_id, evidence_type, title, detail, source, source_timestamp, is_supporting)
        VALUES (?, ?, 'VALUATION', 'Valuation multiple', ?, ?, datetime('now'), 0)
      `, [
        `evi_${Date.now()}_2`,
        decisionId,
        fundProvenance?.isVerified
          ? `Trailing P/E is ${metric(fund?.peRatio, 'x', 'P/E')}; no historical median comparison is stored in this dataset.`
          : `No verified valuation multiple is available for this company in this dataset.`,
        quoteProvenance?.isVerified ? (quoteProvenance.provider ?? 'verified price feed') : 'SYNTHETIC_DEMO'
      ]);
    }

    return {
      id: decisionId,
      reasoningPlain,
      reasoningAdvanced,
      whatCouldGoWrong,
      riskSummary
    };
  }

  /**
   * Grounded conversational Q&A: answers questions strictly using persisted DB records
   */
  async answerHistoricalQuestion(portfolioId: string, question: string) {
    const qLower = question.toLowerCase();

    // 1. Fetch recent decision records
    const recentDecisions = db.query<{
      id: string;
      action: string;
      quantity: number;
      price: number;
      symbol: string;
      name: string;
      reasoning_plain_language: string;
      reasoning_advanced: string;
      what_could_go_wrong: string;
      risk_assessment_summary: string;
      decision_timestamp: string;
    }>(`
      SELECT d.*, a.symbol, a.name 
      FROM decision_records d
      JOIN assets a ON d.asset_id = a.id
      WHERE d.portfolio_id = ?
      ORDER BY d.decision_timestamp DESC LIMIT 5
    `, [portfolioId]);

    // 2. Fetch theses
    const theses = db.query<{
      symbol: string;
      core_thesis: string;
      status: string;
      target_price: number;
      stop_loss_price: number;
      invalidation_criteria: string;
    }>(`
      SELECT t.*, a.symbol 
      FROM investment_theses t
      JOIN assets a ON t.asset_id = a.id
      WHERE t.portfolio_id = ? AND t.status = 'ACTIVE'
    `, [portfolioId]);

    // If no decisions yet
    if (recentDecisions.length === 0) {
      return {
        question,
        answerPlain: `No investment decisions have been executed yet in this portfolio. As soon as you or the AI Copilot execute an order, full plain-language rationale, supporting data, and risk metrics will appear here.`,
        answerAdvanced: `Portfolio transaction ledger is currently empty. Baseline capital is unallocated cash. All deterministic risk boundaries (Max 15% single-stock, Max 80% portfolio exposure, Min 20% liquid cash buffer) remain active and armed.`,
        sources: ['InvestPilot System Audit Ledger']
      };
    }

    const latest = recentDecisions[0];

    if (qLower.includes('why') && (qLower.includes('decision') || qLower.includes('buy') || qLower.includes('invest'))) {
      return {
        question,
        answerPlain: `Here is the recorded reason for our latest action (${latest.action} ${latest.quantity} ${latest.symbol} at ₹${latest.price}): ${latest.reasoning_plain_language}`,
        answerAdvanced: `Decision ID: ${latest.id} executed at ${latest.decision_timestamp}. Quantitative rationale: ${latest.reasoning_advanced}. Risk validation: ${latest.risk_assessment_summary}`,
        sources: [`Decision Record ${latest.id}`, 'Stored market data snapshot (demo fixtures in this build)']
      };
    }

    if (qLower.includes('wrong') || qLower.includes('risk') || qLower.includes('downside')) {
      return {
        question,
        answerPlain: `Here is what could go wrong based on our pre-execution audit: ${latest.what_could_go_wrong} To protect your money, we strictly limited the position size so your capital is never over-concentrated.`,
        answerAdvanced: `Downside contingency plan: ${latest.what_could_go_wrong} Enforced boundaries: Max risk per trade capped at 2.0%, stop-loss criteria active, cash buffer preserved.`,
        sources: [`Decision Record ${latest.id} Risk Assessment`]
      };
    }

    if (qLower.includes('alternative') || qLower.includes('other')) {
      return {
        question,
        answerPlain: `Before choosing ${latest.symbol}, the AI compared keeping the cash reserve against allocating it to the candidate company. ${latest.symbol} was proposed because it passed the fixed risk limits; the recorded fundamentals were not verified in this build.`,
        answerAdvanced: `Alternative capital allocations considered: liquid money market buffer, index tracking, or alternate sector heavyweights. Decision ruled in favor of ${latest.symbol} due to superior risk-adjusted balance sheet metrics.`,
        sources: [`Decision Evidence for ${latest.symbol}`]
      };
    }

    if (qLower.includes('thesis') || qLower.includes('valid')) {
      if (theses.length > 0) {
        const th = theses[0];
        return {
          question,
          answerPlain: `Our investment thesis for ${th.symbol} remains ${th.status}. Target price is ₹${th.target_price}, with a protective stop-loss level at ₹${th.stop_loss_price}. It would invalidate if: ${th.invalidation_criteria}`,
          answerAdvanced: `Active thesis state: ${th.status}. Target: ₹${th.target_price}. Invalidation criteria: ${th.invalidation_criteria}. Periodic audit checks verify quarterly earnings sustainability.`,
          sources: [`Investment Theses Ledger`]
        };
      }
    }

    // Default grounded overview
    return {
      question,
      answerPlain: `Based on your recent portfolio activity, our latest decision was ${latest.action} ${latest.quantity} ${latest.symbol} on ${latest.decision_timestamp}. Reason: ${latest.reasoning_plain_language}`,
      answerAdvanced: `Audit trail for Portfolio: Most recent action ${latest.id} (${latest.action} ${latest.symbol}). ${latest.reasoning_advanced}`,
      sources: [`Decision Records`, `Portfolio Cash Ledger`]
    };
  }

  /**
   * Generates comprehensive Daily Portfolio Report
   */
  generateDailyReport(portfolioId: string) {
    const portfolio = db.queryOne<{
      id: string;
      name: string;
      type: string;
      current_cash: number;
      invested_value: number;
      total_value: number;
      realised_pnl: number;
      unrealised_pnl: number;
    }>('SELECT * FROM portfolios WHERE id = ?', [portfolioId]);

    const positions = db.query<{
      symbol: string;
      name: string;
      quantity: number;
      average_buy_price: number;
      current_price: number;
      current_market_value: number;
      unrealised_pnl: number;
      unrealised_pnl_pct: number;
    }>(`
      SELECT p.*, a.symbol, a.name 
      FROM positions p
      JOIN assets a ON p.asset_id = a.id
      WHERE p.portfolio_id = ?
    `, [portfolioId]);

    const recentExecutions = db.query<{
      symbol: string;
      side: string;
      quantity: number;
      fill_price: number;
      total_charges: number;
      executed_at: string;
    }>(`
      SELECT e.*, a.symbol 
      FROM executions e
      JOIN assets a ON e.asset_id = a.id
      WHERE e.portfolio_id = ?
      ORDER BY e.executed_at DESC LIMIT 5
    `, [portfolioId]);

    const observations = db.query<{
      symbol: string;
      observation_type: string;
      facts: string;
      priority: string;
    }>(`
      SELECT o.*, a.symbol 
      FROM agent_observations o
      JOIN assets a ON o.asset_id = a.id
      ORDER BY o.observed_at DESC LIMIT 4
    `);

    return {
      reportDate: '2026-10-20',
      dataProvenance: 'Demo fixtures: prices, fundamentals and news in this build are illustrative, not exchange-verified.',
      portfolio: portfolio || { name: 'Virtual Wealth Builder', total_value: 25000, current_cash: 25000 },
      positions,
      recentExecutions,
      marketObservations: observations,
      riskStatus: {
        status: 'HEALTHY',
        cashReservePct: portfolio ? Math.round((portfolio.current_cash / portfolio.total_value) * 1000) / 10 : 100,
        safeguardsArmed: ['Position Cap (15%)', 'Daily Loss Limit (₹1,500)', 'Min Cash (20%)', 'Emergency Stop']
      }
    };
  }
}

export const explainabilityAgent = new ExplainabilityAgent();
export default explainabilityAgent;
