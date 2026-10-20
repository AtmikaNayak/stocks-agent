import { DataFreshness, MarketQuote } from './types';

/**
 * Data-provenance rules.
 *
 * The single rule this module enforces: data is only "verified" or
 * "actionable" when its freshness and source actually say so. Everything else
 * — including the synthetic demo fixtures this build ships with — is
 * explicitly labelled as illustrative and non-actionable.
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

const SYNTHETIC_SOURCE_PATTERN = /(synthetic|demo|fixture|illustrat|seed|mock|placeholder|not\s*verified)/i;

export interface Provenance {
  /** Raw freshness flag carried by the data point. */
  freshness: DataFreshness | 'UNKNOWN';
  /** Raw provider/source string, when one exists. */
  provider: string | null;
  /** True when the values are simulated fixtures rather than exchange records. */
  isSynthetic: boolean;
  /** True when the source is a real, verified market-data provider. */
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
 * A fundamentals source counts as verified only when it is present and does not
 * describe itself as synthetic/demo/illustrative ("not verified" included).
 */
export function isVerifiedSource(source: string | null | undefined): boolean {
  if (typeof source !== 'string' || source.trim() === '') return false;
  return !SYNTHETIC_SOURCE_PATTERN.test(source);
}

export function describeQuoteProvenance(input: {
  freshness?: DataFreshness | string | null;
  provider?: string | null;
}): Provenance {
  const freshness = isKnownFreshness(input.freshness) ? input.freshness : 'UNKNOWN';
  const provider = input.provider ?? null;
  const isSynthetic = freshness === 'SYNTHETIC' || isSyntheticSource(provider);
  const knownFreshness = isKnownFreshness(freshness) ? freshness : null;
  const isVerified =
    knownFreshness !== null &&
    ACTIONABLE_FRESHNESS.includes(knownFreshness) &&
    !isSynthetic &&
    !isSyntheticSource(provider);
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
    label = `Verified ${freshness.replace('_', ' ').toLowerCase()} prices from ${provider || 'market feed'}`;
  } else {
    label = `Unverified prices (${freshness}) — do not act on these`;
  }

  return { freshness, provider, isSynthetic, isVerified, isActionable, label };
}

export function describeFundamentalProvenance(source: string | null | undefined): Provenance {
  const isVerified = isVerifiedSource(source);
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
