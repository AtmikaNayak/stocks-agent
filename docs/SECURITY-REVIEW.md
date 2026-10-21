# Security review — InvestPilot AI 2.0

**Scope:** the application in this repository at the commit that introduced this
document. Read-only review of source, configuration and tests, plus execution of
the automated checks listed at the end.

**What this review is not.** It is not an independent penetration test, not a
third-party audit, and not a compliance certification. No external tester has
seen this code. The findings below were produced by reading the code and running
its own test suite in a sandbox. Any statement of the form "not vulnerable to X"
means "I read the code path and could not construct an exploit", not "X has been
proven impossible".

---

## 1. System model

| Component | Reality |
| --- | --- |
| Deployment | Single Node.js process, single SQLite file, single tenant |
| Users | Any number of rows in `users`; each owns portfolios. No tenant admin. |
| Money | Simulated only. No broker adapter, no credentials, no order routing. |
| Market data | Synthetic fixtures in SQLite. No live feed. |
| Processes | API server + optional worker daemon, sharing only the database file |
| Trust boundary | The HTTP request. Everything inside the process is trusted. |

Because exploitation cannot move real money, the security goals are: **do not
leak other users' data, do not corrupt portfolio records, and do not create a
false impression of safety.**

## 2. Threats considered

| # | Threat | Mitigation | Residual risk |
| --- | --- | --- | --- |
| T1 | Unauthenticated access to portfolio data | Every route except login requires a verified session | None known |
| T2 | Horizontal privilege escalation (user A reads/writes B) | Ownership joins on `portfolios.user_id`; a foreign id is reported as 404 | None known |
| T3 | Identity spoofing via `userId`/header/query | Identity is taken only from the verified session | None known |
| T4 | Stolen or forged session cookie | HMAC-SHA256, `HttpOnly`, `SameSite=Lax`, `Secure` in production, `token_version` revocation, `is_disabled` check on every request | A stolen token is valid until expiry or revocation; there is no device binding or MFA |
| T5 | CSRF | `SameSite=Lax`, `Sec-Fetch-Site` rejection, `Origin`/`Referer` match, JSON content-type requirement | Requests with **no** provenance headers are allowed (documented; such clients are not browsers) |
| T6 | Clickjacking | `frame-ancestors 'none'`, `X-Frame-Options: DENY` | Relaxable via `INVESTPILOT_ALLOW_FRAMING=1`; that switch is documented as preview-only |
| T7 | XSS | React escaping; CSP with `object-src 'none'`, `base-uri 'self'` | `script-src` contains `'unsafe-inline'` (no nonce propagation yet) — **real gap** |
| T8 | SQL injection | All queries parameterised (`?` placeholders); no string-interpolated user input | None found; not fuzz-tested |
| T9 | Credential stuffing / brute force | scrypt hashes, uniform 401, 10 failed logins / 15 min per email | In-process memory: resets on restart, per-instance |
| T10 | Timing oracle on login | Password verification runs even for unknown accounts (dummy hash) | Response-time differences from DB lookup remain possible |
| T11 | Resource exhaustion (CPU/memory) | Bounded backtest inputs, per-user quotas, 16 KB body cap, bounded rate-limit map | Quotas are per-instance; a single process can still be saturated by many users' backtests |
| T12 | Double-spend via concurrent orders | One `BEGIN IMMEDIATE` transaction covers read → risk → write | SQLite serialises writers, so throughput is limited |
| T13 | Replay / duplicate submission | Scoped, request-hashed idempotency keys | Clients that send no key get none |
| T14 | Tampered client price | `price` in the body is rejected outright | None known |
| T15 | Real-money execution | `portfolios.type = 'REAL'` rejected pre-write; `AUTONOMOUS_LIVE` rejected; broker route refuses all writes that would imply connectivity | None known — but this is a **code** guard, not a compliance control |
| T16 | Data corruption by migration | Additive migrations, `user_version` gate, integrity check, downgrade refusal | No automatic down-migration; restore from backup |
| T17 | Secret leakage in logs or errors | Errors are scrubbed to a generic 500; no secrets are logged; `.env` is git-ignored | A developer could still `console.log` a secret; nothing prevents that |
| T18 | Dependency compromise | `npm audit`; production tree clean | 9 advisories in the build-time tree; no reachable runtime path found, **not** independently verified |

