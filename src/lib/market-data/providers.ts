import type { AssetFundamental, MarketQuote } from '../types';
import {
  describeQuoteProvenance,
  getTrustedFundamentalSources,
  getTrustedQuoteProviders
} from '../data-provenance';

/**
 * Market-data provider abstraction.
 *
 * This build ships exactly ONE provider: the synthetic demo fixture store. There
 * is no NSE/BSE adapter, no licensed feed and no credentials. That is stated
 * here in code because the type system cannot express "not implemented".
 *
 * Trust model (default deny):
 *  - Registering a provider does not make it trusted. A provider is trusted only
 *    when its exact name appears in INVESTPILOT_TRUSTED_QUOTE_PROVIDERS (quotes)
 *    or INVESTPILOT_TRUSTED_FUNDAMENTAL_SOURCES (fundamentals).
 *  - `requireVerifiedProvider()` is the fail-closed entry point for any workflow
 *    that would need genuinely trustworthy data. With the shipped configuration
 *    it always throws, which is the correct behaviour today.
 *  - A provider's `kind` is declared by the adapter itself and is used only for
 *    labelling and validation. It can never be used to grant trust — otherwise
 *    editing a string would promote synthetic data to verified.
 */

export type ProviderKind = 'SYNTHETIC_FIXTURE' | 'VERIFIED_EXTERNAL';

export interface ProviderCapabilities {
  quotes: boolean;
  historical: boolean;
  fundamentals: boolean;
  news: boolean;
  /** True only when the adapter can be relied on for real-money decisions. */
  tradeGrade: boolean;
}

export interface ProviderHealth {
  name: string;
  kind: ProviderKind;
  capabilities: ProviderCapabilities;
  /** True when the provider's exact name is on the configured allowlist. */
  trustedForQuotes: boolean;
  trustedForFundamentals: boolean;
  /** Short, non-secret description safe to render in the UI. */
  status: 'AVAILABLE' | 'NOT_CONFIGURED' | 'DEGRADED';
  detail: string;
}

export interface MarketDataProvider {
  readonly name: string;
  readonly kind: ProviderKind;
  readonly capabilities: ProviderCapabilities;
  getQuote(symbol: string): Promise<MarketQuote | null>;
  getHistoricalCandles(symbol: string, limit?: number): Promise<unknown[]>;
  getFundamentals(symbol: string): Promise<AssetFundamental | null>;
}

export class NoVerifiedProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NoVerifiedProviderError';
  }
}

/**
 * Registry of adapters. The synthetic adapter is always present; a verified
 * adapter can only be added by code that actually implements one.
 */
export class ProviderRegistry {
  private providers = new Map<string, MarketDataProvider>();

  register(provider: MarketDataProvider): void {
    if (!provider?.name) throw new Error('A provider must have a name.');
    this.providers.set(provider.name, provider);
  }

  get(name: string): MarketDataProvider | null {
    return this.providers.get(name) ?? null;
  }

  list(): MarketDataProvider[] {
    return [...this.providers.values()];
  }

  /** Providers whose kind claims external verification. Empty in this build. */
  verifiedCandidates(): MarketDataProvider[] {
    return this.list().filter((provider) => provider.kind === 'VERIFIED_EXTERNAL');
  }

  /**
   * Returns a provider that is both trade-grade and trusted by configuration.
   * Throws when none exists — callers that need real data must fail closed.
   */
  requireVerifiedProvider(): MarketDataProvider {
    const candidate = this.verifiedCandidates().find(
      (provider) =>
        provider.capabilities.tradeGrade &&
        getTrustedQuoteProviders().has(provider.name) &&
        provider.name.trim() !== ''
    );
    if (!candidate) {
      throw new NoVerifiedProviderError(
        'No verified market-data provider is configured. This build ships synthetic demo fixtures only; a licensed feed adapter and credentials are required.'
      );
    }
    return candidate;
  }

  health(): ProviderHealth[] {
    const quoteAllowlist = getTrustedQuoteProviders();
    const fundamentalAllowlist = getTrustedFundamentalSources();

    return this.list().map((provider) => {
      const trustedForQuotes = quoteAllowlist.has(provider.name);
      const trustedForFundamentals = fundamentalAllowlist.has(provider.name);

      if (provider.kind !== 'VERIFIED_EXTERNAL') {
        return {
          name: provider.name,
          kind: provider.kind,
          capabilities: provider.capabilities,
          trustedForQuotes,
          trustedForFundamentals,
          status: 'AVAILABLE' as const,
          detail:
            'Simulated fixtures for the paper-trading simulator. Never exchange data, and never actionable for real money.'
        };
      }

      return {
        name: provider.name,
        kind: provider.kind,
        capabilities: provider.capabilities,
        trustedForQuotes,
        trustedForFundamentals,
        status: trustedForQuotes ? ('AVAILABLE' as const) : ('NOT_CONFIGURED' as const),
        detail: trustedForQuotes
          ? 'Listed on the trusted-provider allowlist. Integration has still not been verified in this build.'
          : 'Configured adapter is not on the trusted-provider allowlist; its data is treated as unverified.'
      };
    });
  }
}

/**
 * Labels a quote for display without changing what it is. Never "upgrades" a
 * synthetic quote, and never returns a synthetic price as actionable.
 */
export function describeProviderLabel(quote: Pick<MarketQuote, 'freshness' | 'provider' | 'price'>): {
  label: string;
  actionable: boolean;
} {
  const provenance = describeQuoteProvenance({
    freshness: quote.freshness,
    provider: quote.provider
  });
  return { label: provenance.label, actionable: provenance.isActionable };
}

/**
 * The only adapter that exists in this build: the seeded synthetic fixture
 * store. Registered so the UI can show an honest provider inventory, and
 * explicitly NOT trade-grade.
 */
export const syntheticFixtureProvider: MarketDataProvider = {
  name: 'SYNTHETIC_SEED',
  kind: 'SYNTHETIC_FIXTURE',
  capabilities: { quotes: true, historical: true, fundamentals: true, news: false, tradeGrade: false },
  async getQuote(symbol) {
    const { default: marketData } = await import('./index');
    return marketData.getQuote(symbol);
  },
  async getHistoricalCandles(symbol, limit) {
    const { default: marketData } = await import('./index');
    return marketData.getHistoricalCandles(symbol, limit);
  },
  async getFundamentals(symbol) {
    const { default: marketData } = await import('./index');
    return marketData.getFundamentals(symbol);
  }
};

export const providerRegistry = new ProviderRegistry();
providerRegistry.register(syntheticFixtureProvider);
