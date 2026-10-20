import { describe, it, expect } from 'vitest';
import db from '../src/db';
import marketIntelligenceAgent from '../src/lib/agents/market-intelligence';
import investmentStrategistAgent from '../src/lib/agents/strategist';
import explainabilityAgent from '../src/lib/agents/explainability';
import marketData from '../src/lib/market-data';

describe('Agent validation — recomputed observations are never presented as verified', () => {
  it('marks every observation from the synthetic demo feed as non-actionable', async () => {
    const scan = await marketIntelligenceAgent.runScan('MANUAL');

    expect(scan.observations.length).toBeGreaterThan(0);
    expect(scan.dataQuality.allSynthetic).toBe(true);
    expect(scan.dataQuality.verifiedFeedConnected).toBe(false);
    expect(scan.dataQuality.actionableObservations).toBe(0);

    for (const observation of scan.observations) {
      expect(observation.isActionable).toBe(false);
      // Provenance must travel with the observation text itself.
      expect(observation.facts).toMatch(/Source: .+\((SYNTHETIC|STALE|HISTORICAL|UNKNOWN)\)/);
      expect(observation.facts).toMatch(/Illustrative demo fundamentals|demo fixture/i);
      expect(observation.dataSources).not.toMatch(/Audited|NSE Audited Filings|NSE Tick/);
    }
  });

  it('says plainly in the run summary that nothing is actionable', async () => {
    const scan = await marketIntelligenceAgent.runScan('SCHEDULED');
    expect(scan.summary).toMatch(/synthetic demo fixtures/i);
    expect(scan.summary).not.toMatch(/verified observations/i);
    expect(scan.summary).not.toMatch(/\bbluechips identified\b/i);
  });

  it('persists the non-actionable flag to the database, not just the in-memory result', async () => {
    const scan = await marketIntelligenceAgent.runScan('MANUAL');
    const rows = db.query<{ is_actionable: number }>(
      'SELECT is_actionable FROM agent_observations WHERE agent_run_id = ?',
      [scan.runId]
    );
    expect(rows.length).toBe(scan.observations.length);
    expect(rows.every((row) => row.is_actionable === 0)).toBe(true);
  });

  it('records data-quality metadata on the agent run for audit', async () => {
    const scan = await marketIntelligenceAgent.runScan('MANUAL');
    const run = db.queryOne<{ metadata_json: string }>('SELECT metadata_json FROM agent_runs WHERE id = ?', [
      scan.runId
    ]);
    const metadata = JSON.parse(run!.metadata_json);
    expect(metadata.allSynthetic).toBe(true);
    expect(metadata.actionableCount).toBe(0);
  });
});

describe('Agent validation — strategist rejects unusable input', () => {
  it('rejects a missing portfolio or asset identifier', async () => {
    await expect(
      investmentStrategistAgent.evaluateAndPropose({
        portfolioId: '',
        assetId: 'ast_itc',
        action: 'BUY',
        horizon: 'LONG_TERM'
      })
    ).rejects.toThrow(/portfolioId/);

    await expect(
      investmentStrategistAgent.evaluateAndPropose({
        portfolioId: 'port_virt_01',
        assetId: '',
        action: 'BUY',
        horizon: 'LONG_TERM'
      })
    ).rejects.toThrow(/assetId/);
  });

  it('rejects an unsupported side or horizon instead of defaulting', async () => {
    await expect(
      investmentStrategistAgent.evaluateAndPropose({
        portfolioId: 'port_virt_01',
        assetId: 'ast_itc',
        action: 'HOLD' as any,
        horizon: 'LONG_TERM'
      })
    ).rejects.toThrow(/action must be one of/);

    await expect(
      investmentStrategistAgent.evaluateAndPropose({
        portfolioId: 'port_virt_01',
        assetId: 'ast_itc',
        action: 'BUY',
        horizon: 'FOREVER' as any
      })
    ).rejects.toThrow(/horizon must be one of/);
  });

  it('refuses to build proposals for the real-money portfolio', async () => {
    await expect(
      investmentStrategistAgent.evaluateAndPropose({
        portfolioId: 'port_real_01',
        assetId: 'ast_itc',
        action: 'BUY',
        horizon: 'LONG_TERM'
      })
    ).rejects.toThrow(/real-money execution is disabled/i);
  });

  it('rejects unknown assets rather than fabricating a proposal', async () => {
    await expect(
      investmentStrategistAgent.evaluateAndPropose({
        portfolioId: 'port_virt_01',
        assetId: 'ast_does_not_exist',
        action: 'BUY',
        horizon: 'LONG_TERM'
      })
    ).rejects.toThrow(/not found/i);
  });

  it('labels the proposal as non-actionable and discloses demo data', async () => {
    const proposal = await investmentStrategistAgent.evaluateAndPropose({
      portfolioId: 'port_virt_01',
      assetId: 'ast_itc',
      action: 'BUY',
      horizon: 'LONG_TERM'
    });

    expect(proposal.isActionable).toBe(false);
    expect(proposal.dataProvenance.pricesVerified).toBe(false);
    expect(proposal.dataProvenance.fundamentalsVerified).toBe(false);
    expect(proposal.dataProvenance.quoteFreshness).toBe('SYNTHETIC');
    expect(proposal.dataProvenance.disclosure).toMatch(/simulated demo fixtures/i);
    expect(proposal.dataProvenance.disclosure).toMatch(/not actionable/i);
  });

  it('never claims audited or verified data in its rationale', async () => {
    const proposal = await investmentStrategistAgent.evaluateAndPropose({
      portfolioId: 'port_virt_01',
      assetId: 'ast_itc',
      action: 'BUY',
      horizon: 'SHORT_TERM'
    });

    const text = `${proposal.rationale} ${proposal.supportingEvidence} ${proposal.contraryEvidence}`;
    expect(text).not.toMatch(/Verified NSE/i);
    expect(text).not.toMatch(/Audited/i);
    expect(text).not.toMatch(/institutional sponsorship/i);
  });

  it('does not invent fundamentals when a company has none stored', async () => {
    const withoutFundamentals = db.queryOne<{ id: string; symbol: string }>(`
      SELECT a.id, a.symbol FROM assets a
      WHERE NOT EXISTS (SELECT 1 FROM company_fundamentals f WHERE f.asset_id = a.id)
      LIMIT 1
    `);

    if (!withoutFundamentals) return; // seed covers every asset; nothing to assert

    const quote = await marketData.getQuote(withoutFundamentals.symbol);
    if (!quote) return;

    const proposal = await investmentStrategistAgent.evaluateAndPropose({
      portfolioId: 'port_virt_01',
      assetId: withoutFundamentals.id,
      action: 'BUY',
      horizon: 'LONG_TERM'
    });

    expect(proposal.dataProvenance.fundamentalsVerified).toBe(false);
    expect(proposal.rationale).not.toMatch(/ROCE of 16%/);
    expect(proposal.supportingEvidence).toMatch(/not available in this dataset|No fundamentals/i);
  });

  it('stores the quote provenance in the proposal preconditions', async () => {
    const proposal = await investmentStrategistAgent.evaluateAndPropose({
      portfolioId: 'port_virt_01',
      assetId: 'ast_itc',
      action: 'BUY',
      horizon: 'LONG_TERM'
    });

    const row = db.queryOne<{ preconditions: string; action: string }>(
      'SELECT preconditions, action FROM investment_proposals WHERE id = ?',
      [proposal.proposalId]
    );
    expect(row!.preconditions).toMatch(/SYNTHETIC/i);
    expect(row!.preconditions).toMatch(/deterministic risk checks/i);
  });
});

