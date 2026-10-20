import { DataFreshness, MarketQuote } from './types';

/**
 * Data-provenance rules.
 *
 * Two independent conditions must both hold before data may be treated as
 * verified/actionable:
 *
 *   1. The freshness flag must be an explicitly tradable value
 *      (LIVE / DELAYED_15M / EOD) — not SYNTHETIC, STALE, HISTORICAL or unknown.
 *   2. The provider/source string must be an **exact** match for an entry in an
 *      operator-configured allowlist:
 *        INVESTPILOT_TRUSTED_QUOTE_PROVIDERS
 *        INVESTPILOT_TRUSTED_FUNDAMENTAL_SOURCES
 *
 * Nothing else is trusted. An unknown, unconfigured, mistyped or lookalike
 * source is unverified and non-actionable by default. Trust is never inferred
 * from a source string merely *not* containing words like "demo" or
 * "synthetic" — those words are only used to make labels clearer.
 *
 * Both allowlists are empty unless configured, so this build trusts no
 * provider at all by default. That is intentional: the repository ships
 * synthetic demo fixtures and no real exchange feed.
 */

/** Freshness values that can be treated as trusted market observations. */
export const ACTIONABLE_FRESHNESS: readonly DataFreshness[] = ['LIVE', 'DELAYED_15M', 'EOD'];

const KNOWN_FRESHNESS: readonly DataFreshness[] = [
  'LIVE',
  'DELAYED_15M',
  'EOD',
  'HISTORICAL',
  'SYNTHETIC',
  'STALE'
];

/** Used only to pick a clearer human-readable label — never to grant trust. */
const SYNTHETIC_SOURCE_PATTERN = /(synthetic|demo|fixture|illustrat|seed|mock|placeholder|not\s*verified)/i;

/** Conservative shape for a configured allowlist entry. */
const ALLOWLIST_ENTRY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._:+-]{0,63}$/;

const EMPTY_ALLOWLIST: ReadonlySet<string> = new Set<string>();

export const TRUSTED_QUOTE_PROVIDERS_ENV = 'INVESTPILOT_TRUSTED_QUOTE_PROVIDERS';
export const TRUSTED_FUNDAMENTAL_SOURCES_ENV = 'INVESTPILOT_TRUSTED_FUNDAMENTAL_SOURCES';

/**
 * Parses a comma-separated allowlist conservatively:
 *  - entries are trimmed, empty entries are dropped;
 *  - entries that are too long or contain unusual characters are dropped;
 *  - matching is exact and case-sensitive (no substring, glob or fuzzy match).
 */
export function parseSourceAllowlist(raw: string | undefined | null): ReadonlySet<string> {
  if (typeof raw !== 'string' || raw.trim() === '') return EMPTY_ALLOWLIST;

  const allowed = new Set<string>();
  for (const entry of raw.split(',')) {
    const token = entry.trim();
    if (token === '') continue;
    if (!ALLOWLIST_ENTRY_PATTERN.test(token)) continue;
    allowed.add(token);
  }
  return allowed;
}

const allowlistCache = new Map<string, ReadonlySet<string>>();

function allowlistFromEnv(envName: string): ReadonlySet<string> {
  const raw = process.env[envName] ?? '';
  const cacheKey = `${envName}\u0000${raw}`;
  const cached = allowlistCache.get(cacheKey);
  if (cached) return cached;

  const parsed = parseSourceAllowlist(raw);
  if (allowlistCache.size > 32) allowlistCache.clear();
  allowlistCache.set(cacheKey, parsed);
  return parsed;
}

export function getTrustedQuoteProviders(): ReadonlySet<string> {
  return allowlistFromEnv(TRUSTED_QUOTE_PROVIDERS_ENV);
}

export function getTrustedFundamentalSources(): ReadonlySet<string> {
  return allowlistFromEnv(TRUSTED_FUNDAMENTAL_SOURCES_ENV);
}

/** True only for an exact, configured quote-provider match. */
export function isTrustedQuoteProvider(source: string | null | undefined): boolean {
  if (typeof source !== 'string') return false;
  const token = source.trim();
  if (token === '') return false;
  return getTrustedQuoteProviders().has(token);
}

/** True only for an exact, configured fundamentals-source match. */
export function isTrustedFundamentalSource(source: string | null | undefined): boolean {
  if (typeof source !== 'string') return false;
  const token = source.trim();
  if (token === '') return false;
  return getTrustedFundamentalSources().has(token);
}

export interface Provenance {
  /** Raw freshness flag carried by the data point. */
  freshness: DataFreshness | 'UNKNOWN';
  /** Raw provider/source string, when one exists. */
  provider: string | null;
  /** True when the values are simulated fixtures rather than exchange records. */
  isSynthetic: boolean;
  /** True when the source is an explicitly configured, trusted provider. */
  isVerified: boolean;
  /** True only for verified data that is recent enough to trade on. */
  isActionable: boolean;
  /** Human-readable description safe to show in the UI or an AI answer. */
  label: string;
}

