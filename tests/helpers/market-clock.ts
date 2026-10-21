/**
 * Deterministic clocks for tests.
 *
 * The risk engine enforces the NSE trading window using Asia/Kolkata time. A
 * test that relies on "now" would otherwise pass or fail depending on the hour
 * the suite happens to run in, which is unacceptable for a risk control.
 * Tests therefore inject an explicit instant.
 */

/** Wednesday 2026-10-21 11:00 IST — inside the NSE continuous session. */
export const TRADING_NOW = new Date('2026-10-21T05:30:00Z');

/** Wednesday 2026-10-21 20:00 IST — after the close, same trading day. */
export const AFTER_HOURS_NOW = new Date('2026-10-21T14:30:00Z');

/** Saturday 2026-10-24 11:00 IST — weekend. */
export const WEEKEND_NOW = new Date('2026-10-24T05:30:00Z');

/** Wednesday 2026-10-21 09:05 IST — during pre-open, before continuous trading. */
export const PRE_OPEN_NOW = new Date('2026-10-21T03:35:00Z');
