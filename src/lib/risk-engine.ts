import type Database from 'better-sqlite3';
import db from '../db';
import { RiskCheckResult, OrderSide, ProductType } from './types';
import { istClock, evaluateTradingWindow, configuredHolidays } from './trading-calendar';

/**
 * Deterministic risk engine.
 *
 * Every check here is pure arithmetic over committed database state — no AI,
 * no randomness, no network. It is called:
 *   1. when a proposal is generated (advisory: records why it would be rejected), and
 *   2. inside the execution write transaction, immediately before any financial
 *      row is written (authoritative).
 *
 * Callers MUST pass the same `now` they intend to use, and MUST call it inside
 * the write transaction that performs the trade so the state it reads cannot be
 * replaced by a concurrent writer before the trade commits.
 */

/**
 * Adverse-move assumption used to size trade risk when no explicit stop-loss
 * reference exists for the asset.
 *
 * This is an *illustrative* modelling assumption, not a market observation: the
 * simulator has no stop orders and no verified volatility feed, so
 * `max_risk_per_trade_pct` is evaluated against "the position loses this
 * percentage of its entry value before the risk is acted on". When an active
 * investment thesis exists for the portfolio+asset, its stored stop-loss price
 * is used instead and this constant is not applied.
 *
 * Documented in README → Risk-control matrix.
 */
export const DEFAULT_ASSUMED_STOP_LOSS_PCT = 10;

/** Allowed tolerance when comparing money that has already been rounded to paise. */
const MONEY_EPSILON = 0.005;

export interface OrderCostBasis {
  /** Quantity × effective fill price (includes modelled slippage). */
  grossAmount: number;
  /** Cash leaving the account on BUY (gross + charges). */
  buyCashRequired?: number;
  /** Cash entering the account on SELL (gross − charges). */
  sellCashProceeds?: number;
  totalCharges: number;
}

export interface EvaluateProposalRiskParams {
  portfolioId: string;
  assetId: string;
  side: OrderSide;
  quantity: number;
  /** Reference price from the stored quote. */
  price: number;
  productType?: ProductType;
  /** Cost basis from the charge calculator. Falls back to quantity × price. */
  orderCost?: OrderCostBasis;
  /** Injectable clock; production always uses the real one. */
  now?: Date;
  /** Explicit, auditable override used only by operator tooling and tests. */
  bypassMarketHours?: boolean;
  /**
   * Advisory evaluations (e.g. generating a proposal) are not executions, so
   * they skip the trading-window gate; the execution path always enforces it.
   */
  enforceTradingWindow?: boolean;
  /** Transaction handle. Defaults to the process connection. */
  database?: Database.Database;
}

type CheckStatus = 'PASS' | 'FAIL' | 'UNAVAILABLE';

interface MutableCheck {
  ruleName: string;
  passed: boolean;
  status: CheckStatus;
  currentValue: number | string;
  limitValue: number | string;
  description: string;
}

const round2 = (value: number) => Math.round(value * 100) / 100;
const round1 = (value: number) => Math.round(value * 10) / 10;

