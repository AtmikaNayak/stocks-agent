import { NextResponse } from 'next/server';
import db from '@/db';
import { readSessionCookie, verifySessionToken } from './session';

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

/** Resolves the caller from the signed session cookie, or null. */
export function getSessionUser(request: Request): SessionUser | null {
  const token = readSessionCookie(request);
  if (!token) return null;

  const payload = verifySessionToken(token);
  if (!payload) return null;

  // The session carries an identity claim, but the user must still exist.
  const user = db.queryOne<SessionUser>('SELECT id, email, name FROM users WHERE id = ?', [
    payload.userId
  ]);
  return user ?? null;
}

/** Requires a valid session; otherwise a 401 response is returned. */
export function requireAuth(request: Request): Guarded<SessionUser> {
  const user = getSessionUser(request);
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
