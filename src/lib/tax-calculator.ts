import { IndianChargesBreakdown, OrderSide, ProductType } from './types';
import { ValidationError } from './validation';

/**
 * Deterministic Indian equity transaction-cost and slippage calculator.
 *
 * IMPORTANT — what these numbers are:
 *   These are illustrative statutory rates applied to a *simulated* fill. They
 *   are not a bill, not a broker contract note and not tax advice. The rates
 *   below match the commonly published retail discount-broker schedule
 *   (delivery STT 0.1% both sides, intraday STT 0.025% on sell, NSE turnover
 *   0.00345%, SEBI ₹10/crore, stamp duty 0.015% delivery / 0.003% intraday on
 *   buy, GST 18% on brokerage + exchange + SEBI). No rate here has been
 *   verified against a live broker's contract note in this build.
 *
 * Sign conventions (used by the execution agent and the ledger):
 *   turnover      = quantity × effectivePrice      (always positive)
 *   totalCharges  = sum of every component          (always positive)
 *   netAmount     = turnover + totalCharges  on BUY  → cash required
 *                 = turnover − totalCharges  on SELL → cash received
 *
 * Slippage is applied to the price *before* turnover is computed, so the
 * turnover in the execution record is the amount actually simulated, never the
 * raw quote price. `effectivePrice` is returned so callers can record it.
 */

const ROUNDING = 100; // paise
const round2 = (value: number) => Math.round(value * ROUNDING) / ROUNDING;

export function calculateIndianCharges(params: {
  side: OrderSide;
  quantity: number;
  price: number;
  productType?: ProductType;
  slippagePct?: number;
  brokeragePerOrder?: number;
}): IndianChargesBreakdown {
  const {
    side,
    quantity,
    price,
    productType = 'CNC',
    slippagePct = 0.05,
    brokeragePerOrder = 20.0
  } = params;

  // Reject bad inputs instead of producing a plausible-looking number.
  if (side !== 'BUY' && side !== 'SELL') {
    throw new ValidationError('side must be BUY or SELL.');
  }
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new ValidationError('quantity must be a positive whole number of shares.');
  }
  if (!Number.isFinite(price) || price <= 0) {
    throw new ValidationError('price must be a finite number greater than zero.');
  }
  if (productType !== 'CNC' && productType !== 'MIS') {
    throw new ValidationError('productType must be CNC or MIS.');
  }
  if (!Number.isFinite(slippagePct) || slippagePct < 0 || slippagePct > 100) {
    throw new ValidationError('slippagePct must be a finite number between 0 and 100.');
  }
  if (!Number.isFinite(brokeragePerOrder) || brokeragePerOrder < 0) {
    throw new ValidationError('brokeragePerOrder must be a finite, non-negative number.');
  }

  // Buying fills slightly above the quote, selling slightly below.
  const effectivePrice =
    side === 'BUY' ? price * (1 + slippagePct / 100) : price * (1 - slippagePct / 100);

  if (!Number.isFinite(effectivePrice) || effectivePrice <= 0) {
    throw new ValidationError('slippage produced a non-positive fill price.');
  }

  const turnover = round2(quantity * effectivePrice);
  const slippageAmount = round2(Math.abs(effectivePrice - price) * quantity);

  // 1. Brokerage: flat ₹20 or 0.03%, whichever is lower.
  const brokerage = Math.min(
    round2(brokeragePerOrder),
    round2(turnover * 0.0003)
  );

  // 2. STT — delivery 0.1% both sides; intraday 0.025% on sell only.
  let stt = 0;
  if (productType === 'CNC') {
    stt = Math.round(turnover * 0.001);
  } else if (productType === 'MIS' && side === 'SELL') {
    stt = Math.round(turnover * 0.00025);
  }

  // 3. Exchange turnover charges (NSE 0.00345%).
  const exchangeTurnoverCharges = round2(turnover * 0.0000345);

  // 4. SEBI turnover charges (₹10 per crore = 0.0001%).
  const sebiTurnoverCharges = round2(turnover * 0.000001);

  // 5. Stamp duty — buy side only.
  let stampDuty = 0;
  if (side === 'BUY') {
    stampDuty = round2(turnover * (productType === 'CNC' ? 0.00015 : 0.00003));
  }

  // 6. GST 18% on brokerage + exchange + SEBI.
  const gst = round2((brokerage + exchangeTurnoverCharges + sebiTurnoverCharges) * 0.18);

  const totalCharges = round2(
    brokerage + stt + exchangeTurnoverCharges + sebiTurnoverCharges + stampDuty + gst
  );

  const netAmount =
    side === 'BUY' ? round2(turnover + totalCharges) : round2(turnover - totalCharges);

  if (!Number.isFinite(netAmount) || netAmount <= 0) {
    throw new ValidationError('Calculated net amount is invalid for this order.');
  }

  return {
    turnover,
    effectivePrice: round2(effectivePrice),
    brokerage,
    stt,
    exchangeTurnoverCharges,
    sebiTurnoverCharges,
    stampDuty,
    gst,
    totalCharges,
    effectiveSlippage: slippageAmount,
    netAmount
  };
}