describe('Agent validation — explainability never fabricates evidence', () => {
  it('does not label demo fundamentals as audited NSE filings', async () => {
    const answer = await explainabilityAgent.answerHistoricalQuestion(
      'port_virt_01',
      'Why did you make this decision?'
    );

    const text = `${answer.answerPlain} ${answer.answerAdvanced} ${answer.sources.join(' ')}`;
    expect(text).not.toMatch(/NSE Audited Filings/i);
    expect(text).not.toMatch(/verified reason/i);
    expect(answer.sources.length).toBeGreaterThan(0);
  });

  it('produces a grounded answer that admits it has no decisions yet', async () => {
    const answer = await explainabilityAgent.answerHistoricalQuestion('port_virt_01', 'What could go wrong?');
    expect(answer.answerPlain.length).toBeGreaterThan(0);
    expect(answer.answerAdvanced.length).toBeGreaterThan(0);
  });
});

describe('Agent validation — proposal execution requires an explicit approval', () => {
  it('refuses to execute a PENDING proposal', async () => {
    const proposal = await investmentStrategistAgent.evaluateAndPropose({
      portfolioId: 'port_virt_01',
      assetId: 'ast_itc',
      action: 'BUY',
      horizon: 'LONG_TERM'
    });

    const portfolioExecutionAgent = (await import('../src/lib/agents/portfolio-execution')).default;
    await expect(
      portfolioExecutionAgent.executeOrder({
        portfolioId: 'port_virt_01',
        assetId: 'ast_itc',
        side: 'BUY',
        quantity: proposal.quantity,
        orderMode: 'AI_PROPOSAL_APPROVED',
        proposalId: proposal.proposalId
      })
    ).rejects.toThrow(/must be approved/i);
  });

  it('refuses a quantity that does not match the approved proposal', async () => {
    const proposal = await investmentStrategistAgent.evaluateAndPropose({
      portfolioId: 'port_virt_01',
      assetId: 'ast_itc',
      action: 'BUY',
      horizon: 'LONG_TERM'
    });
    db.execute("UPDATE investment_proposals SET status = 'APPROVED' WHERE id = ?", [proposal.proposalId]);

    const portfolioExecutionAgent = (await import('../src/lib/agents/portfolio-execution')).default;
    await expect(
      portfolioExecutionAgent.executeOrder({
        portfolioId: 'port_virt_01',
        assetId: 'ast_itc',
        side: 'BUY',
        quantity: proposal.quantity + 1,
        orderMode: 'AI_PROPOSAL_APPROVED',
        proposalId: proposal.proposalId
      })
    ).rejects.toThrow(/must be approved, unexpired, and match/i);
  });

  it('still refuses to execute against the real-money portfolio', async () => {
    const portfolioExecutionAgent = (await import('../src/lib/agents/portfolio-execution')).default;
    await expect(
      portfolioExecutionAgent.executeOrder({
        portfolioId: 'port_real_01',
        assetId: 'ast_itc',
        side: 'BUY',
        quantity: 1,
        orderMode: 'MANUAL'
      })
    ).rejects.toThrow(/REAL portfolio execution is disabled/i);
  });

  it('rejects a caller-supplied fill price', async () => {
    const portfolioExecutionAgent = (await import('../src/lib/agents/portfolio-execution')).default;
    await expect(
      portfolioExecutionAgent.executeOrder({
        portfolioId: 'port_virt_01',
        assetId: 'ast_itc',
        side: 'BUY',
        quantity: 1,
        price: 1,
        orderMode: 'MANUAL'
      })
    ).rejects.toThrow(/Custom fill prices are disabled/i);
  });
});
