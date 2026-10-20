import { describe, it, expect } from 'vitest';
import {
  ValidationError,
  requireEnum,
  requireFiniteNumber,
  requireNonEmptyString,
  requirePositiveInteger,
  requireStringArray
} from '../src/lib/validation';

describe('Validation helpers fail closed', () => {
  it('rejects empty and non-string identifiers', () => {
    expect(() => requireNonEmptyString('', 'portfolioId')).toThrow(ValidationError);
    expect(() => requireNonEmptyString('   ', 'portfolioId')).toThrow(/portfolioId/);
    expect(() => requireNonEmptyString(42, 'portfolioId')).toThrow(/portfolioId/);
    expect(requireNonEmptyString('  port_virt_01  ', 'portfolioId')).toBe('port_virt_01');
  });

  it('rejects NaN, Infinity and out-of-range numbers', () => {
    expect(() => requireFiniteNumber(Number.NaN, 'capital')).toThrow(/finite/);
    expect(() => requireFiniteNumber(Number.POSITIVE_INFINITY, 'capital')).toThrow(/finite/);
    expect(() => requireFiniteNumber(-5, 'capital', { min: 0 })).toThrow(/at least 0/);
    expect(() => requireFiniteNumber(0, 'capital', { min: 0, exclusiveMin: true })).toThrow(
      /greater than 0/
    );
    expect(() => requireFiniteNumber(101, 'slippage', { min: 0, max: 100 })).toThrow(/at most 100/);
    expect(requireFiniteNumber('12.5', 'x')).toBe(12.5);
  });

  it('requires whole positive quantities', () => {
    expect(() => requirePositiveInteger(0, 'quantity')).toThrow(/positive whole number/);
    expect(() => requirePositiveInteger(1.5, 'quantity')).toThrow(/positive whole number/);
    expect(requirePositiveInteger(3, 'quantity')).toBe(3);
  });

  it('enforces enum membership', () => {
    expect(() => requireEnum('HOLD', 'action', ['BUY', 'SELL'] as const)).toThrow(/action must be one of/);
    expect(requireEnum('BUY', 'action', ['BUY', 'SELL'] as const)).toBe('BUY');
  });

  it('normalises and validates symbol arrays', () => {
    expect(requireStringArray(['reliance', ' tcs '], 'assetSymbols')).toEqual(['RELIANCE', 'TCS']);
    expect(() => requireStringArray([], 'assetSymbols')).toThrow(/non-empty array/);
    expect(() => requireStringArray([''], 'assetSymbols')).toThrow(/assetSymbols\[0\]/);
    expect(() => requireStringArray('RELIANCE', 'assetSymbols')).toThrow(/non-empty array/);
  });
});
