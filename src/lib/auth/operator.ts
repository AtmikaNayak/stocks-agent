import { Guarded, SessionUser, jsonError, requireAuth } from './guard';

/**
 * Operator (system administrator) authorization.
 *
 * Some actions affect the whole deployment: triggering a named scheduled job,
 * running every job, or starting a global agent scan. Those are restricted to
 * operator accounts.
 *
 * The ONLY source of operator identity is the environment variable
 * INVESTPILOT_SYSTEM_ADMIN_USER_IDS — a comma-separated list of exact user IDs
 * matched against the user ID from the verified session cookie. A request
 * body, query parameter or header can never grant the role, and there is no
 * "first user wins" or implicit-admin fallback: the default is an empty list,
 * which means nobody is an operator until one is explicitly configured.
 */

export const SYSTEM_ADMIN_IDS_ENV = 'INVESTPILOT_SYSTEM_ADMIN_USER_IDS';

/** Conservative shape for a configured user id (e.g. `usr_pilot_01`). */
const OPERATOR_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;

const EMPTY: ReadonlySet<string> = new Set<string>();

/**
 * Parses the operator allowlist conservatively:
 *  - entries are trimmed and empty entries dropped;
 *  - anything that is not a plausible user id is dropped (no wildcards,
 *    no `<script>`, no 10 KB strings);
 *  - matching is exact and case-sensitive — no substring or fuzzy matching.
 */
export function parseOperatorUserIds(raw: string | undefined | null): ReadonlySet<string> {
  if (typeof raw !== 'string' || raw.trim() === '') return EMPTY;

  const ids = new Set<string>();
  for (const entry of raw.split(',')) {
    const token = entry.trim();
    if (token === '') continue;
    if (!OPERATOR_ID_PATTERN.test(token)) continue;
    ids.add(token);
  }
  return ids;
}

export function getOperatorUserIds(): ReadonlySet<string> {
  return parseOperatorUserIds(process.env[SYSTEM_ADMIN_IDS_ENV]);
}

/** True only for an exact match against the configured operator list. */
export function isOperatorUserId(userId: unknown): boolean {
  if (typeof userId !== 'string' || userId.trim() === '') return false;
  return getOperatorUserIds().has(userId.trim());
}

/**
 * Requires an authenticated caller who is also a configured operator.
 * 401 when there is no valid session; 403 when the caller is signed in but is
 * not an operator.
 */
export function requireOperator(request: Request): Guarded<SessionUser> {
  const auth = requireAuth(request);
  if (!auth.ok) return auth;

  if (!isOperatorUserId(auth.value.id)) {
    return {
      ok: false,
      response: jsonError('Operator privileges are required for this action.', 403)
    };
  }
  return auth;
}
