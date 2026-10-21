import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import db from '../src/db';
import { GET as getPortfolios } from '../src/app/api/portfolios/route';
import { GET as getSession } from '../src/app/api/auth/session/route';
import { POST as postLogout } from '../src/app/api/auth/logout/route';
import { POST as postLogin, resetLoginRateLimits } from '../src/app/api/auth/login/route';
import { POST as postOrder } from '../src/app/api/orders/route';
import { POST as postProposal } from '../src/app/api/proposals/route';
import { SESSION_COOKIE, issueSessionToken } from '../src/lib/auth/session';
import { checkSameOrigin } from '../src/lib/auth/csrf';
import { USER_A, USER_B, ensureAllFixtures, jsonRequest, sessionCookie } from './helpers/auth-fixtures';

const BASE = 'http://localhost';

function cookieHeader(token: string) {
  return `${SESSION_COOKIE}=${token}`;
}

function currentTokenVersion(userId: string): number {
  return Number(
    db.queryOne<{ token_version: number }>(
      'SELECT COALESCE(token_version, 0) AS token_version FROM user_credentials WHERE user_id = ?',
      [userId]
    )?.token_version ?? 0
  );
}

beforeAll(() => {
  ensureAllFixtures();
});

beforeEach(() => {
  resetLoginRateLimits();
});

describe('server-side session revocation', () => {
  it('rejects a token whose revocation counter is stale', async () => {
    const token = issueSessionToken(USER_A.id, Date.now(), currentTokenVersion(USER_A.id)).token;
    const request = () =>
      getPortfolios(
        new Request(`${BASE}/api/portfolios`, { headers: { cookie: cookieHeader(token) } })
      );

    // Still valid before the bump.
    expect((await request()).status).toBe(200);

    db.execute('UPDATE user_credentials SET token_version = token_version + 1 WHERE user_id = ?', [
      USER_A.id
    ]);
    // The very same cookie is now refused, without touching the browser.
    expect((await request()).status).toBe(401);
  });

  it('revokes every session for the account on logout, not just the caller cookie', async () => {
    const first = issueSessionToken(USER_A.id, Date.now(), currentTokenVersion(USER_A.id)).token;
    const second = issueSessionToken(USER_A.id, Date.now(), currentTokenVersion(USER_A.id)).token;

    const logout = await postLogout(
      new Request(`${BASE}/api/auth/logout`, {
        method: 'POST',
        headers: { cookie: cookieHeader(first) }
      })
    );
    expect(logout.status).toBe(200);

    for (const token of [first, second]) {
      const response = await getPortfolios(
        new Request(`${BASE}/api/portfolios`, { headers: { cookie: cookieHeader(token) } })
      );
      expect(response.status, 'all previously issued sessions must be revoked').toBe(401);
    }
  });

  it('refuses a disabled account even with an otherwise valid session', async () => {
    const token = issueSessionToken(USER_A.id, Date.now(), currentTokenVersion(USER_A.id)).token;
    const request = () =>
      getPortfolios(
        new Request(`${BASE}/api/portfolios`, { headers: { cookie: cookieHeader(token) } })
      );

    expect((await request()).status).toBe(200);

    db.execute('UPDATE users SET is_disabled = 1 WHERE id = ?', [USER_A.id]);
    try {
      expect((await request()).status).toBe(401);
    } finally {
      db.execute('UPDATE users SET is_disabled = 0 WHERE id = ?', [USER_A.id]);
    }
  });

  it('refuses a token that carries no revocation counter', async () => {
    const { createHmac } = await import('crypto');
    const nowSeconds = Math.floor(Date.now() / 1000);
    const body = Buffer.from(
      JSON.stringify({ v: 1, sub: USER_A.id, iat: nowSeconds, exp: nowSeconds + 3600 })
    ).toString('base64url');
    const signature = createHmac('sha256', process.env.INVESTPILOT_SESSION_SECRET!)
      .update(`v1.${body}`)
      .digest('base64url');

    const response = await getPortfolios(
      new Request(`${BASE}/api/portfolios`, {
        headers: { cookie: cookieHeader(`v1.${body}.${signature}`) }
      })
    );
    expect(response.status).toBe(401);
  });

  it('refuses a disabled account at the login endpoint and issues no cookie', async () => {
    db.execute('UPDATE users SET is_disabled = 1 WHERE id = ?', [USER_A.id]);
    try {
      const response = await postLogin(
        new Request(`${BASE}/api/auth/login`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: USER_A.email, password: USER_A.password })
        })
      );
      expect(response.status).toBe(401);
      expect(response.headers.get('set-cookie')).toBeNull();
    } finally {
      db.execute('UPDATE users SET is_disabled = 0 WHERE id = ?', [USER_A.id]);
    }
  });

  it('does not reveal why a session was refused', async () => {
    const revoked = issueSessionToken(USER_A.id, Date.now(), 999).token;
    const malformed = 'v1.not-a-token.nope';

    const [a, b] = await Promise.all([
      getSession(new Request(`${BASE}/api/auth/session`, { headers: { cookie: cookieHeader(revoked) } })),
      getSession(new Request(`${BASE}/api/auth/session`, { headers: { cookie: cookieHeader(malformed) } }))
    ]);

    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(await a.json()).toEqual(await b.json());
  });
});

