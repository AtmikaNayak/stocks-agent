import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { createHmac } from 'crypto';
import { GET as getPortfolios } from '../src/app/api/portfolios/route';
import { GET as getOrders } from '../src/app/api/orders/route';
import { GET as getProposals } from '../src/app/api/proposals/route';
import { GET as getSettings } from '../src/app/api/settings/route';
import { GET as getBroker } from '../src/app/api/broker/route';
import { GET as getMarket } from '../src/app/api/market/route';
import { GET as getAgents } from '../src/app/api/agents/route';
import { GET as getBacktest } from '../src/app/api/backtest/route';
import { GET as getSystem } from '../src/app/api/system/route';
import { GET as getExplainability } from '../src/app/api/explainability/route';
import { GET as getSession } from '../src/app/api/auth/session/route';
import { POST as postLogin, resetLoginRateLimits } from '../src/app/api/auth/login/route';
import { POST as postLogout } from '../src/app/api/auth/logout/route';
import { SESSION_COOKIE, issueSessionToken } from '../src/lib/auth/session';
import { USER_A, USER_B, ensureAllFixtures, sessionCookie } from './helpers/auth-fixtures';

const BASE = 'http://localhost';

const PROTECTED_GET_ROUTES: Array<[string, (request: Request) => Promise<Response>]> = [
  ['/api/portfolios', getPortfolios],
  ['/api/orders', getOrders],
  ['/api/proposals', getProposals],
  ['/api/settings', getSettings],
  ['/api/broker', getBroker],
  ['/api/market', getMarket],
  ['/api/agents', getAgents],
  ['/api/backtest', getBacktest],
  ['/api/system', getSystem],
  ['/api/explainability', getExplainability]
];

function loginRequest(email: string, password: string, ip = '203.0.113.7') {
  return new Request(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({ email, password })
  });
}

function cookieFrom(response: Response): string {
  const setCookie = response.headers.get('set-cookie') ?? '';
  return setCookie.split(';')[0] ?? '';
}

function withCookie(cookie: string, path = '/api/portfolios'): Request {
  return new Request(`${BASE}${path}`, { headers: { cookie } });
}

function signToken(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const secret = process.env.INVESTPILOT_SESSION_SECRET!;
  const signature = createHmac('sha256', secret).update(`v1.${body}`).digest('base64url');
  return `v1.${body}.${signature}`;
}

beforeAll(() => {
  ensureAllFixtures();
});

beforeEach(() => {
  resetLoginRateLimits();
});

