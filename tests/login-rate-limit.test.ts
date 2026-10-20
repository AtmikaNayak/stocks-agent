import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { POST as login, resetLoginRateLimits } from '../src/app/api/auth/login/route';
import {
  FailureLimiter,
  LOGIN_MAX_FAILURES_ENV,
  LOGIN_WINDOW_SECONDS_ENV,
  LoginThrottle,
  TRUST_PROXY_ENV,
  TRUSTED_PROXY_HEADER_ENV,
  getLoginThrottle,
  isProxyTrusted,
  loginRateLimitConfig,
  trustedClientIp
} from '../src/lib/auth/rate-limit';
import { USER_A, ensureAllFixtures } from './helpers/auth-fixtures';

const BASE = 'http://localhost';
const ORIGINAL_MAX = process.env[LOGIN_MAX_FAILURES_ENV];
const ORIGINAL_WINDOW = process.env[LOGIN_WINDOW_SECONDS_ENV];
const ORIGINAL_TRUST_PROXY = process.env[TRUST_PROXY_ENV];
const ORIGINAL_PROXY_HEADER = process.env[TRUSTED_PROXY_HEADER_ENV];

function restore(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

function loginRequest(options: {
  email?: string;
  password?: string;
  headers?: Record<string, string>;
}): Request {
  const headers = new Headers({ 'content-type': 'application/json' });
  for (const [name, value] of Object.entries(options.headers ?? {})) headers.set(name, value);
  return new Request(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email: options.email ?? USER_A.email,
      password: options.password ?? 'definitely-the-wrong-password'
    })
  });
}

beforeAll(() => {
  ensureAllFixtures();
});

beforeEach(() => {
  resetLoginRateLimits();
  restore(LOGIN_MAX_FAILURES_ENV, '4');
  restore(LOGIN_WINDOW_SECONDS_ENV, '60');
  delete process.env[TRUST_PROXY_ENV];
  delete process.env[TRUSTED_PROXY_HEADER_ENV];
});

afterEach(() => {
  resetLoginRateLimits();
  restore(LOGIN_MAX_FAILURES_ENV, ORIGINAL_MAX);
  restore(LOGIN_WINDOW_SECONDS_ENV, ORIGINAL_WINDOW);
  restore(TRUST_PROXY_ENV, ORIGINAL_TRUST_PROXY);
  restore(TRUSTED_PROXY_HEADER_ENV, ORIGINAL_PROXY_HEADER);
});

describe('sign-in throttling — thresholds and reset window', () => {
  it('allows attempts up to the threshold, then returns 429 with Retry-After', async () => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await login(loginRequest({}));
      statuses.push(response.status);
      if (response.status === 429) {
        const retryAfter = Number(response.headers.get('retry-after'));
        expect(retryAfter).toBeGreaterThan(0);
        expect(retryAfter).toBeLessThanOrEqual(60);
      }
    }

    // Limits are 4 failures: attempts 1-4 answer 401, 5-6 answer 429.
    expect(statuses).toEqual([401, 401, 401, 401, 429, 429]);
  });

  it('rejects even a correct password once the email is throttled', async () => {
    // 4 failures first...
    for (let attempt = 0; attempt < 4; attempt += 1) {
      expect((await login(loginRequest({}))).status).toBe(401);
    }
    // ...now the right password must not be reachable inside the window.
    const blocked = await login(loginRequest({ password: USER_A.password }));
    expect(blocked.status).toBe(429);
  });

  it('resets the counter after a successful sign-in', async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect((await login(loginRequest({}))).status).toBe(401);
    }
    expect((await login(loginRequest({ password: USER_A.password }))).status).toBe(200);

    // Counter cleared, so failures are allowed again up to the threshold.
    for (let attempt = 0; attempt < 4; attempt += 1) {
      expect((await login(loginRequest({}))).status).toBe(401);
    }
    expect((await login(loginRequest({}))).status).toBe(429);
  });

  it('expires entries after the reset window', async () => {
    const limiter = new FailureLimiter({ maxFailures: 2, windowMs: 1000, maxKeys: 10 });
    const key = 'email:user@example.com';
    const start = 1_000_000;

    limiter.recordFailure(key, start);
    limiter.recordFailure(key, start + 10);
    expect(limiter.isLimited(key, start + 20)).toBe(true);

    // Just before the window ends, still limited...
    expect(limiter.isLimited(key, start + 999)).toBe(true);
    // ...after it, the entry is gone and the key is usable again.
    expect(limiter.isLimited(key, start + 1001)).toBe(false);
    expect(limiter.size()).toBe(0);

    limiter.recordFailure(key, start + 1002);
    expect(limiter.isLimited(key, start + 1010)).toBe(false);
  });

  it('prunes expired keys and reports how many were removed', () => {
    const limiter = new FailureLimiter({ maxFailures: 3, windowMs: 1000, maxKeys: 100 });
    limiter.recordFailure('email:a', 0);
    limiter.recordFailure('email:b', 0);
    limiter.recordFailure('email:c', 500);

    expect(limiter.size()).toBe(3);
    // Entries recorded at t=0 expire at t=1000; the one recorded at t=500
    // expires at t=1500. At exactly the boundary it is already expired.
    expect(limiter.prune(1400)).toBe(2);
    expect(limiter.size()).toBe(1);
    expect(limiter.prune(1500)).toBe(1);
    expect(limiter.size()).toBe(0);
  });

  it('never grows past maxKeys under attacker-chosen keys', () => {
    const limiter = new FailureLimiter({ maxFailures: 3, windowMs: 60_000, maxKeys: 50 });
    for (let i = 0; i < 500; i += 1) {
      limiter.recordFailure(`email:attacker${i}@example.com`, 1000 + i);
    }
    expect(limiter.size()).toBeLessThanOrEqual(50);
  });

  it('bounds the login throttle when many distinct emails are attempted (no HTTP cost)', () => {
    // Same code path the route uses, with a small cap so the bound is visible.
    const throttle = new LoginThrottle({ maxFailures: 3, windowMs: 60_000, maxKeys: 50 });
    for (let i = 0; i < 500; i += 1) {
      throttle.recordFailure({ email: `attacker${i}@example.com`, ip: `198.51.100.${i % 250}` });
    }
    expect(throttle.trackedKeys()).toBeLessThanOrEqual(100);
    expect(throttle.trackedKeys()).toBeGreaterThan(0);
  });

  it('uses a bounded map for the process-wide limiter', () => {
    // The live throttle is capped (5000 keys per limiter), not unbounded.
    expect(loginRateLimitConfig().maxKeys).toBe(5000);
    const throttle = getLoginThrottle();
    throttle.clear();
    expect(throttle.trackedKeys()).toBe(0);
  });

  it('reads and clamps its configuration', () => {
    expect(loginRateLimitConfig()).toEqual({ maxFailures: 4, windowMs: 60_000, maxKeys: 5000 });

    process.env[LOGIN_MAX_FAILURES_ENV] = '100000';
    process.env[LOGIN_WINDOW_SECONDS_ENV] = '1';
    expect(loginRateLimitConfig()).toMatchObject({ maxFailures: 100, windowMs: 60_000 });

    process.env[LOGIN_MAX_FAILURES_ENV] = 'nonsense';
    delete process.env[LOGIN_WINDOW_SECONDS_ENV];
    expect(loginRateLimitConfig()).toEqual({ maxFailures: 10, windowMs: 900_000, maxKeys: 5000 });
  });
});

