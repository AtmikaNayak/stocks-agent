/**
 * Exchange session calendar for NSE equity trading.
 *
 * What this module does and does not know:
 *
 *  - It computes Asia/Kolkata wall-clock time correctly, independent of the
 *    server's own timezone. Never use `new Date().getHours()` for IST.
 *  - It knows the **standard** NSE intraday session shape (pre-open
 *    09:00–09:15, continuous 09:15–15:30) and that Saturday/Sunday are
 *    non-trading days.
 *  - It does **not** ship a holiday calendar. NSE publishes trading holidays
 *    and special sessions (e.g. Muhurat trading) that change every year, and
 *    inventing them here would be worse than admitting the gap. Holidays are
 *    therefore configuration: `INVESTPILOT_TRADING_HOLIDAYS` holds
 *    comma-separated `YYYY-MM-DD` dates. When it is empty the module reports
 *    `holidayCalendarConfigured: false` and treats weekdays as trading days.
 *
 * Fail-safe: any date that cannot be parsed or is unknown is treated as CLOSED
 * for order execution, never as open.
 */

export const EXCHANGE_TIMEZONE = 'Asia/Kolkata';

export const TRADING_HOLIDAYS_ENV = 'INVESTPILOT_TRADING_HOLIDAYS';

/** NSE continuous-session bounds, in IST minutes from midnight. */
const PRE_OPEN_START = 9 * 60; // 09:00
const REGULAR_START = 9 * 60 + 15; // 09:15
const REGULAR_END = 15 * 60 + 30; // 15:30

export type ExchangeSession = 'PRE_OPEN' | 'REGULAR' | 'CLOSED';

export interface IstClock {
  /** `YYYY-MM-DD` in Asia/Kolkata. */
  date: string;
  /** Minutes from IST midnight. */
  minutes: number;
  /** 0 = Sunday … 6 = Saturday, in Asia/Kolkata. */
  weekday: number;
  /** `HH:MM` in Asia/Kolkata. */
  time: string;
}

const IST_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: EXCHANGE_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  weekday: 'short'
});

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6
};

/** Returns the IST wall-clock reading for an instant (defaults to now). */
export function istClock(now: Date = new Date()): IstClock {
  const parts = IST_FORMATTER.formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';

  const year = get('year');
  const month = get('month');
  const day = get('day');
  // Intl renders midnight as "24" in some ICU versions; normalise it.
  const hour = Number(get('hour')) % 24;
  const minute = Number(get('minute'));
  const weekday = WEEKDAY_INDEX[get('weekday')] ?? -1;

  const date = `${year}-${month}-${day}`;
  const minutes = hour * 60 + minute;
  return {
    date,
    minutes,
    weekday,
    time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  };
}

/** Parses the configured holiday list. Invalid entries are dropped, not guessed. */
export function parseHolidays(raw: string | undefined | null): Set<string> {
  const holidays = new Set<string>();
  if (typeof raw !== 'string' || raw.trim() === '') return holidays;
  for (const entry of raw.split(',')) {
    const value = entry.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) continue;
    holidays.add(value);
  }
  return holidays;
}

export function configuredHolidays(): Set<string> {
  return parseHolidays(process.env[TRADING_HOLIDAYS_ENV]);
}

export interface SessionState {
  session: ExchangeSession;
  /** True only during the continuous 09:15–15:30 IST session on a trading day. */
  isOpen: boolean;
  clock: IstClock;
  timezone: string;
  isWeekend: boolean;
  isHoliday: boolean;
  holidayCalendarConfigured: boolean;
  /** Human-readable reason, safe to show in the UI. */
  message: string;
}

export function getExchangeSession(
  options: { now?: Date; holidays?: Set<string> } = {}
): SessionState {
  const now = options.now ?? new Date();
  const clock = istClock(now);
  const holidayCalendarConfigured = process.env[TRADING_HOLIDAYS_ENV] !== undefined;
  const holidays = options.holidays ?? configuredHolidays();

  const isWeekend = clock.weekday === 0 || clock.weekday === 6;
  const isHoliday = holidays.has(clock.date);
  const tradingDay = !isWeekend && !isHoliday;

  let session: ExchangeSession = 'CLOSED';
  if (tradingDay) {
    if (clock.minutes >= PRE_OPEN_START && clock.minutes < REGULAR_START) session = 'PRE_OPEN';
    else if (clock.minutes >= REGULAR_START && clock.minutes < REGULAR_END) session = 'REGULAR';
  }

  const message = !tradingDay
    ? isWeekend
      ? 'Weekend — the exchange is closed.'
      : 'Configured exchange holiday — the exchange is closed.'
    : session === 'REGULAR'
      ? 'NSE continuous session is open (09:15–15:30 IST).'
      : session === 'PRE_OPEN'
        ? 'NSE pre-open discovery session (09:00–09:15 IST); continuous trading has not started.'
        : 'Outside the NSE continuous session (09:15–15:30 IST).';

  return {
    session,
    isOpen: session === 'REGULAR',
    clock,
    timezone: EXCHANGE_TIMEZONE,
    isWeekend,
    isHoliday,
    holidayCalendarConfigured,
    message
  };
}

export interface TradingWindowInput {
  now?: Date;
  windowStart: string; // 'HH:MM' IST, from portfolio_permissions
  windowEnd: string;
  holidays?: Set<string>;
}

export interface TradingWindowVerdict {
  allowed: boolean;
  reason: string;
  session: SessionState;
  windowStart: string;
  windowEnd: string;
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

function toMinutes(value: string): number | null {
  if (typeof value !== 'string') return null;
  const match = HHMM.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Decides whether an order may execute now.
 *
 * A malformed configured window fails CLOSED: an unparseable risk setting must
 * never silently disable the control.
 */
export function evaluateTradingWindow(input: TradingWindowInput): TradingWindowVerdict {
  const session = getExchangeSession({ now: input.now, holidays: input.holidays });
  const start = toMinutes(input.windowStart);
  const end = toMinutes(input.windowEnd);

  const base = {
    session,
    windowStart: input.windowStart,
    windowEnd: input.windowEnd
  };

  if (start === null || end === null || end <= start) {
    return {
      ...base,
      allowed: false,
      reason: `Trading window "${input.windowStart}"–"${input.windowEnd}" is not a valid IST time range; orders are blocked until it is corrected.`
    };
  }

  if (!session.isOpen) {
    return { ...base, allowed: false, reason: session.message };
  }

  const minutes = session.clock.minutes;
  if (minutes < start || minutes >= end) {
    return {
      ...base,
      allowed: false,
      reason: `Outside this portfolio's trading window (${input.windowStart}–${input.windowEnd} IST). Current IST time is ${session.clock.time}.`
    };
  }

  return {
    ...base,
    allowed: true,
    reason: `Within the NSE continuous session and this portfolio's ${input.windowStart}–${input.windowEnd} IST window.`
  };
}
