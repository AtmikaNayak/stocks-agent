import { describe, it, expect } from 'vitest';
import { formatINR, formatINRShort, formatPct, greeting, moveLabel, toNumber, toneFor } from '../src/lib/format';

describe('Money formatting helpers', () => {
  it('formats whole rupees without noisy paise', () => {
    expect(formatINR(25000)).toBe('₹25,000');
    expect(formatINR(0)).toBe('₹0');
  });

  it('keeps two decimals when an amount has paise', () => {
    expect(formatINR(2942.5, { decimals: 2 })).toBe('₹2,942.50');
  });

  it('uses the Indian minus sign and never double-signs', () => {
    expect(formatINR(-1500)).toBe('−₹1,500');
    expect(formatINR(1500, { sign: true })).toBe('+₹1,500');
    expect(formatINR(0, { sign: true })).toBe('₹0');
  });

  it('shortens large amounts in lakh and crore', () => {
    expect(formatINRShort(125000)).toBe('₹1.25 L');
    expect(formatINRShort(34000000)).toBe('₹3.40 Cr');
    expect(formatINRShort(25000)).toBe('₹25,000');
  });

  it('formats percentages with an explicit sign', () => {
    expect(formatPct(4.236)).toBe('+4.24%');
    expect(formatPct(-1.5)).toBe('−1.50%');
    expect(formatPct(0)).toBe('0.00%');
  });
});

describe('Tone and guard helpers', () => {
  it('classifies money movement into up, down and flat', () => {
    expect(toneFor(10)).toBe('up');
    expect(toneFor(-0.01)).toBe('down');
    expect(toneFor(0)).toBe('flat');
  });

  it('treats bad numeric input as zero instead of NaN', () => {
    expect(toNumber(undefined)).toBe(0);
    expect(toNumber('not-a-number')).toBe(0);
    expect(toNumber('42')).toBe(42);
  });

  it('describes a daily move in plain words', () => {
    expect(moveLabel(1.234)).toBe('up 1.23% today');
    expect(moveLabel(-2)).toBe('down 2.00% today');
    expect(moveLabel(0)).toBe('unchanged today');
  });

  it('greets consistently in Indian market time', () => {
    const istMorning = new Date('2026-10-20T03:00:00.000Z'); // 08:30 IST
    const istEvening = new Date('2026-10-20T15:00:00.000Z'); // 20:30 IST
    expect(greeting(istMorning)).toBe('Good morning');
    expect(greeting(istEvening)).toBe('Good evening');
  });
});
