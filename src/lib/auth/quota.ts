/**
 * Per-user quotas for expensive endpoints.
 *
 * Scope and limitations, stated plainly:
 *  - Counters live in process memory. With more than one application instance
 *    each process enforces its own quota, so the effective limit multiplies by
 *    the number of instances. Replacing this with a shared store (Redis or the
 *    database) is required before a multi-instance deployment.
 *  - The map is bounded. When it is full, expired entries are swept first and
 *    the entry closest to expiry is evicted, so attacker-chosen keys cannot grow
 *    memory without bound.
 *  - Keys are derived from the authenticated user id, never from a header.
 */

interface Window {
  count: number;
  resetAt: number;
}

export interface QuotaRule {
  limit: number;
  windowSeconds: number;
}

export const QUOTA_RULES = {
  /** Running a backtest is CPU-bound over stored candles. */
  backtest: { limit: 12, windowSeconds: 3600 },
  /** Operator-triggered global agent scans. */
  agentScan: { limit: 6, windowSeconds: 60 }
} as const satisfies Record<string, QuotaRule>;

const MAX_KEYS = 5_000;
const windows = new Map<string, Window>();

export interface QuotaVerdict {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

function sweep(now: number): void {
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }
}

function evictSoonestExpiry(): void {
  let oldestKey: string | null = null;
  let oldestReset = Number.POSITIVE_INFINITY;
  for (const [key, window] of windows) {
    if (window.resetAt < oldestReset) {
      oldestReset = window.resetAt;
      oldestKey = key;
    }
  }
  if (oldestKey !== null) windows.delete(oldestKey);
}

export function consumeQuota(
  scope: keyof typeof QUOTA_RULES,
  userId: string,
  nowMs: number = Date.now()
): QuotaVerdict {
  const rule: QuotaRule = QUOTA_RULES[scope];
  const key = `${scope}:${userId}`;
  const now = nowMs;

  let window = windows.get(key);
  if (!window || window.resetAt <= now) {
    window = { count: 0, resetAt: now + rule.windowSeconds * 1000 };
    windows.set(key, window);
  }

  if (window.count >= rule.limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((window.resetAt - now) / 1000))
    };
  }

  window.count += 1;

  if (windows.size > MAX_KEYS) {
    sweep(now);
    if (windows.size > MAX_KEYS) evictSoonestExpiry();
  }

  return {
    allowed: true,
    remaining: rule.limit - window.count,
    retryAfterSeconds: 0
  };
}

/** Test helper: forget every window. Never called by application code. */
export function resetQuotas(): void {
  windows.clear();
}
