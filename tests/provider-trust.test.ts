import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import {
  describeFundamentalProvenance,
  describeQuoteProvenance,
  isTrustedFundamentalSource,
  isTrustedQuoteProvider,
  isVerifiedSource,
  parseSourceAllowlist
} from '../src/lib/data-provenance';
import marketIntelligenceAgent from '../src/lib/agents/market-intelligence';
import investmentStrategistAgent from '../src/lib/agents/strategist';

const QUOTE_ENV = 'INVESTPILOT_TRUSTED_QUOTE_PROVIDERS';
const FUND_ENV = 'INVESTPILOT_TRUSTED_FUNDAMENTAL_SOURCES';

const ORIGINAL_QUOTE_ENV = process.env[QUOTE_ENV];
const ORIGINAL_FUND_ENV = process.env[FUND_ENV];

function setQuoteAllowlist(value: string | undefined) {
  if (value === undefined) delete process.env[QUOTE_ENV];
  else process.env[QUOTE_ENV] = value;
}

function setFundamentalAllowlist(value: string | undefined) {
  if (value === undefined) delete process.env[FUND_ENV];
  else process.env[FUND_ENV] = value;
}

afterEach(() => {
  setQuoteAllowlist(ORIGINAL_QUOTE_ENV);
  setFundamentalAllowlist(ORIGINAL_FUND_ENV);
});

describe('provider trust — default deny', () => {
  beforeEach(() => {
    setQuoteAllowlist(undefined);
    setFundamentalAllowlist(undefined);
  });

  it('trusts nothing when the allowlists are unconfigured', () => {
    const provenance = describeQuoteProvenance({ freshness: 'LIVE', provider: 'NSE_LIVE_FEED' });
    expect(provenance.isVerified).toBe(false);
    expect(provenance.isActionable).toBe(false);
    expect(provenance.label).toMatch(/unverified/i);
  });

  it('does not infer trust from a source that merely avoids demo words', () => {
    for (const provider of ['totally-random-source', 'PROD_FEED', 'market-data', 'foo']) {
      expect(isTrustedQuoteProvider(provider)).toBe(false);
      expect(isVerifiedSource(provider)).toBe(false);
      expect(describeQuoteProvenance({ freshness: 'EOD', provider }).isActionable).toBe(false);
    }
  });

  it('keeps synthetic fixtures non-actionable even if their name is not obvious', () => {
    const provenance = describeQuoteProvenance({ freshness: 'SYNTHETIC', provider: 'PROD_FEED' });
    expect(provenance.isSynthetic).toBe(true);
    expect(provenance.isVerified).toBe(false);
    expect(provenance.isActionable).toBe(false);
  });

  it('treats a missing provider as unverified', () => {
    expect(describeQuoteProvenance({ freshness: 'LIVE', provider: null }).isActionable).toBe(false);
    expect(describeQuoteProvenance({ freshness: 'LIVE', provider: '' }).isActionable).toBe(false);
  });
});

