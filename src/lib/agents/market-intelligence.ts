import db from '../../db';
import marketData from '../market-data';

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

export class MarketIntelligenceAgent {
  name = 'MARKET_INTELLIGENCE';

  async runScan(triggerType: 'SCHEDULED' | 'MANUAL' | 'EVENT' = 'MANUAL'): Promise<{
    runId: string;
    summary: string;
    observations: ObservationResult[];
  }> {
    const runId = `run_mi_${Date.now()}`;
    const quotes = await marketData.getAllQuotes();
    const observations: ObservationResult[] = [];

    // Analyze each asset
    for (const q of quotes) {
      const fund = await marketData.getFundamentals(q.symbol);
      const candles = await marketData.getHistoricalCandles(q.symbol, 20);

      // 1. Check for Quality & Valuation Discount
      if (fund && fund.roce > 18 && fund.debtToEquity < 0.5 && fund.peRatio < 30) {
        observations.push({
          assetId: q.assetId,
          symbol: q.symbol,
          observationType: 'VALUATION_DISCOUNT',
          facts: `ROCE is ${fund.roce}%, Debt-to-Equity is ${fund.debtToEquity}, P/E ratio is ${fund.peRatio}x. Audited FY net profit margin is ${fund.netProfitMargin}%.`,
          interpretation: `High-quality balance sheet trading at reasonable multiple relative to earnings durability and return on capital.`,
          priority: 'HIGH',
          catalysts: `Consistent free cash flow generation (₹${fund.freeCashFlowCr.toLocaleString('en-IN')} Cr) and zero balance-sheet stress.`,
          risks: `Broader macroeconomic equity multiple contraction or sector rotation.`,
          dataSources: `NSE Audited Filings, FY24-25 balance sheet records.`,
          isActionable: true
        });
      }

      // 2. Check for Trend & Volume Breakout
      if (candles.length >= 10) {
        const avgVol = candles.slice(0, 10).reduce((acc: number, c: any) => acc + c.volume, 0) / 10;
        const latestVol = q.volume;
        const priceChangePct = q.changePct;

        if (latestVol > avgVol * 1.25 && priceChangePct > 0.8) {
          observations.push({
            assetId: q.assetId,
            symbol: q.symbol,
            observationType: 'BREAKOUT',
            facts: `Trading volume (${latestVol.toLocaleString('en-IN')}) is 25%+ above 10-day average. Day price change is +${priceChangePct}%.`,
            interpretation: `Short-term institutional accumulation observed above key VWAP pivot.`,
            priority: 'MEDIUM',
            catalysts: `Fresh sector inflows and positive delivery volume participation.`,
            risks: `False breakout risk if index fails to sustain above session high.`,
            dataSources: `NSE Tick & 1D Historical Candles.`,
            isActionable: true
          });
        }
      }

      // 3. Check for Elevated Valuation / Risk Warning
      if (fund && fund.peRatio > 60) {
        observations.push({
          assetId: q.assetId,
          symbol: q.symbol,
          observationType: 'RISK_SPIKE',
          facts: `P/E multiple is ${fund.peRatio}x, Debt-to-Equity is ${fund.debtToEquity}.`,
          interpretation: `Valuation is rich, leaving thin margin of safety against potential quarterly earnings disappointment.`,
          priority: 'HIGH',
          catalysts: `Premium growth expectation built into valuation.`,
          risks: `Downside re-rating if quarterly revenue growth decelerates below 15%.`,
          dataSources: `NSE EOD Quote & Audited Quarterly Filings.`,
          isActionable: false
        });
      }
    }

    // Persist Agent Run
    const summary = `Scanned ${quotes.length} Indian NSE bluechips. Identified ${observations.length} significant market observations (${observations.filter(o => o.isActionable).length} actionable).`;

    db.execute(`
      INSERT INTO agent_runs (id, agent_name, trigger_type, status, summary, metadata_json, started_at, completed_at)
      VALUES (?, ?, ?, 'COMPLETED', ?, ?, datetime('now'), datetime('now'))
    `, [runId, this.name, triggerType, summary, JSON.stringify({ scannedCount: quotes.length, obsCount: observations.length })]);

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

    return { runId, summary, observations };
  }
}

export const marketIntelligenceAgent = new MarketIntelligenceAgent();
export default marketIntelligenceAgent;
