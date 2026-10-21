import { NextResponse } from 'next/server';
import db from '@/db';
import { readSessionCookie, verifySessionToken } from './session';
import { checkSameOrigin } from './csrf';

/**
 * One shared authorization guard for every API route.
 *
 * Identity always comes from the verified session cookie. Client-supplied
 * identifiers (request bodies, `x-user-id`, query parameters) are never used
 * to decide who the caller is.
 */

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

interface SessionLookup {
  id: string;
  email: string;
  name: string;
  is_disabled: number;
  token_version: number;
}

export interface OwnedPortfolio {
  id: string;
  user_id: string;
  type: 'REAL' | 'VIRTUAL';
  name: string;
}

export type Guarded<T> = { ok: true; value: T } | { ok: false; response: NextResponse };

export function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * Explains why a session was rejected. Never returned to the client verbatim —
 * the API answers a uniform 401 so the reason cannot be used to probe accounts.
 */
export type SessionRejection = 'NO_COOKIE' | 'MALFORMED' | 'UNKNOWN_USER' | 'DISABLED' | 'REVOKED';

export interface SessionResolution {
  user: SessionUser | null;
  rejection: SessionRejection | null;
}

/**
 * Resolves the caller from the signed session cookie.
 *
 * Three independent conditions must hold:
 *   1. the token is well-formed, correctly signed and unexpired;
 *   2. the account exists and is not disabled;
 *   3. the token's revocation counter matches the account's current one.
 *
 * (3) is what makes logout / password change / account disable actually take
 * effect server-side rather than merely clearing a browser cookie.
 */
export function resolveSession(request: Request): SessionResolution {
  const token = readSessionCookie(request);
  if (!token) return { user: null, rejection: 'NO_COOKIE' };

  const payload = verifySessionToken(token);
  if (!payload) return { user: null, rejection: 'MALFORMED' };

  const user = db.queryOne<SessionLookup>(
    `SELECT u.id, u.email, u.name, u.is_disabled,
            COALESCE(c.token_version, 0) AS token_version
     FROM users u
     LEFT JOIN user_credentials c ON c.user_id = u.id
     WHERE u.id = ?`,
    [payload.userId]
  );

  if (!user) return { user: null, rejection: 'UNKNOWN_USER' };
  if (user.is_disabled === 1) return { user: null, rejection: 'DISABLED' };
  if (Number(user.token_version) !== payload.tokenVersion) {
    return { user: null, rejection: 'REVOKED' };
  }

  return { user: { id: user.id, email: user.email, name: user.name }, rejection: null };
}

/** Resolves the caller from the signed session cookie, or null. */
export function getSessionUser(request: Request): SessionUser | null {
  return resolveSession(request).user;
}

/**
 * Rejects a cross-site state-changing request. Returns a 403 response when the
 * request's browser provenance contradicts same-origin use.
 */
export function requireSameOrigin(request: Request): Guarded<null> {
  const verdict = checkSameOrigin(request);
  if (!verdict.ok) {
    return { ok: false, response: jsonError(verdict.reason ?? 'Cross-site request rejected.', 403) };
  }
  return { ok: true, value: null };
}

/** Requires a valid session; otherwise a 401 response is returned. */
export function requireAuth(request: Request): Guarded<SessionUser> {
  const { user } = resolveSession(request);
  if (!user) return { ok: false, response: jsonError('Authentication required.', 401) };
  return { ok: true, value: user };
}

/** Requires a non-empty id string; returns a 400 response otherwise. */
export function requireId(value: unknown, field = 'id'): Guarded<string> {
  if (typeof value !== 'string' || value.trim() === '' || value.length > 128) {
    return { ok: false, response: jsonError(`${field} is required.`, 400) };
  }
  return { ok: true, value: value.trim() };
}

/**
 * Looks up a portfolio that belongs to this user. A portfolio owned by someone
 * else is indistinguishable from a missing one (404), so ids cannot be probed.
 */
export function requireOwnedPortfolio(
  userId: string,
  portfolioId: unknown
): Guarded<OwnedPortfolio> {
  const id = requireId(portfolioId, 'portfolioId');
  if (!id.ok) return id;

  const portfolio = db.queryOne<OwnedPortfolio>(
    'SELECT id, user_id, type, name FROM portfolios WHERE id = ? AND user_id = ?',
    [id.value, userId]
  );
  if (!portfolio) return { ok: false, response: jsonError('Portfolio not found.', 404) };
  return { ok: true, value: portfolio };
}

/** The user's default portfolio (virtual first) when no id was supplied. */
export function defaultPortfolioFor(userId: string): OwnedPortfolio | null {
  return (
    db.queryOne<OwnedPortfolio>(
      `SELECT id, user_id, type, name FROM portfolios
       WHERE user_id = ?
       ORDER BY CASE type WHEN 'VIRTUAL' THEN 0 ELSE 1 END, created_at ASC
       LIMIT 1`,
      [userId]
    ) ?? null
  );
}

export function requirePortfolioForRequest(
  userId: string,
  portfolioId: unknown
): Guarded<OwnedPortfolio> {
  if (portfolioId === undefined || portfolioId === null || portfolioId === '') {
    const fallback = defaultPortfolioFor(userId);
    if (!fallback) return { ok: false, response: jsonError('Portfolio not found.', 404) };
    return { ok: true, value: fallback };
  }
  return requireOwnedPortfolio(userId, portfolioId);
}
