import { isIP } from 'node:net';

/**
 * Bounded, in-process rate limiting for sign-in attempts.
 *
 * Deployment limits — read this before relying on it:
 *
 *  - Storage is process memory. It is therefore **single-instance only**: two
 *    server processes (or two containers) each keep their own counters. There
 *    is no shared backend (no Redis etc.) in this repository, and none is
 *    introduced here. If the app is ever run multi-instance, this control must
 *    be replaced with a shared store.
 *  - The primary key is the *normalized email address*, which cannot be spoofed
 *    by request headers. IP based throttling is optional and off by default.
 *  - The key map is bounded (`maxKeys`). Expired entries are swept
 *    periodically, and when the map is full the entries closest to expiry are
 *    evicted, so attacker-controlled keys can never grow memory without bound.
 */

export interface RateLimitConfig {
  /** Failed attempts allowed per key inside the window. */
  maxFailures: number;
  /** Length of the sliding window / reset period. */
  windowMs: number;
  /** Hard cap on tracked keys per limiter. */
  maxKeys: number;
}

const MAX_FAILURES_DEFAULT = 10;
const WINDOW_SECONDS_DEFAULT = 15 * 60;
const MAX_KEYS_DEFAULT = 5000;

/** Sweep expired entries at most once per this interval (cheap, amortized). */
const SWEEP_INTERVAL_MS = 30_000;

export const LOGIN_MAX_FAILURES_ENV = 'INVESTPILOT_LOGIN_MAX_FAILURES';
export const LOGIN_WINDOW_SECONDS_ENV = 'INVESTPILOT_LOGIN_WINDOW_SECONDS';

function readBoundedInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

/** Login throttling configuration, clamped to sane bounds. */
export function loginRateLimitConfig(): RateLimitConfig {
  return {
    maxFailures: readBoundedInt(process.env[LOGIN_MAX_FAILURES_ENV], MAX_FAILURES_DEFAULT, 3, 100),
    windowMs:
      readBoundedInt(process.env[LOGIN_WINDOW_SECONDS_ENV], WINDOW_SECONDS_DEFAULT, 60, 86_400) * 1000,
    maxKeys: MAX_KEYS_DEFAULT
  };
}

interface Entry {
  count: number;
  resetAt: number;
}

export class FailureLimiter {
  private entries = new Map<string, Entry>();
  private nextSweepAt = 0;

  constructor(private readonly config: RateLimitConfig) {}

  get maxFailures(): number {
    return this.config.maxFailures;
  }

  get windowMs(): number {
    return this.config.windowMs;
  }

  size(): number {
    return this.entries.size;
  }

  /** Remaining seconds until the key's window resets (0 when not tracked). */
  retryAfterSeconds(key: string, now = Date.now()): number {
    const entry = this.entries.get(key);
    if (!entry || entry.resetAt <= now) return 0;
    return Math.ceil((entry.resetAt - now) / 1000);
  }

  isLimited(key: string, now = Date.now()): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;
    if (entry.resetAt <= now) {
      this.entries.delete(key);
      return false;
    }
    return entry.count >= this.config.maxFailures;
  }

  recordFailure(key: string, now = Date.now()): void {
    if (now >= this.nextSweepAt) this.sweep(now);

    const existing = this.entries.get(key);
    if (existing && existing.resetAt > now) {
      existing.count += 1;
      return;
    }

    // A brand new key needs room. Expired entries go first, then the entries
    // closest to expiry, so the map can never exceed maxKeys.
    if (!existing && this.entries.size >= this.config.maxKeys) {
      this.evictSoonest(now);
    }

    this.entries.set(key, { count: 1, resetAt: now + this.config.windowMs });
  }

  /** Forgets a key entirely (used after a successful sign-in). */
  reset(key: string): void {
    this.entries.delete(key);
  }

  /**
   * Drops every expired entry. Returns the number removed.
   * Exposed so tests can prove expiry actually reclaims memory.
   */
  prune(now = Date.now()): number {
    let removed = 0;
    for (const [key, entry] of this.entries) {
      if (entry.resetAt <= now) {
        this.entries.delete(key);
        removed += 1;
      }
    }
    this.nextSweepAt = now + SWEEP_INTERVAL_MS;
    return removed;
  }

  private sweep(now: number): void {
    this.prune(now);
  }

  /**
   * Evicts entries whose windows end soonest (the least remaining protective
   * value), leaving at least 10% headroom so eviction is not re-run for every
   * subsequent key.
   */
  private evictSoonest(now: number): void {
    const target = Math.max(1, Math.floor(this.config.maxKeys * 0.9));
    const ordered = [...this.entries.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
    for (const [key] of ordered) {
      if (this.entries.size <= target) break;
      this.entries.delete(key);
    }
  }

  clear(): void {
    this.entries.clear();
    this.nextSweepAt = 0;
  }
}

/* -------------------------------------------------------------------------- */
/* Proxy / client-IP handling                                                  */
/* -------------------------------------------------------------------------- */

export const TRUST_PROXY_ENV = 'INVESTPILOT_TRUST_PROXY';
export const TRUSTED_PROXY_HEADER_ENV = 'INVESTPILOT_TRUSTED_PROXY_HEADER';
export const DEFAULT_PROXY_HEADER = 'x-forwarded-for';

const HEADER_NAME_PATTERN = /^[a-z0-9-]{1,64}$/;

