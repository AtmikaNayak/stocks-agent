import { IndianChargesBreakdown, OrderSide, ProductType } from './types';

/**
 * Deterministic Indian Equity Transaction Cost & Slippage Calculator
 * Conforms to SEBI, NSE, and Ministry of Finance statutory mandates.
 */
export function calculateIndianCharges(params: {
  side: OrderSide;
  quantity: number;
  price: number;
  productType?: ProductType; // CNC (Delivery) or MIS (Intraday)
  slippagePct?: number; // e.g. 0.05%
  brokeragePerOrder?: number; // e.g. ₹20 flat or 0.03%
}): IndianChargesBreakdown {
  const {
    side,
    quantity,
    price,
    productType = 'CNC',
    slippagePct = 0.05,
    brokeragePerOrder = 20.0
  } = params;

  // Base turnover
  const baseTurnover = quantity * price;

  // Slippage impact:
  // Buying might execute slightly higher than quote; Selling slightly lower.
  const slippageAmount = baseTurnover * (slippagePct / 100);
  const effectivePrice = side === 'BUY'
    ? price + (price * (slippagePct / 100))
    : price - (price * (slippagePct / 100));

  const turnover = quantity * effectivePrice;

  // 1. Brokerage: flat ₹20 or 0.03% whichever is lower (0 for delivery on discount brokers or ₹20 default)
  // We use conservative standard ₹20 or 0.03% min(20, turnover * 0.0003)
  const brokerage = Math.min(brokeragePerOrder, Math.round(turnover * 0.0003 * 100) / 100);

  // 2. STT (Securities Transaction Tax)
  // Delivery (CNC): 0.1% on buy and 0.1% on sell
  // Intraday (MIS): 0.025% on sell only
  let stt = 0;
  if (productType === 'CNC') {
    stt = Math.round(turnover * 0.001); // 0.1% rounded to nearest rupee per SEBI rules
  } else if (productType === 'MIS' && side === 'SELL') {
    stt = Math.round(turnover * 0.00025); // 0.025%
  }

  // 3. Exchange Turnover Charges (NSE: 0.00345%)
  const exchangeTurnoverCharges = Math.round(turnover * 0.0000345 * 100) / 100;

  // 4. SEBI Turnover Charges (₹10 per crore = 0.0001%)
  const sebiTurnoverCharges = Math.round(turnover * 0.000001 * 100) / 100;

  // 5. Stamp Duty (State stamp duty: 0.015% on buy delivery, 0.003% on buy intraday)
  let stampDuty = 0;
  if (side === 'BUY') {
    if (productType === 'CNC') {
      stampDuty = Math.round(turnover * 0.00015 * 100) / 100; // 0.015%
    } else {
      stampDuty = Math.round(turnover * 0.00003 * 100) / 100; // 0.003%
    }
  }

  // 6. GST: 18% on (Brokerage + Exchange turnover charges + SEBI charges)
  const gstBase = brokerage + exchangeTurnoverCharges + sebiTurnoverCharges;
  const gst = Math.round(gstBase * 0.18 * 100) / 100;

  // Total regulatory charges & brokerage
  const totalCharges = Math.round(
    (brokerage + stt + exchangeTurnoverCharges + sebiTurnoverCharges + stampDuty + gst) * 100
  ) / 100;

  // Net cash required (BUY) or cash received (SELL)
  const netAmount = side === 'BUY'
    ? Math.round((turnover + totalCharges) * 100) / 100
    : Math.round((turnover - totalCharges) * 100) / 100;

  return {
    turnover: Math.round(turnover * 100) / 100,
    brokerage,
    stt,
    exchangeTurnoverCharges,
    sebiTurnoverCharges,
    stampDuty,
    gst,
    totalCharges,
    effectiveSlippage: Math.round(slippageAmount * 100) / 100,
    netAmount
  };
}