function finiteOrNull(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** IST calendar date (`YYYY-MM-DD`) for an instant — the daily-limit boundary. */
export function istDateString(now: Date = new Date()): string {
  return istClock(now).date;
}

export function evaluateProposalRisk(params: EvaluateProposalRiskParams): RiskCheckResult {
  const {
    portfolioId,
    assetId,
    side,
    quantity,
    price,
    productType = 'CNC',
    now = new Date(),
    bypassMarketHours = false
  } = params;
  const database = params.database ?? db.get();

  const reasons: string[] = [];
  const checks: MutableCheck[] = [];

  const pushCheck = (
    ruleName: string,
    passed: boolean,
    currentValue: number | string,
    limitValue: number | string,
    description: string,
    status: CheckStatus = passed ? 'PASS' : 'FAIL'
  ): void => {
    checks.push({ ruleName, passed, status, currentValue, limitValue, description });
  };

  // ---------------------------------------------------------------- inputs
  const invalidQuantity = !Number.isSafeInteger(quantity) || quantity <= 0;
  const invalidPrice = !Number.isFinite(price) || price <= 0;
  const invalidSide = side !== 'BUY' && side !== 'SELL';
  const invalidProduct = productType !== 'CNC' && productType !== 'MIS';

  if (invalidQuantity || invalidPrice || invalidSide || invalidProduct) {
    const inputReasons = [
      ...(invalidQuantity ? ['Quantity must be a positive whole number of shares'] : []),
      ...(invalidPrice ? ['Execution price must be finite and greater than zero'] : []),
      ...(invalidSide ? ['Order side must be BUY or SELL'] : []),
      ...(invalidProduct ? ['Product type must be CNC or MIS'] : [])
    ];
    return {
      passed: false,
      reasons: inputReasons,
      checks: [
        {
          ruleName: 'ORDER_INPUT_VALID',
          passed: false,
          status: 'FAIL',
          currentValue: inputReasons.join('; '),
          limitValue: 'positive integer quantity, positive finite price, BUY/SELL, CNC/MIS',
          description: 'Order inputs must be valid before risk calculations'
        }
      ],
      calculatedPositionPct: 0,
      calculatedExposureAfterPct: 0,
      cashRemainingAfter: 0
    };
  }

  const grossAmount = round2(params.orderCost?.grossAmount ?? quantity * price);
  if (!Number.isFinite(grossAmount) || grossAmount <= 0) {
    return {
      passed: false,
      reasons: ['Calculated order value is invalid'],
      checks: [
        {
          ruleName: 'ORDER_VALUE_VALID',
          passed: false,
          status: 'FAIL',
          currentValue: String(grossAmount),
          limitValue: 'finite positive amount',
          description: 'Order value must be a finite positive amount'
        }
      ],
      calculatedPositionPct: 0,
      calculatedExposureAfterPct: 0,
      cashRemainingAfter: 0
    };
  }

  const buyCashRequired = round2(params.orderCost?.buyCashRequired ?? grossAmount);
  const sellCashProceeds = round2(params.orderCost?.sellCashProceeds ?? grossAmount);
  const cashDelta = side === 'BUY' ? -buyCashRequired : sellCashProceeds;

  // ------------------------------------------------------------- portfolio
  const portfolio = database
    .prepare(
      `SELECT id, type, user_id, current_cash, invested_value, total_value,
              realised_pnl, unrealised_pnl, is_active
       FROM portfolios WHERE id = ?`
    )
    .get(portfolioId) as
    | {
        id: string;
        type: 'REAL' | 'VIRTUAL';
        user_id: string;
        current_cash: number;
        invested_value: number;
        total_value: number;
        realised_pnl: number;
        unrealised_pnl: number;
        is_active: number;
      }
    | undefined;

  if (!portfolio || !portfolio.is_active) {
    return {
      passed: false,
      reasons: ['Portfolio not found or inactive'],
      checks: [
        {
          ruleName: 'PORTFOLIO_ACTIVE',
          passed: false,
          status: 'FAIL',
          currentValue: portfolio ? 'INACTIVE' : 'NOT_FOUND',
          limitValue: 'ACTIVE',
          description: 'Portfolio must exist and be active'
        }
      ],
      calculatedPositionPct: 0,
      calculatedExposureAfterPct: 0,
      cashRemainingAfter: 0
    };
  }

  const settings = database
    .prepare(
      'SELECT emergency_stop_enabled, emergency_stop_reason, control_mode FROM user_settings WHERE user_id = ?'
    )
    .get(portfolio.user_id) as
    | { emergency_stop_enabled: number; emergency_stop_reason: string | null; control_mode: string }
    | undefined;

  // --------------------------------------------------------- emergency stop
  const emergencyStopActive = settings?.emergency_stop_enabled === 1;
  pushCheck(
    'EMERGENCY_STOP',
    !emergencyStopActive,
    emergencyStopActive ? 'TRIGGERED' : 'NORMAL',
    'NORMAL',
    'The user-wide emergency stop must be released'
  );
  if (emergencyStopActive) {
    reasons.push(
      `Emergency stop is active: ${settings?.emergency_stop_reason || 'manual user override'}`
    );
  }

  // ------------------------------------------------------------ permissions
  const permissions = database
    .prepare('SELECT * FROM portfolio_permissions WHERE portfolio_id = ?')
    .get(portfolioId) as
    | {
        allow_autonomous_trading: number;
        max_position_pct: number;
        max_portfolio_exposure_pct: number;
        min_cash_reserve_pct: number;
        max_risk_per_trade_pct: number;
        max_daily_loss_limit: number;
        max_drawdown_limit_pct: number;
        max_order_value: number;
        max_orders_per_day: number;
        allow_intraday: number;
        allow_delivery: number;
        trading_schedule_enabled: number;
        trading_window_start: string;
        trading_window_end: string;
      }
    | undefined;

  if (!permissions) {
    // Fail closed: a portfolio with no risk configuration must not trade.
    pushCheck(
      'RISK_LIMITS_CONFIGURED',
      false,
      'MISSING',
      'CONFIGURED',
      'A risk-limit row must exist for the portfolio before it can trade'
    );
    reasons.push(
      'Risk limits are not configured for this portfolio, so no order can be validated.'
    );
    return {
      passed: false,
      reasons,
      checks,
      calculatedPositionPct: 0,
      calculatedExposureAfterPct: 0,
      cashRemainingAfter: round2(portfolio.current_cash)
    };
  }

  const limits = [
    ['max_position_pct', permissions.max_position_pct, 100],
    ['max_portfolio_exposure_pct', permissions.max_portfolio_exposure_pct, 100],
    ['min_cash_reserve_pct', permissions.min_cash_reserve_pct, 100],
    ['max_risk_per_trade_pct', permissions.max_risk_per_trade_pct, 100],
    ['max_daily_loss_limit', permissions.max_daily_loss_limit, Number.MAX_SAFE_INTEGER],
    ['max_drawdown_limit_pct', permissions.max_drawdown_limit_pct, 100],
    ['max_order_value', permissions.max_order_value, Number.MAX_SAFE_INTEGER],
    ['max_orders_per_day', permissions.max_orders_per_day, Number.MAX_SAFE_INTEGER]
  ] as const;

  const invalidLimits = limits
    .filter(([, value]) => {
      const n = finiteOrNull(value);
      return n === null || n < 0;
    })
    .map(([name]) => name);

  pushCheck(
    'RISK_LIMITS_VALID',
    invalidLimits.length === 0,
    invalidLimits.length === 0 ? 'OK' : invalidLimits.join(', '),
    'finite, non-negative numbers',
    'Configured risk limits must be valid before any order is evaluated'
  );
  if (invalidLimits.length > 0) {
    reasons.push(
      `Risk limits are misconfigured (${invalidLimits.join(', ')}); orders are blocked until corrected.`
    );
    return {
      passed: false,
      reasons,
      checks,
      calculatedPositionPct: 0,
      calculatedExposureAfterPct: 0,
      cashRemainingAfter: round2(portfolio.current_cash)
    };
  }

  // ---------------------------------------------------------- product type
  const productAllowed =
    productType === 'CNC' ? permissions.allow_delivery === 1 : permissions.allow_intraday === 1;
  pushCheck(
    'PRODUCT_TYPE_ALLOWED',
    productAllowed,
    productType,
    productType === 'CNC' ? 'delivery enabled' : 'intraday enabled',
    productType === 'CNC'
      ? 'Delivery (CNC) orders must be enabled for this portfolio'
      : 'Intraday (MIS) orders must be enabled for this portfolio'
  );
  if (!productAllowed) {
    reasons.push(
      `${productType} orders are not enabled for this portfolio (intraday and delivery are separate permissions).`
    );
  }

  // --------------------------------------------------------- real accounts
  if (portfolio.type === 'REAL') {
    // Real execution is disabled before this engine runs, but the engine stays
    // fail-closed on its own so a future caller cannot skip the guard.
    pushCheck(
      'REAL_EXECUTION_DISABLED',
      false,
      'REAL',
      'VIRTUAL',
      'Live broker execution is disabled in this build'
    );
    reasons.push(
      'Real-money execution is disabled: no verified broker adapter or fill reconciliation exists.'
    );
  }

  // ---------------------------------------------------------- order count
  const istToday = istDateString(now);
  const orderCountRow = database
    .prepare(
      `SELECT COUNT(*) AS count FROM orders
       WHERE portfolio_id = ? AND date(submitted_at, '+330 minutes') = ?`
    )
    .get(portfolioId, istToday) as { count: number };
  const todayOrderCount = orderCountRow?.count ?? 0;
  const orderCountPassed = todayOrderCount < permissions.max_orders_per_day;
  pushCheck(
    'MAX_DAILY_ORDERS',
    orderCountPassed,
    todayOrderCount,
    permissions.max_orders_per_day,
    `At most ${permissions.max_orders_per_day} orders per IST trading day`
  );
  if (!orderCountPassed) {
    reasons.push(
      `Daily order limit reached (${todayOrderCount}/${permissions.max_orders_per_day}). New orders halted.`
    );
  }

  // ----------------------------------------------------------- order value
  const orderValuePassed = round2(grossAmount) <= permissions.max_order_value + MONEY_EPSILON;
  pushCheck(
    'MAX_ORDER_VALUE',
    orderValuePassed,
    round2(grossAmount),
    permissions.max_order_value,
    `Single order turnover (including modelled slippage) cannot exceed ₹${permissions.max_order_value.toLocaleString('en-IN')}`
  );
  if (!orderValuePassed) {
    reasons.push(
      `Order value ₹${round2(grossAmount).toLocaleString('en-IN')} exceeds the ₹${permissions.max_order_value.toLocaleString('en-IN')} per-order limit`
    );
  }

  // -------------------------------------------------------------- position
  // Scoped to the exact portfolio, asset AND product type. A CNC order must not
  // see (or sell) shares held under MIS.
  const position = database
    .prepare(
      `SELECT quantity, average_buy_price, invested_amount, current_market_value
       FROM positions WHERE portfolio_id = ? AND asset_id = ? AND product_type = ?`
    )
    .get(portfolioId, assetId, productType) as
    | {
        quantity: number;
        average_buy_price: number;
        invested_amount: number;
        current_market_value: number;
      }
    | undefined;

  const availableQuantity = position ? Number(position.quantity) : 0;
  const positionMarketValue = position ? Number(position.current_market_value) : 0;

  if (side === 'SELL') {
    // Compare integers directly: rounding a share count is never acceptable.
    const holdingsPassed = availableQuantity >= quantity;
    pushCheck(
      'SELLABLE_QUANTITY',
      holdingsPassed,
      availableQuantity,
      quantity,
      `Cannot sell more ${productType} shares than are held in this portfolio`
    );
    if (!holdingsPassed) {
      reasons.push(
        `Insufficient ${productType} holdings to sell: held ${availableQuantity}, attempted to sell ${quantity}`
      );
    }
  }

  // ------------------------------------------------- post-trade projections
  const marketValueRow = database
    .prepare(
      'SELECT COALESCE(SUM(current_market_value), 0) AS total FROM positions WHERE portfolio_id = ?'
    )
    .get(portfolioId) as { total: number };
  const totalMarketValue = Number(marketValueRow?.total ?? 0);

  const positionValueAfter =
    side === 'BUY' ? positionMarketValue + grossAmount : Math.max(0, positionMarketValue - grossAmount);
  const marketValueAfter = totalMarketValue - positionMarketValue + positionValueAfter;
  const cashAfter = round2(Number(portfolio.current_cash) + cashDelta);
  const navAfter = round2(cashAfter + marketValueAfter);

  const positionPct = navAfter > 0 ? round1((positionValueAfter / navAfter) * 100) : 0;
  const exposurePct = navAfter > 0 ? round1((marketValueAfter / navAfter) * 100) : 0;
  const cashPct = navAfter > 0 ? round1((cashAfter / navAfter) * 100) : 0;

  if (side === 'BUY') {
    // Cash is checked against the amount that will actually leave the account:
    // turnover plus every charge. Checking gross alone under-estimates the debit.
    const hasEnoughCash = cashAfter >= -MONEY_EPSILON;
    pushCheck(
      'CASH_AVAILABLE',
      hasEnoughCash,
      round2(Number(portfolio.current_cash)),
      buyCashRequired,
      'Settled cash must cover turnover plus all estimated charges'
    );
    if (!hasEnoughCash) {
      reasons.push(
        `Insufficient cash after charges: available ₹${round2(Number(portfolio.current_cash)).toFixed(2)}, required ₹${buyCashRequired.toFixed(2)} (charges ₹${round2(params.orderCost?.totalCharges ?? 0).toFixed(2)})`
      );
    }

    const minCashPassed = cashPct >= permissions.min_cash_reserve_pct - 1e-9;
    pushCheck(
      'MIN_CASH_RESERVE',
      minCashPassed,
      `${cashPct}%`,
      `${permissions.min_cash_reserve_pct}%`,
      `Post-trade cash must stay at or above ${permissions.min_cash_reserve_pct}% of NAV`
    );
    if (!minCashPassed) {
      reasons.push(
        `Violates the minimum cash reserve: post-trade cash would be ${cashPct}%, limit is ${permissions.min_cash_reserve_pct}%`
      );
    }

    const positionPassed = positionPct <= permissions.max_position_pct + 1e-9;
    pushCheck(
      'MAX_POSITION_CONCENTRATION',
      positionPassed,
      `${positionPct}%`,
      `${permissions.max_position_pct}%`,
      `A single stock cannot exceed ${permissions.max_position_pct}% of NAV`
    );
    if (!positionPassed) {
      reasons.push(
        `Violates single-stock concentration: post-trade position would be ${positionPct}%, limit is ${permissions.max_position_pct}%`
      );
    }

    const exposurePassed = exposurePct <= permissions.max_portfolio_exposure_pct + 1e-9;
    pushCheck(
      'MAX_PORTFOLIO_EXPOSURE',
      exposurePassed,
      `${exposurePct}%`,
      `${permissions.max_portfolio_exposure_pct}%`,
      `Total invested exposure cannot exceed ${permissions.max_portfolio_exposure_pct}% of NAV`
    );
    if (!exposurePassed) {
      reasons.push(
        `Violates the portfolio exposure limit: post-trade exposure would be ${exposurePct}%, limit is ${permissions.max_portfolio_exposure_pct}%`
      );
    }
  }

  // -------------------------------------------------------- risk per trade
  // Risk = quantity × (entry − stop). The stop comes from the portfolio's
  // active thesis for this asset when one exists; otherwise the documented
  // DEFAULT_ASSUMED_STOP_LOSS_PCT assumption is applied.
  if (side === 'BUY') {
    const thesis = database
      .prepare(
        `SELECT stop_loss_price FROM investment_theses
         WHERE portfolio_id = ? AND asset_id = ? AND status = 'ACTIVE'
         ORDER BY created_at DESC LIMIT 1`
      )
      .get(portfolioId, assetId) as { stop_loss_price: number | null } | undefined;

    const thesisStop = finiteOrNull(thesis?.stop_loss_price);
    const usesThesisStop = thesisStop !== null && thesisStop > 0 && thesisStop < price;
    const stopPrice = usesThesisStop
      ? (thesisStop as number)
      : price * (1 - DEFAULT_ASSUMED_STOP_LOSS_PCT / 100);

    const riskPerShare = Math.max(0, price - stopPrice);
    const riskAmount = riskPerShare * quantity;
    const riskPct = navAfter > 0 ? (riskAmount / navAfter) * 100 : 0;
    const riskPassed = riskPct <= permissions.max_risk_per_trade_pct + 1e-9;

    pushCheck(
      'MAX_RISK_PER_TRADE',
      riskPassed,
      `${round2(riskPct)}%`,
      `${permissions.max_risk_per_trade_pct}%`,
      usesThesisStop
        ? `Loss at the stored thesis stop (₹${round2(stopPrice)}) must not exceed ${permissions.max_risk_per_trade_pct}% of NAV`
        : `Assuming a ${DEFAULT_ASSUMED_STOP_LOSS_PCT}% adverse move (no stop-loss is stored for this position), loss must not exceed ${permissions.max_risk_per_trade_pct}% of NAV`
    );
    if (!riskPassed) {
      reasons.push(
        `Trade risk of ₹${round2(riskAmount)} (${round2(riskPct)}% of NAV) exceeds the ${permissions.max_risk_per_trade_pct}% per-trade limit`
      );
    }
  }

  // ----------------------------------------------------------- daily loss
  // Realised loss booked today, in IST. This is deliberately NOT lifetime
  // realised P&L: a lifetime figure never resets and would permanently block
  // trading after one bad month.
  const dailyRealisedRow = database
    .prepare(
      `SELECT COALESCE(SUM(realised_pnl), 0) AS total FROM executions
       WHERE portfolio_id = ? AND date(executed_at, '+330 minutes') = ?`
    )
    .get(portfolioId, istToday) as { total: number };

  const realisedToday = Number(dailyRealisedRow?.total ?? 0);
  const realisedLossToday = Math.max(0, -realisedToday);
  const dailyLossPassed = realisedLossToday < permissions.max_daily_loss_limit - MONEY_EPSILON;

  pushCheck(
    'DAILY_LOSS_LIMIT',
    dailyLossPassed,
    round2(realisedLossToday),
    permissions.max_daily_loss_limit,
    `Realised loss booked today (IST) must stay below ₹${permissions.max_daily_loss_limit}`
  );
  if (!dailyLossPassed) {
    reasons.push(
      `Daily loss limit reached: ₹${round2(realisedLossToday)} realised today, limit ₹${permissions.max_daily_loss_limit}. Trading is suspended for the rest of the IST day.`
    );
  }

  // ------------------------------------------------------------- drawdown
  // Peak NAV comes from recorded portfolio snapshots. Without history the
  // control is reported UNAVAILABLE rather than being computed from an invented
  // peak — a fabricated baseline would silently disable a real protection.
  const peakRow = database
    .prepare('SELECT MAX(total_value) AS peak, COUNT(*) AS samples FROM portfolio_snapshots WHERE portfolio_id = ?')
    .get(portfolioId) as { peak: number | null; samples: number };

  const snapshotSamples = Number(peakRow?.samples ?? 0);
  const peakNav = finiteOrNull(peakRow?.peak);

  if (snapshotSamples < 2 || peakNav === null || peakNav <= 0) {
    pushCheck(
      'MAX_DRAWDOWN',
      true,
      'UNAVAILABLE',
      `${permissions.max_drawdown_limit_pct}%`,
      'Not enough recorded NAV history to measure drawdown; the control cannot be evaluated yet',
      'UNAVAILABLE'
    );
  } else {
    const peak = Math.max(peakNav, navAfter);
    const drawdownPct = peak > 0 ? round2(((peak - navAfter) / peak) * 100) : 0;
    const drawdownPassed = drawdownPct <= permissions.max_drawdown_limit_pct + 1e-9;
    pushCheck(
      'MAX_DRAWDOWN',
      drawdownPassed,
      `${drawdownPct}%`,
      `${permissions.max_drawdown_limit_pct}%`,
      'Drawdown from the recorded peak NAV must stay within the limit'
    );
    if (!drawdownPassed) {
      reasons.push(
        `Drawdown of ${drawdownPct}% from the peak NAV of ₹${round2(peak)} exceeds the ${permissions.max_drawdown_limit_pct}% limit`
      );
    }
  }

  // ------------------------------------------------------ trading schedule
  const enforceTradingWindow = params.enforceTradingWindow ?? true;
  if (!enforceTradingWindow) {
    // Advisory-only evaluation: the window is checked when the order executes,
    // because a proposal generated after hours may legitimately be approved
    // during the next session.
  } else if (permissions.trading_schedule_enabled === 1 && !bypassMarketHours) {
    const verdict = evaluateTradingWindow({
      now,
      windowStart: permissions.trading_window_start,
      windowEnd: permissions.trading_window_end,
      holidays: configuredHolidays()
    });
    pushCheck(
      'TRADING_WINDOW',
      verdict.allowed,
      verdict.session.clock.time,
      `${permissions.trading_window_start}–${permissions.trading_window_end} IST on a trading day`,
      verdict.session.holidayCalendarConfigured
        ? 'Orders are only accepted during the configured IST trading window'
        : 'Orders are only accepted during the weekly IST trading window. No exchange holiday calendar is configured, so public holidays are not enforced.'
    );
    if (!verdict.allowed) {
      reasons.push(verdict.reason);
    }
  } else if (permissions.trading_schedule_enabled === 1 && bypassMarketHours) {
    pushCheck(
      'TRADING_WINDOW',
      true,
      'BYPASSED',
      `${permissions.trading_window_start}–${permissions.trading_window_end} IST`,
      'The trading-window check was explicitly bypassed by the caller and recorded in the audit log'
    );
  }

  return {
    passed: reasons.length === 0,
    reasons,
    checks,
    calculatedPositionPct: positionPct,
    calculatedExposureAfterPct: exposurePct,
    cashRemainingAfter: cashAfter
  };
}

/** Appends a portfolio snapshot. Only ever called after a committed mutation. */
export function recordPortfolioSnapshot(
  portfolioId: string,
  now: Date = new Date(),
  database: Database.Database = db.get()
): void {
  const portfolio = database
    .prepare('SELECT current_cash, total_value FROM portfolios WHERE id = ?')
    .get(portfolioId) as { current_cash: number; total_value: number } | undefined;
  if (!portfolio) return;

  const positionsValue = Number(portfolio.total_value) - Number(portfolio.current_cash);
  database
    .prepare(
      `INSERT INTO portfolio_snapshots (id, portfolio_id, timestamp, cash_balance, positions_value, total_value, daily_pnl)
       VALUES (?, ?, ?, ?, ?, ?, 0)`
    )
    .run(
      `snap_${portfolioId}_${now.getTime()}_${Math.random().toString(36).slice(2, 8)}`,
      portfolioId,
      now.toISOString(),
      round2(Number(portfolio.current_cash)),
      round2(positionsValuesafe(positionsValue)),
      round2(Number(portfolio.total_value))
    );
}

function positionsValuesafe(value: number): number {
  return Number.isFinite(value) ? value : 0;
}
