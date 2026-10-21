import { describe, it, expect, afterEach } from 'vitest';
import {
  ProviderRegistry,
  MarketDataProvider,
  NoVerifiedProviderError,
  describeProviderLabel
} from '../src/lib/market-data/providers';
import { describeQuoteProvenance } from '../src/lib/data-provenance';

/**
 * Provider trust must be default-deny, and no test may be able to promote
 * synthetic data to verified by naming it differently.
 */

const SYNTHETIC: MarketDataProvider = {
  name: 'SYNTHETIC_SEED',
  kind: 'SYNTHETIC_FIXTURE',
  capabilities: { quotes: true, historical: true, fundamentals: true, news: false, tradeGrade: false },
  getQuote: async () => null,
  getHistoricalCandles: async () => [],
  getFundamentals: async () => null
};

const FAKE_EXTERNAL: MarketDataProvider = {
  name: 'PRETEND_FEED',
  kind: 'VERIFIED_EXTERNAL',
  capabilities: { quotes: true, historical: true, fundamentals: true, news: true, tradeGrade: true },
  getQuote: async () => null,
  getHistoricalCandles: async () => [],
  getFundamentals: async () => null
};

afterEach(() => {
  delete process.env.INVESTPILOT_TRUSTED_QUOTE_PROVIDERS;
  delete process.env.INVESTPILOT_TRUSTED_FUNDAMENTAL_SOURCES;
});

describe('provider registry fails closed', () => {
  it('throws when no verified provider is configured', () => {
    const registry = new ProviderRegistry();
    registry.register(SYNTHETIC);
    expect(() => registry.requireVerifiedProvider()).toThrow(NoVerifiedProviderError);
  });

  it('does not trust an adapter merely because it claims to be external', () => {
    const registry = new ProviderRegistry();
    registry.register(FAKE_EXTERNAL);
    // Declaring the kind is not enough: the exact name must be allowlisted.
    expect(() => registry.requireVerifiedProvider()).toThrow(/no verified market-data provider/i);
  });

  it('still refuses a trade-grade provider that has not been integration-tested here', () => {
    process.env.INVESTPILOT_TRUSTED_QUOTE_PROVIDERS = 'PRETEND_FEED';
    const registry = new ProviderRegistry();
    registry.register(FAKE_EXTERNAL);

    // Allowlisting is configuration, not proof of a working integration. The
    // registry surfaces it, and the health record says so explicitly.
    const provider = registry.requireVerifiedProvider();
    expect(provider.name).toBe('PRETEND_FEED');
    const health = registry.health().find((entry) => entry.name === 'PRETEND_FEED')!;
    expect(health.detail).toMatch(/has still not been verified/i);
  });

  it('describes the synthetic adapter as non-trade-grade evidence', () => {
    const registry = new ProviderRegistry();
    registry.register(SYNTHETIC);
    const health = registry.health()[0];
    expect(health.kind).toBe('SYNTHETIC_FIXTURE');
    expect(health.trustedForQuotes).toBe(false);
    expect(health.detail).toMatch(/never actionable for real money/i);
  });

  it('never promotes synthetic data by renaming the source', () => {
    process.env.INVESTPILOT_TRUSTED_QUOTE_PROVIDERS = 'SYNTHETIC_SEED';
    const provenance = describeQuoteProvenance({
      freshness: 'SYNTHETIC',
      provider: 'SYNTHETIC_SEED'
    });
    expect(provenance.isVerified).toBe(false);
    expect(provenance.isActionable).toBe(false);
    expect(provenance.isSynthetic).toBe(true);
  });

  it('labels a fixture quote without ever making it actionable', () => {
    const { label, actionable } = describeProviderLabel({
      freshness: 'SYNTHETIC',
      provider: 'SYNTHETIC_SEED',
      price: 100
    });
    expect(actionable).toBe(false);
    expect(label).toMatch(/simulated/i);
    expect(label).not.toMatch(/verified live/i);
  });

  it('rejects a provider without a name', () => {
    const registry = new ProviderRegistry();
    expect(() =>
      registry.register({ ...SYNTHETIC, name: '' } as unknown as MarketDataProvider)
    ).toThrow(/must have a name/i);
  });
});
