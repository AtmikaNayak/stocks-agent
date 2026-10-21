import { DataFreshness, MarketQuote } from '../types';
import { describeQuoteProvenance, isKnownFreshness, Provenance } from '../data-provenance';

/**
 * Structural validation for a market quote before it may be used to price a
 * simulated trade.
 *
 * Design rule: quarantine, never repair. An invalid quote is rejected with a
 * reason; nothing is clamped, filled in from the previous close, or rounded
 * into a plausible value. A synthetic fixture stays usable for the paper
 * simulator but is never described as verified exchange data.
 */

/** Quotes older than this are treated as stale for pricing purposes. */
export const MAX_QUOTE_AGE_MS = 5 * 24 * 60 * 60 * 1000;

/** Tolerance for OHLC float comparisons (one paisa). */
const PRICE_TOLERANCE = 0.01;

export interface QuoteValidation {
  ok: boolean;
  reasons: string[];
  provenance: Provenance;
  /** True when the quote may be used by the paper simulator. */
  usableForSimulation: boolean;
}

export function validateQuoteForExecution(
  quote: Partial<MarketQuote> | null | undefined,
  options: { now?: Date; maxAgeMs?: number } = {}
): QuoteValidation {
  const now = options.now ?? new Date();
  const maxAgeMs = options.maxAgeMs ?? MAX_QUOTE_AGE_MS;

  if (!quote) {
    return {
      ok: false,
      reasons: ['No market quote is available for this symbol.'],
      provenance: describeQuoteProvenance({}),
      usableForSimulation: false
    };
  }

  const reasons: string[] = [];

  if (typeof quote.symbol !== 'string' || quote.symbol.trim() === '') {
    reasons.push('symbol is missing');
  }

  const price = Number(quote.price);
  if (!Number.isFinite(price) || price <= 0) reasons.push('price is missing or non-positive');

  const ohlc: Array<[string, unknown]> = [
    ['open', quote.open],
    ['high', quote.high],
    ['low', quote.low],
    ['close', quote.close]
  ];
  for (const [field, value] of ohlc) {
    const n = Number(value);
    if (value !== undefined && (!Number.isFinite(n) || n <= 0)) {
      reasons.push(`${field} is missing or non-positive`);
    }
  }

  if (quote.volume !== undefined) {
    const volume = Number(quote.volume);
    if (!Number.isFinite(volume) || volume < 0) reasons.push('volume is invalid');
  }

  // OHLC relationships. Newer data is never silently corrected.
  const high = Number(quote.high);
  const low = Number(quote.low);
  const open = Number(quote.open);
  const close = Number(quote.close);
  if (Number.isFinite(high) && Number.isFinite(low) && high + PRICE_TOLERANCE < low) {
    reasons.push('high is below low');
  }
  if (
    Number.isFinite(high) &&
    Number.isFinite(open) &&
    Number.isFinite(close) &&
    high + PRICE_TOLERANCE < Math.max(open, close)
  ) {
    reasons.push('high is below the open or close');
  }
  if (
    Number.isFinite(low) &&
    Number.isFinite(open) &&
    Number.isFinite(close) &&
    low - PRICE_TOLERANCE > Math.min(open, close)
  ) {
    reasons.push('low is above the open or close');
  }

  const freshnessValid = isKnownFreshness(quote.freshness);
  if (!freshnessValid) reasons.push('freshness flag is unknown');

  const provenance = describeQuoteProvenance({
    freshness: quote.freshness as DataFreshness | string | undefined,
    provider: quote.provider
  });

  if (quote.freshness === 'STALE') reasons.push('quote is flagged STALE');
  if (quote.freshness === 'HISTORICAL') {
    reasons.push('quote is historical reference data and cannot price a new simulated trade');
  }

  // Age check. A synthetic fixture is fabricated rather than dated to a real
  // session, so it is exempt from the age rule but still labelled synthetic.
  if (quote.timestamp) {
    const parsed = Date.parse(`${quote.timestamp}T00:00:00Z`);
    if (!Number.isFinite(parsed)) {
      reasons.push('quote timestamp cannot be parsed');
    } else {
      const ageMs = now.getTime() - parsed;
      if (ageMs < -5 * 60 * 1000) reasons.push('quote is dated in the future');
      if (provenance.isSynthetic !== true && ageMs > maxAgeMs) {
        reasons.push('quote is older than the maximum accepted age');
      }
    }
  }

  const ok = reasons.length === 0;
  return { ok, reasons, provenance, usableForSimulation: ok };
}
