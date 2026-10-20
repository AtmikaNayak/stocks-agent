import { describe, it, expect } from 'vitest';
import marketIntelligenceAgent from '../src/lib/agents/market-intelligence';
import investmentStrategistAgent from '../src/lib/agents/strategist';
import explainabilityAgent from '../src/lib/agents/explainability';

describe('Four AI Agents Coordination', () => {
  it('Market Intelligence Agent scans quotes and extracts clearly-labelled observations', async () => {
    const scan = await marketIntelligenceAgent.runScan('MANUAL');
    expect(scan.runId).toBeDefined();
    expect(scan.observations.length).toBeGreaterThan(0);
    expect(scan.observations.some(o => o.observationType === 'VALUATION_DISCOUNT')).toBe(true);
    // Demo fixtures must never be presented as verified or actionable.
    expect(scan.dataQuality.allSynthetic).toBe(true);
    expect(scan.observations.every(o => o.isActionable === false)).toBe(true);
  });

  it('Investment Strategist Agent formulates structured proposal with evidence and criteria', async () => {
    const proposal = await investmentStrategistAgent.evaluateAndPropose({
      portfolioId: 'port_virt_01',
      assetId: 'ast_itc',
      action: 'BUY',
      horizon: 'LONG_TERM'
    });

    expect(proposal.proposalId).toBeDefined();
    expect(proposal.rationale).toBeDefined();
    expect(proposal.supportingEvidence).toBeDefined();
    expect(proposal.contraryEvidence).toBeDefined();
    expect(proposal.expectedCharges).toBeGreaterThan(0);
  });

  it('Explainability Agent provides grounded plain and advanced answers', async () => {
    const answer = await explainabilityAgent.answerHistoricalQuestion('port_virt_01', 'Why did you make this decision?');
    expect(answer.question).toBe('Why did you make this decision?');
    expect(answer.answerPlain).toBeDefined();
    expect(answer.answerAdvanced).toBeDefined();
    expect(answer.sources.length).toBeGreaterThan(0);
  });
});