describe('provider trust — explicit allowlisting', () => {
  it('verifies only an exact, configured match', () => {
    setQuoteAllowlist('NSE_LIVE_FEED');
    expect(isTrustedQuoteProvider('NSE_LIVE_FEED')).toBe(true);

    const provenance = describeQuoteProvenance({ freshness: 'LIVE', provider: 'NSE_LIVE_FEED' });
    expect(provenance.isVerified).toBe(true);
    expect(provenance.isActionable).toBe(true);
    expect(provenance.label).toMatch(/verified/i);
  });

  it('rejects lookalike, prefixed, suffixed and case-different sources', () => {
    setQuoteAllowlist('NSE_LIVE_FEED');
    for (const lookalike of [
      'NSE_LIVE_FEED_FAKE',
      'XNSE_LIVE_FEED',
      'NSE_LIVE',
      'NSE_LIVE_FEE',
      'nse_live_feed',
      'NSE LIIVE FEED'
    ]) {
      expect(isTrustedQuoteProvider(lookalike)).toBe(false);
      expect(describeQuoteProvenance({ freshness: 'LIVE', provider: lookalike }).isActionable).toBe(false);
    }
  });

  it('normalizes surrounding whitespace consistently on both sides', () => {
    setQuoteAllowlist('  NSE_LIVE_FEED  ');
    expect(isTrustedQuoteProvider('NSE_LIVE_FEED')).toBe(true);
    expect(isTrustedQuoteProvider(' NSE_LIVE_FEED ')).toBe(true);
    // Normalization is whitespace-only: the core string must still match exactly.
    expect(isTrustedQuoteProvider('NSE_LIVE_FEED 2')).toBe(false);
  });

  it('does not match substrings of the allowlisted value', () => {
    setQuoteAllowlist('PROVIDER_ALPHA');
    expect(isTrustedQuoteProvider('PROVIDER')).toBe(false);
    expect(isTrustedQuoteProvider('ALPHA')).toBe(false);
    expect(isTrustedQuoteProvider('PROVIDER_ALPHA_EXTRA')).toBe(false);
  });

  it('still refuses stale, historical and unknown freshness for a trusted provider', () => {
    setQuoteAllowlist('NSE_LIVE_FEED');
    expect(describeQuoteProvenance({ freshness: 'STALE', provider: 'NSE_LIVE_FEED' }).isActionable).toBe(false);
    expect(describeQuoteProvenance({ freshness: 'HISTORICAL', provider: 'NSE_LIVE_FEED' }).isActionable).toBe(false);
    expect(describeQuoteProvenance({ freshness: 'MYSTERY', provider: 'NSE_LIVE_FEED' }).isActionable).toBe(false);
  });

  it('rejects a synthetic provider that was allowlisted by mistake', () => {
    setQuoteAllowlist('SYNTHETIC_SEED');
    const provenance = describeQuoteProvenance({ freshness: 'SYNTHETIC', provider: 'SYNTHETIC_SEED' });
    expect(provenance.isVerified).toBe(false);
    expect(provenance.isActionable).toBe(false);
  });

  it('parses allowlists conservatively', () => {
    expect([...parseSourceAllowlist(undefined)]).toEqual([]);
    expect([...parseSourceAllowlist('')]).toEqual([]);
    expect([...parseSourceAllowlist('   ')]).toEqual([]);
    expect([...parseSourceAllowlist(' A , ,B ')].sort()).toEqual(['A', 'B']);
    expect([...parseSourceAllowlist('bad<script>,ok_provider')]).toEqual(['ok_provider']);
    expect([...parseSourceAllowlist('x'.repeat(200))]).toEqual([]);
  });

  it('uses a separate allowlist for fundamentals', () => {
    setQuoteAllowlist('NSE_LIVE_FEED');
    expect(isVerifiedSource('NSE_XBRL_FILINGS')).toBe(false);
    expect(isTrustedFundamentalSource('NSE_LIVE_FEED')).toBe(false);

    setFundamentalAllowlist('NSE_XBRL_FILINGS');
    expect(isVerifiedSource('NSE_XBRL_FILINGS')).toBe(true);
    expect(describeFundamentalProvenance('NSE_XBRL_FILINGS').isActionable).toBe(true);
    // The seeded demo fundamentals stay unverified under every configuration.
    expect(isVerifiedSource('SYNTHETIC_SEED — illustrative metrics; not verified')).toBe(false);
  });

  it('labels unverified fundamentals honestly', () => {
    setFundamentalAllowlist('NSE_XBRL_FILINGS');
    const provenance = describeFundamentalProvenance('SOME_OTHER_SOURCE');
    expect(provenance.isVerified).toBe(false);
    expect(provenance.isActionable).toBe(false);
    expect(provenance.label).toMatch(/not on the configured trusted-source list/i);
  });
});

describe('provider trust — synthetic fixtures stay non-actionable end to end', () => {
  beforeEach(() => {
    // Even with the fixture provider explicitly allowlisted, and even with an
    // otherwise plausible request, seeded data must not become actionable.
    setQuoteAllowlist('SYNTHETIC_SEED');
    setFundamentalAllowlist('SYNTHETIC_SEED — illustrative metrics; not verified');
  });

  it('produces no actionable observations from the seeded dataset', async () => {
    const scan = await marketIntelligenceAgent.runScan('MANUAL');
    expect(scan.observations.length).toBeGreaterThan(0);
    expect(scan.observations.every((o) => o.isActionable === false)).toBe(true);
  });

  it('never marks a generated proposal actionable', async () => {
    const proposal = await investmentStrategistAgent.evaluateAndPropose({
      portfolioId: 'port_virt_01',
      assetId: 'ast_reliance',
      action: 'BUY',
      horizon: 'LONG_TERM'
    });
    expect(proposal.isActionable).toBe(false);
  });
});
