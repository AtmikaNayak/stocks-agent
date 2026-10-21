/**
 * Cross-site request forgery protection for state-changing requests.
 *
 * Defence in depth, in order of how much it can be relied on:
 *
 *  1. `SameSite=Lax` on the session cookie (see session.ts). A cross-site POST
 *     does not carry the cookie at all, which blocks the classic attack for
 *     every browser that honours SameSite.
 *  2. `Sec-Fetch-Site` — sent by all current browsers on cross-origin requests.
 *     A literal `cross-site` value is refused outright.
 *  3. `Origin` (falling back to `Referer`) compared against the request's own
 *     host and an optional allowlist (`INVESTPILOT_ALLOWED_ORIGINS`).
 *
 * Requests with none of these headers (server-to-server clients, CLI tools, the
 * test suite) are allowed. That is a deliberate, documented limitation: such a
 * client is not a browser, so it cannot be a CSRF victim, and requiring a token
 * would break non-browser API use without adding protection. A browser always
 * sends at least one of these headers for a cross-origin request.
 */

export const ALLOWED_ORIGINS_ENV = 'INVESTPILOT_ALLOWED_ORIGINS';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export interface OriginVerdict {
  ok: boolean;
  reason?: string;
}

function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** Origin of a Referer URL, or null. */
function originFromReferer(referer: string): string | null {
  return normalizeOrigin(referer);
}

function configuredOrigins(): string[] {
  const raw = process.env[ALLOWED_ORIGINS_ENV];
  if (typeof raw !== 'string' || raw.trim() === '') return [];
  return raw
    .split(',')
    .map((entry) => normalizeOrigin(entry.trim()))
    .filter((entry): entry is string => entry !== null);
}

/** The origin this server believes it is serving, from the request itself. */
function requestOrigin(request: Request): string | null {
  const url = new URL(request.url);
  const host = request.headers.get('host') ?? url.host;
  if (!host) return null;
  const proto = request.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '');
  return normalizeOrigin(`${proto}://${host}`);
}

export function checkSameOrigin(request: Request): OriginVerdict {
  const method = request.method.toUpperCase();
  if (SAFE_METHODS.has(method)) return { ok: true };

  const secFetchSite = request.headers.get('sec-fetch-site');
  if (secFetchSite && secFetchSite.toLowerCase() === 'cross-site') {
    return { ok: false, reason: 'Cross-site state-changing requests are not allowed.' };
  }

  const originHeader = request.headers.get('origin');
  const refererHeader = request.headers.get('referer');

  const claimed = originHeader
    ? normalizeOrigin(originHeader)
    : refererHeader
      ? originFromReferer(refererHeader)
      : null;

  if (!claimed) {
    // No browser provenance headers at all: not a CSRF-capable caller.
    return { ok: true };
  }

  const allowed = new Set(configuredOrigins());
  const self = requestOrigin(request);
  if (self) allowed.add(self);

  if (allowed.has(claimed)) return { ok: true };

  return {
    ok: false,
    reason: 'The request origin is not allowed to perform this action.'
  };
}
