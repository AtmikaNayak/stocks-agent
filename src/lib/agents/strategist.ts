import db from '../../db';
import marketData from '../market-data';
import { calculateIndianCharges } from '../tax-calculator';
import { evaluateProposalRisk } from '../risk-engine';
import { Horizon } from '../types';
import { describeFundamentalProvenance, describeQuoteProvenance, validateQuote } from '../data-provenance';
import { requireEnum, requireNonEmptyString } from '../validation';

export interface GenerateProposalInput {
  portfolioId: string;
  assetId: string;
  action: 'BUY' | 'SELL';
  horizon: Horizon;
  strategyVersionId?: string;
  userPrompt?: string;
}

export class InvestmentStrategistAgent {
  name = 'STRATEGIST';

  async evaluateAndPropose(input: GenerateProposalInput) {
    // Fail closed on malformed input rather than inventing a plausible proposal.
    const portfolioId = requireNonEmptyString(input?.portfolioId, 'portfolioId');
    const assetId = requireNonEmptyString(input?.assetId, 'assetId');
    const action = requireEnum(input?.action, 'action', ['BUY', 'SELL'] as const);
    const horizon = requireEnum(input?.horizon, 'horizon', ['LONG_TERM', 'SHORT_TERM'] as const);
    const strategyVersionId = input?.strategyVersionId;

    // 1. Fetch Asset & Market Data
    const asset = db.queryOne<{ id: string; symbol: string; name: string; sector: string }>(
      'SELECT id, symbol, name, sector FROM assets WHERE id = ?',
      [assetId]
    );
    if (!asset) throw new Error(`Asset with id ${assetId} not found`);

    const quote = await marketData.getQuote(asset.symbol);
    if (!quote) throw new Error(`Could not obtain market quote for ${asset.symbol}`);

    // Structural validation: a proposal must never be built on an unusable quote.
    const quoteValidation = validateQuote(quote);
    if (!quoteValidation.ok) {
      throw new Error(
        `Proposal rejected: the stored quote for ${asset.symbol} is not usable (${quoteValidation.reasons.join('; ')}).`
      );
    }
    const quoteProvenance = describeQuoteProvenance({
      freshness: quote.freshness,
      provider: quote.provider
    });
    if (quoteProvenance.freshness === 'STALE') {
      throw new Error(`Proposal rejected: the stored quote for ${asset.symbol} is stale. Refresh data first.`);
    }

    const fund = await marketData.getFundamentals(asset.symbol);
    const fundProvenance = fund ? describeFundamentalProvenance(fund.source) : null;
    const fundamentalsVerified = Boolean(fundProvenance?.isVerified);

    // 2. Fetch Portfolio State
    const portfolio = db.queryOne<{
      id: string;
      type: 'REAL' | 'VIRTUAL';
      total_value: number;
      current_cash: number;
      is_active: number;
    }>('SELECT id, type, total_value, current_cash, is_active FROM portfolios WHERE id = ?', [portfolioId]);
    if (!portfolio) throw new Error(`Portfolio with id ${portfolioId} not found`);
    if (!portfolio.is_active) throw new Error(`Portfolio ${portfolioId} is inactive.`);

    // Proposals are suggestions inside a portfolio, but real-money automation is
    // disabled in this build, so no proposal may target the real account.
    if (portfolio.type !== 'VIRTUAL') {
      throw new Error('Proposals are limited to the virtual practice portfolio: real-money execution is disabled in this build.');
    }
    if (!Number.isFinite(portfolio.total_value) || portfolio.total_value <= 0) {
      throw new Error(`Portfolio ${portfolioId} has an invalid total value; cannot size a position.`);
    }

    // Sizing calculation:
    // Target 8% to 12% allocation per position, bounded by available cash
    const targetAllocationAmount = portfolio.total_value * (horizon === 'LONG_TERM' ? 0.10 : 0.06);
    let targetQuantity = Math.max(1, Math.floor(targetAllocationAmount / quote.price));

    // If BUY and not enough cash, clamp to affordable shares (keeping 20% cash reserve buffer)
    if (action === 'BUY') {
      const maxSpendableCash = Math.max(0, portfolio.current_cash - (portfolio.total_value * 0.20));
      const affordableQty = Math.floor(maxSpendableCash / quote.price);
      targetQuantity = Math.max(1, Math.min(targetQuantity, affordableQty > 0 ? affordableQty : 1));
    } else if (action === 'SELL') {
      const heldPos = db.queryOne<{ quantity: number }>(
        'SELECT quantity FROM positions WHERE portfolio_id = ? AND asset_id = ?',
        [portfolioId, assetId]
      );
      targetQuantity = heldPos ? heldPos.quantity : 1;
    }

    if (!Number.isSafeInteger(targetQuantity) || targetQuantity <= 0) {
      throw new Error(`Refusing to propose a non-positive quantity for ${asset.symbol}.`);
    }

    const proposedValue = targetQuantity * quote.price;
    if (!Number.isFinite(proposedValue) || proposedValue <= 0) {
      throw new Error(`Refusing to propose an invalid order value for ${asset.symbol}.`);
    }
    const charges = calculateIndianCharges({
      side: action,
      quantity: targetQuantity,
      price: quote.price,
      productType: 'CNC'
    });

    // Generate evidence-based arguments
    let rationale = '';
    let supportingEvidence = '';
    let contraryEvidence = '';
    let alternativesConsidered = '';
    let invalidationCriteria = '';

    const metric = (value: number | null | undefined, suffix = '', name = 'value'): string => {
      if (value === null || value === undefined || !Number.isFinite(Number(value))) {
        return `${name} is not available in this dataset`;
      }
      return `${name} ${Number(value)}${suffix}`;
    };

    const dataLevelDisclosure = quoteProvenance.isVerified
      ? `Prices are verified ${quoteProvenance.freshness} data from ${quoteProvenance.provider}.`
      : `Prices are simulated demo fixtures from ${quoteProvenance.provider ?? 'an unknown source'}; this proposal demonstrates mechanics only and is not actionable for real money.`;

    const fundamentalsDisclosure = fundamentalsVerified
      ? `Fundamentals come from ${fundProvenance?.provider}.`
      : fund
        ? `Fundamentals are illustrative demo fixtures (${fundProvenance?.provider}) and are not audited or exchange-verified.`
        : 'No fundamentals are stored for this company in this dataset.';

    // Suggestions describe what the stored data shows. They never assert that a
    // trade should be made, and never invent a number that is missing.
    if (action === 'BUY') {
      if (horizon === 'LONG_TERM') {
        rationale = `Proposal to allocate ${targetQuantity} share${targetQuantity === 1 ? '' : 's'} of ${asset.name} (${asset.symbol}) at ₹${quote.price}, sized within the fixed single-position limit. ${dataLevelDisclosure}`;
        supportingEvidence = [
          fundamentalsVerified
            ? `Reported profitability: ${metric(fund?.roce, '%', 'ROCE')}, ${metric(fund?.debtToEquity, '', 'Debt-to-Equity')}, ${metric(fund?.operatingMargin, '%', 'operating margin')}.`
            : `${fundamentalsDisclosure}`,
          `Price currently ₹${quote.price} (${quote.changePct >= 0 ? '+' : ''}${quote.changePct}% today) on ${quote.provider ?? 'unknown source'} data.`
        ].join(' ');
        contraryEvidence = [
          fundamentalsVerified
            ? `Valuation at ${metric(fund?.peRatio, 'x P/E')} leaves limited room if growth slows.`
            : 'Without verified fundamentals, the case for owning this business cannot be assessed from the stored data.',
          `General equity market volatility could produce a short-term mark-to-market drawdown, and simulated charges reduce any gain.`
        ].join(' ');
        alternativesConsidered = `Holding cash (which the 20% cash-reserve rule partly enforces) or skipping the idea entirely.`;
        invalidationCriteria = `Revisit the idea if reported operating margin falls sharply, Debt-to-Equity rises above 1.0, or the price breaks well below its recent range.`;
      } else {
        rationale = `Short-term proposal for ${asset.symbol} after a ${quote.changePct >= 0 ? '+' : ''}${quote.changePct}% daily move. ${dataLevelDisclosure}`;
        supportingEvidence = `Volume of ${quote.volume.toLocaleString('en-IN')} shares and price ₹${quote.price} on ${quote.provider ?? 'unknown source'} (${quote.freshness}) data.`;
        contraryEvidence = `Gap risk on unexpected global cues or sector consolidation; short-term trading is where most beginners lose money.`;
        alternativesConsidered = `Waiting for a calmer entry, or not trading at all.`;
        invalidationCriteria = `Exit if price closes 2.5% below entry (₹${(quote.price * 0.975).toFixed(2)}).`;
      }
    } else {
      rationale = `Proposal to exit ${targetQuantity} share${targetQuantity === 1 ? '' : 's'} of ${asset.symbol} at ₹${quote.price}, releasing cash back to the reserve. ${dataLevelDisclosure}`;
      supportingEvidence = `Position size and the 20% cash-reserve rule determine how much can be released at the stored quote.`;
      contraryEvidence = `Upside continuation if sector momentum accelerates after the exit.`;
      alternativesConsidered = `Partial profit booking instead of a full exit.`;
      invalidationCriteria = `Not applicable — this is an exit.`;
    }

    const proposalId = `prop_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours expiry

    // Persist Proposal
    db.execute(`
      INSERT INTO investment_proposals (
        id, portfolio_id, asset_id, strategy_version_id, action, horizon,
        proposed_price, proposed_quantity, proposed_value, rationale,
        supporting_evidence, contrary_evidence, alternatives_considered,
        invalidation_criteria, preconditions, expected_costs, expires_at, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', datetime('now'))
    `, [
      proposalId,
      portfolioId,
      assetId,
      strategyVersionId || null,
      action,
      horizon,
      quote.price,
      targetQuantity,
      proposedValue,
      rationale,
      supportingEvidence,
      contraryEvidence,
      alternativesConsidered,
      invalidationCriteria,
      `Quote ${quote.freshness} from ${quote.provider ?? 'unknown source'}; market session open; deterministic risk checks must pass.`,
      charges.totalCharges,
      expiresAt
    ]);

    // Deterministic Risk Assessment Check
    const riskCheck = evaluateProposalRisk({
      portfolioId,
      assetId,
      side: action,
      quantity: targetQuantity,
      price: quote.price
    });

    const riskAssessmentId = `risk_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    db.execute(`
      INSERT INTO risk_assessments (
        id, proposal_id, passed, rejection_reasons, checks_json,
        calculated_exposure_after_pct, calculated_position_pct, cash_remaining_after, assessed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `, [
      riskAssessmentId,
      proposalId,
      riskCheck.passed ? 1 : 0,
      riskCheck.reasons.length > 0 ? riskCheck.reasons.join('; ') : null,
      JSON.stringify(riskCheck.checks),
      riskCheck.calculatedExposureAfterPct,
      riskCheck.calculatedPositionPct,
      riskCheck.cashRemainingAfter
    ]);

    if (!riskCheck.passed) {
      db.execute(
        "UPDATE investment_proposals SET status = 'REJECTED_RISK' WHERE id = ?",
        [proposalId]
      );
    }

    // Persist Investment Thesis if BUY
    if (action === 'BUY') {
      const thesisId = `ths_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      db.execute(`
        INSERT INTO investment_theses (
          id, portfolio_id, asset_id, horizon, core_thesis, catalysts,
          target_price, stop_loss_price, time_horizon_days, invalidation_criteria, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', datetime('now'), datetime('now'))
      `, [
        thesisId,
        portfolioId,
        assetId,
        horizon,
        rationale,
        supportingEvidence,
        quote.price * (horizon === 'LONG_TERM' ? 1.25 : 1.06),
        quote.price * (horizon === 'LONG_TERM' ? 0.90 : 0.975),
        horizon === 'LONG_TERM' ? 365 : 14,
        invalidationCriteria
      ]);
    }

    return {
      proposalId,
      assetSymbol: asset.symbol,
      isActionable: quoteProvenance.isActionable && fundamentalsVerified,
      dataProvenance: {
        quoteFreshness: quoteProvenance.freshness,
        quoteProvider: quoteProvenance.provider,
        pricesVerified: quoteProvenance.isVerified,
        fundamentalsVerified,
        disclosure: `${dataLevelDisclosure} ${fundamentalsDisclosure}`
      },
      action,
      horizon,
      proposedPrice: quote.price,
      quantity: targetQuantity,
      totalValue: proposedValue,
      expectedCharges: charges.totalCharges,
      riskAssessment: riskCheck,
      rationale,
      supportingEvidence,
      contraryEvidence
    };
  }
}

export const investmentStrategistAgent = new InvestmentStrategistAgent();
export default investmentStrategistAgent;
