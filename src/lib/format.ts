/**
 * Formatting helpers shared by the UI.
 *
 * Money is always shown in Indian Rupees with Indian digit grouping
 * (₹1,25,000) because that is what people here actually read.
 */

export function toNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function formatINR(value: unknown, options?: { decimals?: number; sign?: boolean }): string {
  const n = toNumber(value);
  // Whole rupees read cleaner on summary cards; anything with paise keeps two decimals.
  const decimals = options?.decimals ?? (Number.isInteger(n) ? 0 : 2);
  const formatted = Math.abs(n).toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const prefix = n < 0 ? '−' : options?.sign && n > 0 ? '+' : '';
  return `${prefix}₹${formatted}`;
}

/** ₹1.25 L / ₹3.4 Cr style shorthand for very large figures. */
export function formatINRShort(value: unknown): string {
  const n = toNumber(value);
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (abs >= 10000000) return `${sign}₹${(abs / 10000000).toFixed(2)} Cr`;
  if (abs >= 100000) return `${sign}₹${(abs / 100000).toFixed(2)} L`;
  return formatINR(n);
}

export function formatPct(value: unknown, decimals = 2): string {
  const n = toNumber(value);
  const sign = n > 0 ? '+' : n < 0 ? '−' : '';
  return `${sign}${Math.abs(n).toFixed(decimals)}%`;
}

export type MoneyTone = 'up' | 'down' | 'flat';

export function toneFor(value: unknown): MoneyTone {
  const n = toNumber(value);
  if (n > 0.004) return 'up';
  if (n < -0.004) return 'down';
  return 'flat';
}

/** Tailwind text colour for a money movement. */
export function toneClass(tone: MoneyTone): string {
  if (tone === 'up') return 'text-emerald-400';
  if (tone === 'down') return 'text-rose-400';
  return 'text-ink-2';
}

/**
 * Indian-market greeting. Always evaluated in IST so the server and the
 * browser render the same words (no hydration mismatch).
 */
export function greeting(date = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }).format(date)
  );
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function todayLongIST(date = new Date()): string {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(date);
}

/** Friendly label for a stock's daily move. */
export function moveLabel(changePct: unknown): string {
  const n = toNumber(changePct);
  if (n > 0) return `up ${Math.abs(n).toFixed(2)}% today`;
  if (n < 0) return `down ${Math.abs(n).toFixed(2)}% today`;
  return 'unchanged today';
}

export function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