## 3. Findings by severity

### Critical
None found.

### High

**H-1 — `script-src 'unsafe-inline'` in CSP.**
The App Router emits inline bootstrap scripts and no nonce is threaded through.
An HTML-injection bug would therefore not be blocked by CSP. Exploitation still
requires an injection primitive, and none was found. *Status: open, tracked.*

**H-2 — No automated accessibility or browser-based security test.**
CSRF defence is verified by unit tests of the guard, not by a real browser
issuing a cross-site form post. The guard's logic is tested; browser behaviour
(SameSite enforcement) is assumed from the spec. *Status: open.*

### Medium

**M-1 — Rate limiting and quotas are in-process.**
An N-instance deployment gets N× the intended limit; a restart clears the
counter. Correct for a single-user local build, not for anything shared.
*Status: accepted, documented.*

**M-2 — No MFA, no email verification, no self-service reset.**
Provisioning and recovery are administrator-assisted. An attacker with database
write access can set any password. *Status: accepted for a demo build.*

**M-3 — Operator role is an environment variable, not a database role.**
No UI, no grant/revoke audit trail, no separation of duties. Changing it requires
a restart. *Status: accepted, documented.*

**M-4 — A stolen session token remains valid until expiry.**
Revocation is account-wide and only triggered by logout or password change.
There is no "log out other devices" action and no per-session list.
*Status: accepted; the trade-off is stated in the README rather than hidden.*

### Low

**L-1 — Requests without `Origin`/`Referer`/`Sec-Fetch-*` bypass the CSRF check.**
Such requests cannot carry a victim's cookie in a browser, so this is not
exploitable as CSRF, but it does mean the check is not a complete provenance
gate. *Status: documented.*

**L-2 — `Referrer-Policy: no-referrer` means the `Referer` fallback rarely
fires.** The `Origin` header covers the same ground for `POST`. No action.

**L-3 — Error text from `AppError` is returned verbatim.**
Reviewed for SQL/path/secret content: it contains user-facing reasons and
amounts only. A future contributor could leak something through it.
*Status: convention documented in `src/lib/errors.ts`.*

**L-4 — Login responses differ in latency for existing vs unknown accounts.**
A dummy hash is verified for unknown users, which removes the obvious oracle,
but a database lookup difference remains. *Status: accepted.*

## 4. What was verified by execution

Run in this repository, on the commit that includes this document:

| Check | Command | Result |
| --- | --- | --- |
| Unit/integration suite | `npm test` | 23 files, 241 tests passing |
| Type check | `npm run typecheck` | clean |
| Lint | `npm run lint` | 0 errors, 5 pre-existing hook warnings |
| Production build | `npm run build` | succeeds |
| Production dependency audit | `npm audit --omit=dev` | 0 vulnerabilities |
| Full dependency audit | `npm audit` | 9 advisories (7 high, 2 moderate), build-time only |

## 5. Explicitly out of scope

- Real broker connectivity, credential storage and order routing do not exist, so
  they could not be reviewed.
- No fuzzing, no SAST/DAST tooling, no dependency-provenance attestation.
- No review of the host, container runtime, TLS termination or reverse proxy.
- No legal, tax or regulatory assessment.
- No assessment of whether synthetic demo data is suitable for any decision —
  it is not, and the UI says so.

## 6. Conclusion

The controls that matter for this build — session integrity, ownership checks,
same-origin enforcement on mutations, transactional execution, idempotency and
REAL-portfolio refusal — are implemented in one place each and covered by
regression tests. The two high findings (inline-script CSP, no browser-level
verification) are real and are stated as open rather than explained away.

**This application is not ready to be exposed to the public internet, and it must
not be used with real money.**
