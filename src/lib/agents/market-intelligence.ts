import db from '../../db';
import marketData from '../market-data';
import { describeFundamentalProvenance, describeQuoteProvenance, validateQuote } from '../data-provenance';

export interface ObservationResult {
  assetId: string;
  symbol: string;
  observationType: string;
  facts: string;
  interpretation: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  catalysts: string;
  risks: string;
  dataSources: string;
  isActionable: boolean;
}

export interface MarketScanResult {
  runId: string;
  summary: string;
  observations: ObservationResult[];
  /** Data-quality facts about this run, so callers never have to guess. */
  dataQuality: {
    scanned: number;
    skipped: number;
    syntheticQuotes: number;
    actionableObservations: number;
    allSynthetic: boolean;
    verifiedFeedConnected: boolean;
  };
}

const MAX_ANALYSABLE_CANDLES = 20;

export class MarketIntelligenceAgent {
  name = 'MARKET_INTELLIGENCE';

  async runScan(triggerType: 'SCHEDULED' | 'MANUAL' | 'EVENT' = 'MANUAL'): Promise<MarketScanResult> {
    const runId = `run_mi_${Date.now()}`;
    const quotes = await marketData.getAllQuotes();
    const observations: ObservationResult[] = [];

    let skipped = 0;
    let syntheticQuotes = 0;

    // Analyze each asset
    for (const q of quotes) {
      // Never reason from a structurally invalid quote.
      const validation = validateQuote(q);
      if (!validation.ok || !validation.provenance) {
        skipped += 1;
        continue;
      }

      const provenance = validation.provenance;
      if (provenance.isSynthetic) syntheticQuotes += 1;

      const isVerified = provenance.isVerified;
      const provenanceNote = isVerified
        ? `Source: ${q.provider} (${q.freshness}).`
        : `Source: ${q.provider ?? 'unknown'} (${q.freshness}) — demo fixture, not exchange data.`;

      const fund = await marketData.getFundamentals(q.symbol);
      const fundProvenance = fund ? describeFundamentalProvenance(fund.source) : null;
      const fundamentalsVerified = Boolean(fundProvenance?.isVerified);
      // Demo fundamentals may still be described, but they must be labelled and
      // they can never make an observation actionable.
      const fundLabel = fundamentalsVerified ? 'Reported' : 'Illustrative demo';

      const candles = await marketData.getHistoricalCandles(q.symbol, MAX_ANALYSABLE_CANDLES);

      // 1. Quality & Valuation Discount — requires verified fundamentals
      if (fund && fund.roce > 18 && fund.debtToEquity < 0.5 && fund.peRatio < 30) {
        observations.push({
          assetId: q.assetId,
          symbol: q.symbol,
          observationType: 'VALUATION_DISCOUNT',
          facts: `${fundLabel} fundamentals: ROCE ${fund.roce}%, Debt-to-Equity ${fund.debtToEquity}, P/E ${fund.peRatio}x, net margin ${fund.netProfitMargin}%. ${provenanceNote}`,
          interpretation: fundamentalsVerified
            ? `High-quality balance sheet trading at a reasonable multiple relative to earnings durability and return on capital.`
            : `The demo numbers look like a high-quality, reasonably priced business. Because neither the prices nor the fundamentals are verified here, treat this as an illustration of how the check works.`,
          priority: 'HIGH',
          catalysts: `Free cash flow of ₹${fund.freeCashFlowCr.toLocaleString('en-IN')} Cr and no balance-sheet stress.`,
          risks: `Broader macroeconomic equity multiple contraction or sector rotation.`,
          dataSources: `${fundProvenance?.provider ?? 'unknown fundamentals source'} (${fundamentalsVerified ? 'verified' : 'illustrative demo'}); ${q.provider ?? 'unknown price source'} (${q.freshness})`,
          isActionable: isVerified && Boolean(fundProvenance?.isActionable)
        });
      }

      // 2. Trend & Volume Breakout
      if (candles.length >= 10) {
        const recent = candles.slice(0, 10);
        const validVolumes = recent
          .map((c: any) => Number(c?.volume))
          .filter((v: number) => Number.isFinite(v) && v >= 0);

        if (validVolumes.length === 10) {
          const avgVol = validVolumes.reduce((acc, v) => acc + v, 0) / validVolumes.length;
          const latestVol = Number(q.volume);
          const priceChangePct = Number(q.changePct);

          if (
            Number.isFinite(latestVol) &&
            Number.isFinite(priceChangePct) &&
            avgVol > 0 &&
            latestVol > avgVol * 1.25 &&
            priceChangePct > 0.8
          ) {
            observations.push({
              assetId: q.assetId,
              symbol: q.symbol,
              observationType: 'BREAKOUT',
              facts: `Trading volume (${latestVol.toLocaleString('en-IN')}) is more than 25% above the 10-day average. Day price change is +${priceChangePct}%. ${provenanceNote}`,
              interpretation: `Short-term volume expansion above the recent average — a pattern worth watching, not a confirmed institutional signal.`,
              priority: 'MEDIUM',
              catalysts: `Fresh sector inflows and higher delivery volume participation.`,
              risks: `False breakout risk if the index fails to hold above the session high.`,
              dataSources: `${q.provider ?? 'unknown price source'} (${q.freshness}); ${candles.length} recent candles`,
              isActionable: isVerified
            });
          }
        }
      }

      // 3. Elevated Valuation / Risk Warning
      if (fund && fund.peRatio > 60) {
        observations.push({
          assetId: q.assetId,
          symbol: q.symbol,
          observationType: 'RISK_SPIKE',
          facts: `${fundLabel} fundamentals: P/E ${fund.peRatio}x, Debt-to-Equity ${fund.debtToEquity}. ${provenanceNote}`,
          interpretation: `Valuation is rich, leaving a thin margin of safety against earnings disappointment.`,
          priority: 'HIGH',
          catalysts: `Premium growth expectations are already priced in.`,
          risks: `Downside re-rating if quarterly revenue growth decelerates.`,
          dataSources: `${fundProvenance?.provider ?? 'unknown fundamentals source'} (${fundamentalsVerified ? 'verified' : 'illustrative demo'}); ${q.provider ?? 'unknown price source'} (${q.freshness})`,
          isActionable: false
        });
      }
    }

    const actionableCount = observations.filter((o) => o.isActionable).length;
    const allSynthetic = quotes.length > 0 && syntheticQuotes === quotes.length;
    const verifiedFeedConnected = syntheticQuotes < quotes.length;

    // The summary must not claim more than the data supports.
    const dataNote = allSynthetic
      ? 'All prices came from synthetic demo fixtures, so none of these observations are actionable — they illustrate how the checks work.'
      : `Observations marked actionable use verified price and fundamentals data only (${actionableCount} of ${observations.length}).`;

    const summary = `Scanned ${quotes.length} Indian equities, skipped ${skipped} with unusable quotes, and found ${observations.length} observations (${actionableCount} actionable). ${dataNote}`;

    // Persist Agent Run
    db.execute(`
      INSERT INTO agent_runs (id, agent_name, trigger_type, status, summary, metadata_json, started_at, completed_at)
      VALUES (?, ?, ?, 'COMPLETED', ?, ?, datetime('now'), datetime('now'))
    `, [
      runId,
      this.name,
      triggerType,
      summary,
      JSON.stringify({
        scannedCount: quotes.length,
        skippedCount: skipped,
        syntheticCount: syntheticQuotes,
        obsCount: observations.length,
        actionableCount,
        allSynthetic,
        verifiedFeedConnected
      })
    ]);

    // Persist Observations
    for (const obs of observations) {
      const obsId = `obs_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      db.execute(`
        INSERT INTO agent_observations (
          id, agent_run_id, asset_id, observation_type, facts,
          interpretation, priority, catalysts, risks, data_sources, is_actionable, observed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `, [
        obsId,
        runId,
        obs.assetId,
        obs.observationType,
        obs.facts,
        obs.interpretation,
        obs.priority,
        obs.catalysts,
        obs.risks,
        obs.dataSources,
        obs.isActionable ? 1 : 0
      ]);
    }

    return {
      runId,
      summary,
      observations,
      dataQuality: {
        scanned: quotes.length,
        skipped,
        syntheticQuotes,
        actionableObservations: actionableCount,
        allSynthetic,
        verifiedFeedConnected
      }
    };
  }
}

export const marketIntelligenceAgent = new MarketIntelligenceAgent();
export default marketIntelligenceAgent;