describe('authentication boundary', () => {
  it('rejects every protected GET route without a session', async () => {
    for (const [path, handler] of PROTECTED_GET_ROUTES) {
      const response = await handler(new Request(`${BASE}${path}`));
      expect(response.status, `${path} should require authentication`).toBe(401);
    }
  });

  it('rejects unauthenticated writes', async () => {
    const { POST: postOrders } = await import('../src/app/api/orders/route');
    const response = await postOrders(
      new Request(`${BASE}/api/orders`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          portfolioId: USER_A.portfolioId,
          assetId: 'ast_itc',
          side: 'BUY',
          quantity: 1
        })
      })
    );
    expect(response.status).toBe(401);
  });

  it('signs in with a valid password and returns an HTTP-only cookie', async () => {
    const response = await postLogin(loginRequest(USER_A.email, USER_A.password));
    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload.user.id).toBe(USER_A.id);
    expect(JSON.stringify(payload)).not.toContain(USER_A.password);
    expect(JSON.stringify(payload)).not.toMatch(/password_hash|passwordHash|scrypt\$/);

    const setCookie = response.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain(`${SESSION_COOKIE}=`);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Path=/');
    expect(setCookie).toMatch(/Max-Age=\d+/);

    const sessionResponse = await getSession(withCookie(cookieFrom(response), '/api/auth/session'));
    expect(sessionResponse.status).toBe(200);
    expect((await sessionResponse.json()).user.id).toBe(USER_A.id);
  });

  it('reaches the caller’s own virtual portfolio after signing in', async () => {
    const login = await postLogin(loginRequest(USER_A.email, USER_A.password));
    const cookie = cookieFrom(login);

    const response = await getPortfolios(withCookie(cookie));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.portfolios.map((p: any) => p.id)).toContain(USER_A.portfolioId);
    expect(body.portfolios.every((p: any) => p.type === 'VIRTUAL' || p.type === 'REAL')).toBe(true);
  });

  it('rejects a wrong password and an unknown account with the same error', async () => {
    const wrong = await postLogin(loginRequest(USER_A.email, 'definitely-not-the-password'));
    expect(wrong.status).toBe(401);
    const wrongBody = await wrong.json();

    const unknown = await postLogin(loginRequest('nobody@test.invalid', 'definitely-not-the-password'));
    expect(unknown.status).toBe(401);
    const unknownBody = await unknown.json();

    expect(wrongBody.error).toBe(unknownBody.error);
    expect(wrong.headers.get('set-cookie')).toBeNull();
  });

  it('rejects accounts that have no provisioned credential', async () => {
    const response = await postLogin(loginRequest('investor@investpilot.ai', 'any-password-at-all'));
    expect(response.status).toBe(401);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('validates the login payload', async () => {
    const missing = await postLogin(
      new Request(`${BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: USER_A.email })
      })
    );
    expect(missing.status).toBe(400);

    const badJson = await postLogin(
      new Request(`${BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{not json'
      })
    );
    expect(badJson.status).toBe(400);
  });

  it('ignores forged identity headers and body fields', async () => {
    const response = await getPortfolios(
      new Request(`${BASE}/api/portfolios`, {
        headers: { cookie: sessionCookie(USER_A.id), 'x-user-id': USER_B.id }
      })
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    const ids = body.portfolios.map((p: any) => p.id);
    expect(ids).toContain(USER_A.portfolioId);
    expect(ids).not.toContain(USER_B.portfolioId);

    // A userId in a request body is rejected rather than trusted.
    const { POST: postBroker } = await import('../src/app/api/broker/route');
    const brokerResponse = await postBroker(
      new Request(`${BASE}/api/broker`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: sessionCookie(USER_A.id) },
        body: JSON.stringify({ action: 'disconnect', userId: USER_B.id })
      })
    );
    expect(brokerResponse.status).toBe(400);
  });

  it('rejects expired, tampered, malformed and unknown-user sessions', async () => {
    const valid = issueSessionToken(USER_A.id).token;
    const nowSeconds = Math.floor(Date.now() / 1000);

    const expired = signToken({ v: 1, sub: USER_A.id, iat: nowSeconds - 7200, exp: nowSeconds - 3600 });
    const future = signToken({ v: 1, sub: USER_A.id, iat: nowSeconds + 3600, exp: nowSeconds + 7200 });
    const noSubject = signToken({ v: 1, sub: '', iat: nowSeconds, exp: nowSeconds + 3600 });
    const wrongVersion = signToken({ v: 2, sub: USER_A.id, iat: nowSeconds, exp: nowSeconds + 3600 });
    const unknownUser = issueSessionToken('usr_does_not_exist').token;

    const [payload, signature] = valid.split('.').slice(1);
    const tamperedBody = Buffer.from(
      JSON.stringify({ v: 1, sub: USER_B.id, iat: nowSeconds, exp: nowSeconds + 3600 })
    ).toString('base64url');
    const tampered = `v1.${tamperedBody}.${signature}`;
    const badSignature = `v1.${payload}.${signature.slice(0, -2)}AA`;

    const invalidTokens = [
      '',
      'garbage',
      'v1.only-two-parts',
      'v2.abc.def',
      expired,
      future,
      noSubject,
      wrongVersion,
      tampered,
      badSignature,
      unknownUser
    ];

    for (const token of invalidTokens) {
      const response = await getPortfolios(
        new Request(`${BASE}/api/portfolios`, { headers: { cookie: `${SESSION_COOKIE}=${token}` } })
      );
      expect(response.status, `token should be rejected: ${token.slice(0, 24)}`).toBe(401);
    }
  });

  it('clears the cookie on logout', async () => {
    const login = await postLogin(loginRequest(USER_A.email, USER_A.password));
    const cookie = cookieFrom(login);

    const logout = await postLogout(
      new Request(`${BASE}/api/auth/logout`, { method: 'POST', headers: { cookie } })
    );
    expect(logout.status).toBe(200);
    const setCookie = logout.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain(`${SESSION_COOKIE}=`);
    expect(setCookie).toContain('Max-Age=0');
    expect(setCookie).toContain('HttpOnly');

    // The cleared cookie carries no usable session.
    const after = await getPortfolios(
      new Request(`${BASE}/api/portfolios`, { headers: { cookie: `${SESSION_COOKIE}=` } })
    );
    expect(after.status).toBe(401);
  });

  it('rate-limits repeated failed sign-ins', async () => {
    let lastStatus = 0;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const response = await postLogin(loginRequest(USER_B.email, 'wrong-password-value'));
      lastStatus = response.status;
    }
    expect(lastStatus).toBe(429);
  });
});