export function isKnownFreshness(value: unknown): value is DataFreshness {
  return typeof value === 'string' && (KNOWN_FRESHNESS as readonly string[]).includes(value);
}

export function isActionableFreshness(value: unknown): boolean {
  return isKnownFreshness(value) && ACTIONABLE_FRESHNESS.includes(value);
}

export function isSyntheticSource(source: string | null | undefined): boolean {
  if (!source) return false;
  return SYNTHETIC_SOURCE_PATTERN.test(source);
}

/**
 * Fundamentals count as verified only when the source is an exact match for an
 * operator-configured entry in INVESTPILOT_TRUSTED_FUNDAMENTAL_SOURCES.
 */
export function isVerifiedSource(source: string | null | undefined): boolean {
  return isTrustedFundamentalSource(source);
}

export function describeQuoteProvenance(input: {
  freshness?: DataFreshness | string | null;
  provider?: string | null;
}): Provenance {
  const freshness = isKnownFreshness(input.freshness) ? input.freshness : 'UNKNOWN';
  const provider = input.provider ?? null;
  const providerTrusted = isTrustedQuoteProvider(provider);
  const isSynthetic = freshness === 'SYNTHETIC' || isSyntheticSource(provider);
  const knownFreshness = isKnownFreshness(freshness) ? freshness : null;
  const isVerified =
    knownFreshness !== null &&
    ACTIONABLE_FRESHNESS.includes(knownFreshness) &&
    !isSynthetic &&
    providerTrusted;
  const isActionable = isVerified && isActionableFreshness(knownFreshness);

  let label: string;
  if (freshness === 'UNKNOWN') {
    label = 'Unknown data quality — treat as unusable';
  } else if (isSynthetic) {
    label = `Simulated demo prices (${provider || 'synthetic fixture'}) — not exchange data`;
  } else if (freshness === 'STALE') {
    label = 'Stale prices — refresh required before acting';
  } else if (freshness === 'HISTORICAL') {
    label = 'Historical prices — reference only, not tradable now';
  } else if (isActionable) {
    label = `Verified ${freshness.replace('_', ' ').toLowerCase()} prices from ${provider}`;
  } else if (!provider) {
    label = 'Unverified prices — no data provider is recorded, so this cannot be trusted';
  } else {
    label = `Unverified prices from ${provider} — source is not on the configured trusted-provider list`;
  }

  return { freshness, provider, isSynthetic, isVerified, isActionable, label };
}

export function describeFundamentalProvenance(source: string | null | undefined): Provenance {
  const isVerified = isTrustedFundamentalSource(source);
  const isSynthetic = isSyntheticSource(source);
  return {
    freshness: isVerified ? 'EOD' : 'UNKNOWN',
    provider: source ?? null,
    isSynthetic,
    isVerified,
    isActionable: isVerified,
    label: isVerified
      ? `Reported fundamentals from ${source}`
      : isSynthetic
        ? 'Illustrative demo fundamentals — not audited or exchange-verified'
        : source
          ? `Fundamentals from ${source} are not on the configured trusted-source list — do not rely on these`
          : 'Fundamentals of unknown provenance — do not rely on these'
  };
}

/**
 * Structural validation for a quote before an agent is allowed to reason about
 * it. Unknown freshness fails closed.
 */
export function validateQuote(quote: Partial<MarketQuote> | null | undefined): {
  ok: boolean;
  reasons: string[];
  provenance: Provenance | null;
} {
  if (!quote) {
    return { ok: false, reasons: ['No quote available'], provenance: null };
  }

  const reasons: string[] = [];
  const price = Number(quote.price);
  if (!Number.isFinite(price) || price <= 0) reasons.push('price is missing or non-positive');

  for (const field of ['open', 'high', 'low', 'close'] as const) {
    const value = Number(quote[field]);
    if (quote[field] !== undefined && (!Number.isFinite(value) || value <= 0)) {
      reasons.push(`${field} is missing or non-positive`);
    }
  }

  if (quote.volume !== undefined) {
    const volume = Number(quote.volume);
    if (!Number.isFinite(volume) || volume < 0) reasons.push('volume is invalid');
  }

  if (!isKnownFreshness(quote.freshness)) reasons.push('freshness flag is unknown');

  if (!quote.symbol || typeof quote.symbol !== 'string') reasons.push('symbol is missing');

  const provenance = describeQuoteProvenance({
    freshness: quote.freshness as string | undefined,
    provider: quote.provider
  });

  return { ok: reasons.length === 0, reasons, provenance };
}

/**
 * Formats a fundamental value, saying so when it is genuinely unavailable
 * instead of substituting a plausible-looking number.
 */
export function formatMetric(
  value: number | null | undefined,
  suffix = '',
  adjectives: { prefix?: string } = {}
): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return 'not available in this dataset';
  }
  return `${adjectives.prefix ?? ''}${Number(value)}${suffix}`;
}
