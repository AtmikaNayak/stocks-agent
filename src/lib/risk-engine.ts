import db from '../db';
import { RiskCheckResult, OrderSide } from './types';

export interface EvaluateProposalRiskParams {
  portfolioId: string;
  assetId: string;
  side: OrderSide;
  quantity: number;
  price: number;
  bypassMarketHours?: boolean;
}

export function evaluateProposalRisk(params: EvaluateProposalRiskParams): RiskCheckResult {
  const { portfolioId, assetId, side, quantity, price, bypassMarketHours = false } = params;
  const orderValue = quantity * price;

  const reasons: string[] = [];
  const checks: RiskCheckResult['checks'] = [];

  // 1. Fetch Portfolio & Settings
  const portfolio = db.queryOne<{
    id: string;
    type: 'REAL' | 'VIRTUAL';
    user_id: string;
    current_cash: number;
    invested_value: number;
    total_value: number;
    realised_pnl: number;
    unrealised_pnl: number;
    is_active: number;
    broker_connection_id: string | null;
  }>('SELECT * FROM portfolios WHERE id = ?', [portfolioId]);

  if (!portfolio || !portfolio.is_active) {
    return {
      passed: false,
      reasons: ['Portfolio not found or inactive'],
      checks: [{
        ruleName: 'PORTFOLIO_ACTIVE',
        passed: false,
        currentValue: 'INACTIVE',
        limitValue: 'ACTIVE',
        description: 'Portfolio must be active'
      }],
      calculatedPositionPct: 0,
      calculatedExposureAfterPct: 0,
      cashRemainingAfter: 0
    };
  }

  const userSettings = db.queryOne<{
    emergency_stop_enabled: number;
    emergency_stop_reason: string | null;
    control_mode: string;
  }>('SELECT * FROM user_settings WHERE user_id = ?', [portfolio.user_id]);

  // 2. Emergency Stop Check
  const emergencyStopActive = userSettings?.emergency_stop_enabled === 1;
  checks.push({
    ruleName: 'EMERGENCY_STOP',
    passed: !emergencyStopActive,
    currentValue: emergencyStopActive ? 'TRIGGERED' : 'NORMAL',
    limitValue: 'NORMAL',
    description: 'System-wide emergency stop must be inactive'
  });
  if (emergencyStopActive) {
    reasons.push(`Emergency stop is active: ${userSettings?.emergency_stop_reason || 'Manual user override'}`);
  }

  // 3. Fetch Portfolio Permissions & Hard Risk Limits
  const permissions = db.queryOne<{
    allow_autonomous_trading: number;
    max_position_pct: number;
    max_portfolio_exposure_pct: number;
    min_cash_reserve_pct: number;
    max_risk_per_trade_pct: number;
    max_daily_loss_limit: number;
    max_drawdown_limit_pct: number;
    max_order_value: number;
    max_orders_per_day: number;
    trading_schedule_enabled: number;
    trading_window_start: string;
    trading_window_end: string;
  }>('SELECT * FROM portfolio_permissions WHERE portfolio_id = ?', [portfolioId]);

  const maxPositionPct = permissions?.max_position_pct ?? 15.0;
  const maxPortfolioExposurePct = permissions?.max_portfolio_exposure_pct ?? 80.0;
  const minCashReservePct = permissions?.min_cash_reserve_pct ?? 20.0;
  const maxOrderValue = permissions?.max_order_value ?? 10000.0;
  const maxOrdersPerDay = permissions?.max_orders_per_day ?? 10;
  const maxDailyLossLimit = permissions?.max_daily_loss_limit ?? 1500.0;

  // 4. Real Money Environment Restrictions
  if (portfolio.type === 'REAL') {
    const broker = portfolio.broker_connection_id ? db.queryOne<{
      status: string;
      compliance_acknowledged: number;
    }>('SELECT status, compliance_acknowledged FROM broker_connections WHERE id = ?', [portfolio.broker_connection_id]) : null;

    const brokerConnected = broker?.status === 'CONNECTED';
    checks.push({
      ruleName: 'REAL_BROKER_CONNECTED',
      passed: brokerConnected,
      currentValue: broker ? broker.status : 'NO_BROKER',
      limitValue: 'CONNECTED',
      description: 'Live Demat broker API session must be authenticated and valid'
    });
    if (!brokerConnected) {
      reasons.push('Live broker integration is not connected. Real orders cannot be placed.');
    }

    const complianceOk = broker?.compliance_acknowledged === 1;
    checks.push({
      ruleName: 'REGULATORY_COMPLIANCE_ACK',
      passed: complianceOk,
      currentValue: complianceOk ? 'ACKNOWLEDGED' : 'PENDING',
      limitValue: 'ACKNOWLEDGED',
      description: 'SEBI and broker statutory compliance terms must be acknowledged'
    });
    if (!complianceOk) {
      reasons.push('SEBI compliance and statutory risk disclosures are not acknowledged.');
    }
  }

  // 5. Daily Order Frequency Limit
  const todayOrderCountRow = db.queryOne<{ count: number }>(`
    SELECT COUNT(*) as count FROM orders
    WHERE portfolio_id = ? AND date(submitted_at) = date('now')
  `, [portfolioId]);
  const todayOrderCount = todayOrderCountRow?.count || 0;
  const orderCountPassed = todayOrderCount < maxOrdersPerDay;
  checks.push({
    ruleName: 'MAX_DAILY_ORDERS',
    passed: orderCountPassed,
    currentValue: todayOrderCount,
    limitValue: maxOrdersPerDay,
    description: `Maximum orders allowed per trading day: ${maxOrdersPerDay}`
  });
  if (!orderCountPassed) {
    reasons.push(`Daily order limit reached (${todayOrderCount}/${maxOrdersPerDay}). New orders halted.`);
  }

  // 6. Max Single Order Value Limit
  const orderValuePassed = orderValue <= maxOrderValue;
  checks.push({
    ruleName: 'MAX_ORDER_VALUE',
    passed: orderValuePassed,
    currentValue: Math.round(orderValue),
    limitValue: maxOrderValue,
    description: `Single order value cannot exceed ₹${maxOrderValue.toLocaleString('en-IN')}`
  });
  if (!orderValuePassed) {
    reasons.push(`Order value ₹${orderValue.toLocaleString('en-IN')} exceeds max allowed per order ₹${maxOrderValue.toLocaleString('en-IN')}`);
  }

  // 7. Check Current Position in the Asset
  const currentPos = db.queryOne<{
    quantity: number;
    current_market_value: number;
  }>('SELECT quantity, current_market_value FROM positions WHERE portfolio_id = ? AND asset_id = ?', [portfolioId, assetId]);

  const currentPosValue = currentPos ? currentPos.current_market_value : 0;
  const currentPosQty = currentPos ? currentPos.quantity : 0;

  if (side === 'SELL' && currentPosQty < quantity) {
    checks.push({
      ruleName: 'INSUFFICIENT_HOLDINGS_TO_SELL',
      passed: false,
      currentValue: currentPosQty,
      limitValue: quantity,
      description: 'Cannot sell more shares than currently held'
    });
    reasons.push(`Insufficient holdings to sell: held ${currentPosQty}, attempted to sell ${quantity}`);
  }

  // Calculate post-trade state
  let newPosValue = currentPosValue;
  let newCash = portfolio.current_cash;
  let newInvested = portfolio.invested_value;

  if (side === 'BUY') {
    newPosValue = currentPosValue + orderValue;
    newCash = portfolio.current_cash - orderValue;
    newInvested = portfolio.invested_value + orderValue;
  } else if (side === 'SELL') {
    newPosValue = Math.max(0, currentPosValue - orderValue);
    newCash = portfolio.current_cash + orderValue;
    newInvested = Math.max(0, portfolio.invested_value - orderValue);
  }

  const totalPortfolioValue = Math.max(1, portfolio.total_value);
  const calculatedPositionPct = Math.round((newPosValue / totalPortfolioValue) * 1000) / 10;
  const calculatedExposureAfterPct = Math.round((newInvested / totalPortfolioValue) * 1000) / 10;
  const cashReservePct = Math.round((newCash / totalPortfolioValue) * 1000) / 10;

  // 8. Cash Availability & Minimum Cash Reserve Check (for BUY)
  if (side === 'BUY') {
    const hasEnoughCash = newCash >= 0;
    checks.push({
      ruleName: 'CASH_AVAILABLE',
      passed: hasEnoughCash,
      currentValue: Math.round(portfolio.current_cash),
      limitValue: Math.round(orderValue),
      description: 'Sufficient liquid cash balance must be available'
    });
    if (!hasEnoughCash) {
      reasons.push(`Insufficient cash: available ₹${portfolio.current_cash.toFixed(2)}, required ₹${orderValue.toFixed(2)}`);
    }

    const minCashPassed = cashReservePct >= minCashReservePct;
    checks.push({
      ruleName: 'MIN_CASH_RESERVE',
      passed: minCashPassed,
      currentValue: `${cashReservePct}%`,
      limitValue: `${minCashReservePct}%`,
      description: `Must maintain minimum cash reserve buffer of ${minCashReservePct}%`
    });
    if (!minCashPassed) {
      reasons.push(`Violates minimum cash reserve: post-trade cash would be ${cashReservePct}%, limit is ${minCashReservePct}%`);
    }

    // 9. Max Position Concentration
    const positionPctPassed = calculatedPositionPct <= maxPositionPct;
    checks.push({
      ruleName: 'MAX_POSITION_CONCENTRATION',
      passed: positionPctPassed,
      currentValue: `${calculatedPositionPct}%`,
      limitValue: `${maxPositionPct}%`,
      description: `Single stock exposure cannot exceed ${maxPositionPct}% of portfolio`
    });
    if (!positionPctPassed) {
      reasons.push(`Violates single stock concentration: post-trade position would be ${calculatedPositionPct}%, limit is ${maxPositionPct}%`);
    }

    // 10. Max Portfolio Exposure
    const exposurePassed = calculatedExposureAfterPct <= maxPortfolioExposurePct;
    checks.push({
      ruleName: 'MAX_PORTFOLIO_EXPOSURE',
      passed: exposurePassed,
      currentValue: `${calculatedExposureAfterPct}%`,
      limitValue: `${maxPortfolioExposurePct}%`,
      description: `Total invested portfolio exposure cannot exceed ${maxPortfolioExposurePct}%`
    });
    if (!exposurePassed) {
      reasons.push(`Violates portfolio exposure limit: post-trade exposure would be ${calculatedExposureAfterPct}%, limit is ${maxPortfolioExposurePct}%`);
    }
  }

  // 11. Daily Loss Limit Safeguard
  const todayLoss = Math.abs(Math.min(0, portfolio.realised_pnl));
  const lossLimitPassed = todayLoss <= maxDailyLossLimit;
  checks.push({
    ruleName: 'DAILY_LOSS_SAFEGUARD',
    passed: lossLimitPassed,
    currentValue: Math.round(todayLoss),
    limitValue: maxDailyLossLimit,
    description: `Daily loss safeguard: max loss limit ₹${maxDailyLossLimit}`
  });
  if (!lossLimitPassed) {
    reasons.push(`Daily loss limit reached (₹${todayLoss} >= ₹${maxDailyLossLimit}). Trading suspended for the day.`);
  }

  const passed = reasons.length === 0;

  return {
    passed,
    reasons,
    checks,
    calculatedPositionPct,
    calculatedExposureAfterPct,
    cashRemainingAfter: Math.round(newCash * 100) / 100
  };
}
