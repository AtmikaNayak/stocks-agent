import { describe, it, expect } from 'vitest';
import { calculateIndianCharges } from '../src/lib/tax-calculator';

describe('Indian Tax & Statutory Charges Calculator', () => {
  it('calculates accurate CNC buy delivery charges', () => {
    // Buy 10 shares of Reliance at ₹3,000 = ₹30,000 turnover
    const result = calculateIndianCharges({
      side: 'BUY',
      quantity: 10,
      price: 3000,
      productType: 'CNC',
      slippagePct: 0.05
    });

    expect(result.turnover).toBeGreaterThanOrEqual(30000);
    // STT should be ~0.1% = ₹30
    expect(result.stt).toBeGreaterThanOrEqual(29);
    // Stamp duty ~0.015% on buy
    expect(result.stampDuty).toBeGreaterThan(0);
    // GST should be positive (18% on brokerage + turnover)
    expect(result.gst).toBeGreaterThan(0);
    expect(result.totalCharges).toBeGreaterThan(0);
    // For BUY, net amount should exceed turnover by totalCharges
    expect(result.netAmount).toBe(Math.round((result.turnover + result.totalCharges) * 100) / 100);
  });

  it('calculates accurate CNC sell delivery charges without stamp duty on sell', () => {
    const result = calculateIndianCharges({
      side: 'SELL',
      quantity: 5,
      price: 2000,
      productType: 'CNC'
    });

    // Stamp duty is 0 on sell
    expect(result.stampDuty).toBe(0);
    // STT is charged on delivery sell (0.1%)
    expect(result.stt).toBeGreaterThanOrEqual(9);
    // For SELL, net amount should be turnover minus totalCharges
    expect(result.netAmount).toBe(Math.round((result.turnover - result.totalCharges) * 100) / 100);
  });

  it('calculates intraday (MIS) charges with 0.025% STT on sell only', () => {
    const buyMis = calculateIndianCharges({
      side: 'BUY',
      quantity: 20,
      price: 1000,
      productType: 'MIS'
    });
    // STT is 0 on intraday buy
    expect(buyMis.stt).toBe(0);

    const sellMis = calculateIndianCharges({
      side: 'SELL',
      quantity: 20,
      price: 1020,
      productType: 'MIS'
    });
    // STT is 0.025% on intraday sell
    expect(sellMis.stt).toBeGreaterThan(0);
  });
});