describe('cross-site request forgery protection', () => {
  it('rejects a cross-site state-changing request from a browser', async () => {
    const response = await postOrder(
      new Request(`${BASE}/api/orders`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: sessionCookie(USER_A.id),
          origin: 'https://evil.example',
          'sec-fetch-site': 'cross-site'
        },
        body: JSON.stringify({
          portfolioId: USER_A.portfolioId,
          assetId: 'ast_itc',
          side: 'BUY',
          quantity: 1
        })
      })
    );
    expect(response.status).toBe(403);
  });

  it('rejects a mismatched Origin even without Sec-Fetch-Site', async () => {
    const response = await postProposal(
      new Request(`${BASE}/api/proposals`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: sessionCookie(USER_B.id),
          origin: 'https://evil.example'
        },
        body: JSON.stringify({ action: 'respond', proposalId: 'anything', decision: 'APPROVE' })
      })
    );
    expect(response.status).toBe(403);
  });

  it('allows a same-origin browser request through to the handler', async () => {
    const response = await postOrder(
      new Request(`${BASE}/api/orders`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: sessionCookie(USER_A.id),
          origin: BASE,
          'sec-fetch-site': 'same-origin'
        },
        body: JSON.stringify({
          portfolioId: USER_A.portfolioId,
          assetId: 'ast_itc',
          side: 'BUY',
          quantity: 0
        })
      })
    );
    // Reaches validation (400) instead of being blocked by CSRF (403).
    expect(response.status).toBe(400);
  });

  it('never blocks safe methods', () => {
    const verdict = checkSameOrigin(
      new Request(`${BASE}/api/portfolios`, {
        headers: { 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' }
      })
    );
    expect(verdict.ok).toBe(true);
  });

  it('honours an explicitly allowed origin', () => {
    process.env.INVESTPILOT_ALLOWED_ORIGINS = 'https://preview.example';
    try {
      const verdict = checkSameOrigin(
        new Request(`${BASE}/api/orders`, {
          method: 'POST',
          headers: { origin: 'https://preview.example' }
        })
      );
      expect(verdict.ok).toBe(true);
    } finally {
      delete process.env.INVESTPILOT_ALLOWED_ORIGINS;
    }
  });
});

describe('mutating request hygiene', () => {
  it('requires a JSON content type', async () => {
    const response = await postOrder(
      new Request(`${BASE}/api/orders`, {
        method: 'POST',
        headers: { 'content-type': 'text/plain', cookie: sessionCookie(USER_A.id) },
        body: 'portfolioId=x'
      })
    );
    expect(response.status).toBe(415);
  });

  it('rejects an oversized body instead of parsing it', async () => {
    const response = await postOrder(
      new Request(`${BASE}/api/orders`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: sessionCookie(USER_A.id) },
        body: JSON.stringify({ padding: 'x'.repeat(20_000) })
      })
    );
    expect(response.status).toBe(413);
  });

  it('rejects conflicting idempotency keys', async () => {
    const response = await postOrder(
      new Request(`${BASE}/api/orders`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: sessionCookie(USER_A.id),
          'idempotency-key': 'header-key-1234'
        },
        body: JSON.stringify({
          portfolioId: USER_A.portfolioId,
          assetId: 'ast_itc',
          side: 'BUY',
          quantity: 1,
          idempotencyKey: 'body-key-1234'
        })
      })
    );
    expect(response.status).toBe(400);
  });
});
