export type PortfolioType = 'REAL' | 'VIRTUAL';

export type ExperienceMode = 'BEGINNER' | 'ADVANCED';

export type ControlMode =
  | 'MANUAL'
  | 'COPILOT'
  | 'SUPERVISED'
  | 'AUTONOMOUS_PAPER'
  | 'AUTHORISED_LIVE';

export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'MARKET' | 'LIMIT' | 'SL_LIMIT';
export type ProductType = 'CNC' | 'MIS';

export type OrderStatus =
  | 'PENDING_APPROVAL'
  | 'SUBMITTED'
  | 'OPEN'
  | 'FILLED'
  | 'PARTIALLY_FILLED'
  | 'REJECTED'
  | 'CANCELLED';

export type ProposalStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED_RISK'
  | 'REJECTED_USER'
  | 'EXPIRED'
  | 'EXECUTED';

export type Horizon = 'LONG_TERM' | 'SHORT_TERM';

export type BrokerName = 'ZERODHA' | 'ANGEL_ONE' | 'UPSTOX';
export type BrokerStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'REVOKED' | 'ERROR';

export type DataFreshness = 'LIVE' | 'DELAYED_15M' | 'EOD' | 'HISTORICAL' | 'SYNTHETIC' | 'STALE';

export interface IndianChargesBreakdown {
  turnover: number;
  /** Fill price actually used by the simulator (quote price ± modelled slippage). */
  effectivePrice: number;
  brokerage: number;
  stt: number;
  exchangeTurnoverCharges: number;
  sebiTurnoverCharges: number;
  stampDuty: number;
  gst: number;
  totalCharges: number;
  effectiveSlippage: number;
  netAmount: number;
}

export interface RiskCheckResult {
  passed: boolean;
  reasons: string[];
  checks: {
    ruleName: string;
    passed: boolean;
    /**
     * 'PASS' / 'FAIL' for an evaluated control. 'UNAVAILABLE' means the control
     * could not be measured (for example, drawdown without NAV history) and is
     * never silently reported as a pass in the UI.
     */
    status?: 'PASS' | 'FAIL' | 'UNAVAILABLE';
    currentValue: number | string;
    limitValue: number | string;
    description: string;
  }[];
  calculatedPositionPct: number;
  calculatedExposureAfterPct: number;
  cashRemainingAfter: number;
}

export interface MarketQuote {
  symbol: string;
  assetId: string;
  name: string;
  price: number;
  open: number;
  high: number;
  low: number;
  close: number;
  change: number;
  changePct: number;
  volume: number;
  vwap?: number;
  timestamp: string;
  provider: string;
  freshness: DataFreshness;
  qualityScore: number;
}

export interface AssetFundamental {
  assetId: string;
  symbol: string;
  name: string;
  sector: string;
  marketCapCr: number;
  peRatio: number;
  pbRatio: number;
  dividendYield: number;
  roe: number;
  roce: number;
  debtToEquity: number;
  epsTtm: number;
  operatingMargin: number;
  netProfitMargin: number;
  revenueGrowthYoy: number;
  profitGrowthYoy: number;
  freeCashFlowCr: number;
  source: string;
  verifiedAt: string;
}

export interface ProposalRequest {
  portfolioId: string;
  assetId: string;
  action: 'BUY' | 'SELL' | 'HOLD' | 'WAIT';
  horizon: Horizon;
  strategyVersionId?: string;
}
