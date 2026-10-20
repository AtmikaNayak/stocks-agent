import { describe, it, expect } from 'vitest';
import db from '../src/db';
import {
  describeFundamentalProvenance,
  describeQuoteProvenance,
  isActionableFreshness,
  isSyntheticSource,
  isVerifiedSource,
  validateQuote
} from '../src/lib/data-provenance';

describe('Data provenance — synthetic data is never actionable', () => {
  it('treats a synthetic quote as unverified and non-actionable', () => {
    const provenance = describeQuoteProvenance({ freshness: 'SYNTHETIC', provider: 'SYNTHETIC_SEED' });
    expect(provenance.isSynthetic).toBe(true);
    expect(provenance.isVerified).toBe(false);
    expect(provenance.isActionable).toBe(false);
    expect(provenance.label).toMatch(/simulated demo prices/i);
  });

  it('accepts only live, delayed or EOD freshness as actionable', () => {
    expect(isActionableFreshness('LIVE')).toBe(true);
    expect(isActionableFreshness('DELAYED_15M')).toBe(true);
    expect(isActionableFreshness('EOD')).toBe(true);
    expect(isActionableFreshness('HISTORICAL')).toBe(false);
    expect(isActionableFreshness('SYNTHETIC')).toBe(false);
    expect(isActionableFreshness('STALE')).toBe(false);
    expect(isActionableFreshness('WHATEVER')).toBe(false);
  });

  it('fails closed on unknown freshness', () => {
    const provenance = describeQuoteProvenance({ freshness: 'MYSTERY', provider: 'SOME_FEED' });
    expect(provenance.freshness).toBe('UNKNOWN');
    expect(provenance.isVerified).toBe(false);
    expect(provenance.isActionable).toBe(false);
    expect(provenance.label).toMatch(/unknown data quality/i);
  });

  it('never calls a stale quote actionable even from a real provider', () => {
    const provenance = describeQuoteProvenance({ freshness: 'STALE', provider: 'NSE_EOD' });
    expect(provenance.isActionable).toBe(false);
    expect(provenance.label).toMatch(/stale/i);
  });

  it('recognises synthetic language in provider strings', () => {
    expect(isSyntheticSource('SYNTHETIC_SEED')).toBe(true);
    expect(isSyntheticSource('demo fixture')).toBe(true);
    expect(isSyntheticSource('illustrative metrics; not verified')).toBe(true);
    expect(isSyntheticSource('NSE_EOD')).toBe(false);
    expect(isSyntheticSource(null)).toBe(false);
  });

  it('treats "not verified" fundamentals sources as unverified', () => {
    expect(isVerifiedSource('SYNTHETIC_SEED — illustrative metrics; not verified')).toBe(false);
    expect(isVerifiedSource('')).toBe(false);
    expect(isVerifiedSource(null)).toBe(false);
    expect(isVerifiedSource('NSE_XBRL_FILINGS')).toBe(true);

    const provenance = describeFundamentalProvenance('SYNTHETIC_SEED — illustrative metrics; not verified');
    expect(provenance.isVerified).toBe(false);
    expect(provenance.label).toMatch(/illustrative demo fundamentals/i);
  });

  it('rejects malformed quotes outright', () => {
    expect(validateQuote(null).ok).toBe(false);
    expect(validateQuote({ price: 0, symbol: 'X', freshness: 'LIVE' }).reasons).toContain(
      'price is missing or non-positive'
    );
    expect(validateQuote({ price: 100, symbol: 'X', freshness: 'SYNTHETIC', open: -1 }).ok).toBe(false);
    expect(
      validateQuote({ price: 100, symbol: 'X', freshness: 'BOGUS' as any }).reasons
    ).toContain('freshness flag is unknown');
    expect(validateQuote({ price: 100, symbol: 'X', freshness: 'SYNTHETIC' }).ok).toBe(true);
  });

  it('matches the seeded demo database exactly (all shipped prices are synthetic)', () => {
    const rows = db.query<{ provider: string; freshness_status: string }>(
      'SELECT DISTINCT provider, freshness_status FROM market_data_points'
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const provenance = describeQuoteProvenance({
        freshness: row.freshness_status,
        provider: row.provider
      });
      expect(provenance.isSynthetic).toBe(true);
      expect(provenance.isActionable).toBe(false);
    }
  });
});