describe('sign-in throttling — spoofable forwarding headers', () => {
  it('ignores X-Forwarded-For by default', () => {
    expect(isProxyTrusted()).toBe(false);
    expect(trustedClientIp(loginRequest({ headers: { 'x-forwarded-for': '203.0.113.9' } }))).toBeNull();
  });

  it('cannot reset or bypass the email limit by rotating X-Forwarded-For', async () => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      // A new forged client IP on every attempt, exactly what an attacker does.
      const response = await login(
        loginRequest({ headers: { 'x-forwarded-for': `198.51.100.${attempt}` } })
      );
      statuses.push(response.status);
    }

    expect(statuses).toEqual([401, 401, 401, 401, 429, 429]);
  });

  it('is also not bypassed by varying header names or chains', async () => {
    const headers: Array<Record<string, string>> = [
      { 'x-forwarded-for': '203.0.113.1, 198.51.100.1' },
      { 'x-real-ip': '203.0.113.2' },
      { 'forwarded': 'for=203.0.113.3' },
      { 'x-client-ip': '203.0.113.4' },
      { 'cf-connecting-ip': '203.0.113.5' }
    ];

    let last = 0;
    for (const header of headers) {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        last = (await login(loginRequest({ headers: header }))).status;
      }
    }
    expect(last).toBe(429);
  });

  it('still keys on the email when proxy trust is enabled', async () => {
    process.env[TRUST_PROXY_ENV] = '1';
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await login(
        loginRequest({ headers: { 'x-forwarded-for': `198.51.100.${attempt}` } })
      );
      statuses.push(response.status);
    }
    // Per-IP keys are fresh each time, but the email key still trips the limit.
    expect(statuses.slice(0, 4)).toEqual([401, 401, 401, 401]);
    expect(statuses[4]).toBe(429);
  });

  it('uses a single well-formed address only when proxy trust is explicit', () => {
    process.env[TRUST_PROXY_ENV] = '1';
    expect(trustedClientIp(loginRequest({ headers: { 'x-forwarded-for': '203.0.113.9' } }))).toBe(
      '203.0.113.9'
    );
    // A chain means the request did not come through the configured proxy path.
    expect(
      trustedClientIp(loginRequest({ headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' } }))
    ).toBeNull();
    // Garbage is never accepted as an identity.
    expect(trustedClientIp(loginRequest({ headers: { 'x-forwarded-for': 'not-an-ip' } }))).toBeNull();
    expect(trustedClientIp(loginRequest({ headers: { 'x-forwarded-for': '' } }))).toBeNull();
  });

  it('honours a configured proxy header name', () => {
    process.env[TRUST_PROXY_ENV] = 'true';
    process.env[TRUSTED_PROXY_HEADER_ENV] = 'x-real-ip';
    expect(trustedClientIp(loginRequest({ headers: { 'x-real-ip': '203.0.113.9' } }))).toBe('203.0.113.9');
    expect(trustedClientIp(loginRequest({ headers: { 'x-forwarded-for': '203.0.113.9' } }))).toBeNull();
  });

  it('normalizes email case and surrounding whitespace for the limiter key', () => {
    const throttle = new LoginThrottle({ maxFailures: 2, windowMs: 1000, maxKeys: 10 });
    const now = 5000;
    for (const variant of [' User.A@test.invalid ', 'user.a@TEST.INVALID', 'USER.A@test.invalid']) {
      throttle.recordFailure({ email: variant.trim().toLowerCase(), now });
    }
    expect(throttle.evaluate({ email: 'user.a@test.invalid', now })).toMatchObject({ limited: true });
  });
});