/**
 * Strict IP validation.
 *
 * `net.isIP` (a Node built-in — no new dependency) performs real address
 * parsing, so malformed octets (256, leading zeros), truncated quads, port
 * suffixes, bare hostnames, IPv6 typos and zone ids are all rejected.
 * Anything that is not a genuine address returns null and is ignored, which
 * means a forged header simply contributes no throttling identity.
 */
export function normalizeIpAddress(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const candidate = value.trim();
  if (candidate === '' || candidate.length > 45) return null;
  // A zone id ("fe80::1%eth0") is link-local scoped and never a client identity.
  if (candidate.includes('%')) return null;
  // Bracketed IPv6 ("[::1]") and host:port forms are not addresses.
  if (candidate.startsWith('[') || candidate.endsWith(']')) return null;

  const version = isIP(candidate);
  if (version === 4) return candidate;
  if (version === 6) return candidate.toLowerCase();
  return null;
}

/**
 * True only when the deployment explicitly declares that a reverse proxy
 * overwrites the forwarding header on every request.
 */
export function isProxyTrusted(): boolean {
  const raw = (process.env[TRUST_PROXY_ENV] ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

export function trustedProxyHeader(): string {
  const raw = (process.env[TRUSTED_PROXY_HEADER_ENV] ?? '').trim().toLowerCase();
  return HEADER_NAME_PATTERN.test(raw) ? raw : DEFAULT_PROXY_HEADER;
}

/**
 * Returns a client IP only when proxy trust is explicitly enabled AND the
 * configured header carries a plausible address. Otherwise null — arbitrary
 * client-supplied forwarding headers are never treated as identity.
 */
export function trustedClientIp(request: Request): string | null {
  if (!isProxyTrusted()) return null;

  const header = request.headers.get(trustedProxyHeader());
  if (!header) return null;

  // The trusted proxy overwrites the header with exactly one address. A comma
  // anywhere therefore means a chain (including a trailing `1.2.3.4,`), which
  // did not come through the configured proxy path, so it is ignored rather
  // than guessed at.
  if (header.includes(',')) return null;
  const parts = header.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length !== 1) return null;

  return normalizeIpAddress(parts[0]);
}

/* -------------------------------------------------------------------------- */
/* Login throttle                                                             */
/* -------------------------------------------------------------------------- */

export interface LoginAttempt {
  email: string;
  ip?: string | null;
  now?: number;
}

export interface LoginLimitVerdict {
  limited: boolean;
  retryAfterSeconds: number;
}

export class LoginThrottle {
  private readonly emailLimiter: FailureLimiter;
  private readonly ipLimiter: FailureLimiter;

  constructor(public readonly config: RateLimitConfig) {
    this.emailLimiter = new FailureLimiter(config);
    this.ipLimiter = new FailureLimiter(config);
  }

  static emailKey(email: string): string {
    return `email:${email.trim().toLowerCase()}`;
  }

  static ipKey(ip: string): string {
    return `ip:${ip}`;
  }

  evaluate(attempt: LoginAttempt): LoginLimitVerdict {
    const now = attempt.now ?? Date.now();
    const emailKey = LoginThrottle.emailKey(attempt.email);

    const emailRetry = this.emailLimiter.isLimited(emailKey, now)
      ? this.emailLimiter.retryAfterSeconds(emailKey, now)
      : 0;

    let ipRetry = 0;
    if (attempt.ip) {
      const ipKey = LoginThrottle.ipKey(attempt.ip);
      if (this.ipLimiter.isLimited(ipKey, now)) {
        ipRetry = this.ipLimiter.retryAfterSeconds(ipKey, now);
      }
    }

    const retryAfterSeconds = Math.max(emailRetry, ipRetry);
    return { limited: retryAfterSeconds > 0, retryAfterSeconds };
  }

  recordFailure(attempt: LoginAttempt): void {
    const now = attempt.now ?? Date.now();
    this.emailLimiter.recordFailure(LoginThrottle.emailKey(attempt.email), now);
    if (attempt.ip) {
      this.ipLimiter.recordFailure(LoginThrottle.ipKey(attempt.ip), now);
    }
  }

  /** Clears the counters for a successful sign-in. */
  reset(attempt: LoginAttempt): void {
    this.emailLimiter.reset(LoginThrottle.emailKey(attempt.email));
    if (attempt.ip) this.ipLimiter.reset(LoginThrottle.ipKey(attempt.ip));
  }

  trackedKeys(): number {
    return this.emailLimiter.size() + this.ipLimiter.size();
  }

  prune(now = Date.now()): number {
    return this.emailLimiter.prune(now) + this.ipLimiter.prune(now);
  }

  clear(): void {
    this.emailLimiter.clear();
    this.ipLimiter.clear();
  }
}

let throttle: LoginThrottle | null = null;
let throttleSignature = '';

function currentSignature(): string {
  const config = loginRateLimitConfig();
  return `${config.maxFailures}:${config.windowMs}:${config.maxKeys}`;
}

/** The process-wide login throttle, rebuilt if its env config changed. */
export function getLoginThrottle(): LoginThrottle {
  const signature = currentSignature();
  if (!throttle || signature !== throttleSignature) {
    throttle = new LoginThrottle(loginRateLimitConfig());
    throttleSignature = signature;
  }
  return throttle;
}

/** Test helper: clears every tracked key. */
export function resetLoginRateLimits(): void {
  getLoginThrottle().clear();
}
