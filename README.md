# InvestPilot AI 2.0 🇮🇳
### Research and Virtual-Trading Platform for Indian Equities

**Current build status: demo / paper-trading only.**
InvestPilot AI 2.0 contains a research dashboard, strategy and proposal workflows, a virtual portfolio simulator, deterministic risk checks, and an audit trail. The checked-in seed data is synthetic demo content — not verified NSE prices, audited fundamentals, real news, or validated backtest results. There is **no** verified external market-data adapter and **no** broker authentication, order-submission or fill-reconciliation adapter. Real-money orders are rejected in code, before any state is written.

---

**Companion documents:** [`docs/HARDENING-REPORT.md`](docs/HARDENING-REPORT.md)
(what was broken, what changed, requirement-by-requirement status) and
[`docs/SECURITY-REVIEW.md`](docs/SECURITY-REVIEW.md) (threat model, findings and
their severities).

## What changed in this hardening pass

The project previously *displayed* risk limits that the code did not enforce, and its order execution had two correctness bugs. Both are fixed, with regression tests:

| Defect | Impact | Status |
| --- | --- | --- |
| Portfolio snapshot read **outside** the transaction, then reused for the cash and position writes | Two concurrent orders both passed the cash check and both debited the same balance; cash could go negative | Fixed: every decision and write happens in one `BEGIN IMMEDIATE` transaction against freshly read state |
| Position lookup ignored `product_type` | A CNC sell could consume an MIS holding and credit cash without any position write (free money) | Fixed: positions are read by `(portfolio, asset, product_type)` |
| `max_risk_per_trade_pct`, `max_drawdown_limit_pct`, trading window, CNC/MIS permissions | Configured, displayed, never enforced | Implemented (see the risk matrix) |
| "Daily loss" used **lifetime** realised P&L | Never resets; would block trading forever after one bad month | Fixed: realised P&L is stored per execution and summed per IST day |
| Cash checks compared gross turnover to cash | An order that fit before charges could overdraw | Fixed: the check uses the actual cash impact including charges + slippage |
| No idempotency protection (key was derived from a random row id) | Retries and double-submits created duplicate orders | Fixed: user-scoped, request-bound idempotency keys |
| Proposal marked `EXECUTED` outside the execution transaction | A crash could leave an executed proposal with no execution, or allow a second execution | Fixed: the status transition is inside the same transaction |
| Logout only cleared the browser cookie | A copied token stayed valid until expiry | Fixed: server-side revocation counter |

---

## Authentication, Authorization & Data Provenance

### Signing in

Every API route except `POST /api/auth/login` requires a valid session. The UI shows a sign-in screen when no session exists.

```bash
# 1. Create the account row first (the seeded demo user already exists).
# 2. Provision a password (never stored in source, never printed):
INVESTPILOT_ADMIN_EMAIL="you@example.com" \
INVESTPILOT_ADMIN_PASSWORD="a-long-unique-passphrase" \
npm run auth:set-password
```

There is **no default account, no default password, no bypass header and no environment variable that logs a user in**. Passwords are salted scrypt hashes in `user_credentials`. Sessions are HMAC-SHA256 signed tokens in an `HttpOnly`, `SameSite=Lax`, `Path=/` cookie that is `Secure` whenever `NODE_ENV=production`.

### Session lifecycle and revocation

Tokens carry `{ v, sub, iat, exp, tv }`, where `tv` is a revocation counter. **On every request** `src/lib/auth/guard.ts` checks three independent things:

1. the token is well-formed, correctly signed and unexpired;
2. the account exists and `users.is_disabled = 0`;
3. `tv` equals `user_credentials.token_version`.

Bumping that column revokes every token issued for the account:

| Event | Effect |
| --- | --- |
| `POST /api/auth/logout` | `token_version += 1` → **all** sessions for the account are invalid |
| `npm run auth:set-password` | `token_version += 1` → old sessions die with the old password |
| `UPDATE users SET is_disabled = 1` | every request for that user is refused, at login and mid-session |

**Policy, stated explicitly:** revocation is account-wide, not per-device. Per-device revocation would require a server-side session table; with stateless signed tokens, account-wide revocation is the safe approximation. A token that carries **no** `tv` claim is rejected, so a token minted before this change cannot dodge a later bump.

Failed auth always returns an identical `401` body — the rejection reason (`MALFORMED`, `UNKNOWN_USER`, `DISABLED`, `REVOKED`) is used internally for diagnostics and never sent to the client.

| Variable | Required | Purpose |
| --- | --- | --- |
| `INVESTPILOT_SESSION_SECRET` | **yes in production** (32+ chars) | Signs session cookies. Without it in production every session is rejected and login returns 503 — there is no fallback. In development a per-process random secret is generated. |
| `INVESTPILOT_SESSION_TTL_SECONDS` | no | Session lifetime, default `28800` (8 h), clamped to 300–604800. |
| `INVESTPILOT_ADMIN_EMAIL` / `INVESTPILOT_ADMIN_PASSWORD` | only for `auth:set-password` | Provisioning input. Never read by the running server. |
| `INVESTPILOT_SYSTEM_ADMIN_USER_IDS` | no (empty = no operators) | Comma-separated exact user IDs allowed to trigger jobs/scans. |
| `INVESTPILOT_LOGIN_MAX_FAILURES` / `INVESTPILOT_LOGIN_WINDOW_SECONDS` | no | Sign-in throttle (default 10 / 900 s). |
| `INVESTPILOT_TRUST_PROXY` / `INVESTPILOT_TRUSTED_PROXY_HEADER` | no | Only set when a reverse proxy overwrites the forwarding header. |

Because production cookies are `Secure`, a production server must be reached over HTTPS. Use `npm run dev` for plain HTTP on localhost.

### Cross-site request forgery

State-changing routes require same-origin provenance, in three layers:

1. `SameSite=Lax` — a cross-site POST does not carry the session cookie.
2. `Sec-Fetch-Site: cross-site` — refused outright (403).
3. `Origin` (falling back to `Referer`) is compared with the request host and `INVESTPILOT_ALLOWED_ORIGINS`.

Applied to `orders`, `proposals`, `settings`, `broker`, `agents`, `system`, `explainability`, `login` and `logout`. **Documented limitation:** a request with none of these headers (server-to-server or CLI) is allowed — such a client is not a browser and cannot be a CSRF victim; requiring a token would break API use without adding protection. Mutating bodies must also be `application/json`, capped at 16 KB (8 KB for backtests).

### Security headers

`next.config.mjs` sets CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, COOP/CORP, `frame-ancestors 'none'` + `X-Frame-Options: DENY`, and HSTS in production. The previous blanket `Access-Control-Allow-Origin: *` has been removed — this app is same-origin only.

**Known CSP gap:** `script-src` still includes `'unsafe-inline'` because the App Router emits inline bootstrap scripts and this build does not implement nonce propagation. That is real debt, not a claim of a strict CSP.

### Route protection

| Route | Method | Policy |
| --- | --- | --- |
| `/api/auth/login` | POST | Public. Same-origin + throttled (10 failed attempts / 15 min). |
| `/api/auth/logout` | POST | Public (idempotent); revokes all account sessions when one existed. |
| `/api/auth/session` | GET | Session; returns the caller and `isOperator`. |
| `/api/portfolios` | GET | Session; scoped to `portfolios.user_id` (positions and ledger joined through it). |
| `/api/orders` | GET | Session; scoped; a `portfolioId` that is not yours returns 404. |
| `/api/orders` | POST | Session + same-origin; ownership checked before execution; optional `Idempotency-Key`. |
| `/api/proposals` | GET | Session; scoped. |
| `/api/proposals` | POST `generate` | Session + same-origin; target portfolio ownership checked. |
| `/api/proposals` | POST `respond` | Session + same-origin; existence **and** ownership in one query; idempotent per proposal. |
| `/api/settings` | GET/POST | Session + same-origin; identity from the session only. |
| `/api/broker` | GET/POST | Session + same-origin; a `userId` in the body is rejected, never trusted. |
| `/api/explainability` | GET/POST | Session + same-origin; portfolio scoped, including evidence rows. |
| `/api/market` | GET | Session; watchlists scoped; exposes the provider inventory. |
| `/api/agents` | GET | Session. `agent_runs` and `agent_observations` are shared research; `investment_theses` are scoped. |
| `/api/agents` | POST | **Operator only** + same-origin + quota. |
| `/api/backtest` | GET/POST | Session (+ same-origin, quota on POST). Shared research artifact; reads no per-user data. |
| `/api/system` | GET | Session. Scheduler metadata, honest `workerStatus`, caller's own audit rows only. |
| `/api/system` | POST | **Operator only** + same-origin. |

Authorization lives in one shared guard, `src/lib/auth/guard.ts`. Identity always comes from the verified session; client-supplied `userId`, `x-user-id` or query parameters never change it.

### Operator privileges

`INVESTPILOT_SYSTEM_ADMIN_USER_IDS` is a comma-separated list of exact user IDs, matched against the **verified session** id. Empty by default: nobody is an operator. There is no "first user wins" fallback, and a body/header/query value can never grant the role. Grants are auditable in the sense that they are configuration, not data — but **there is no operator management UI and no database audit of who granted the role**.

### Rate limiting and quotas

- **Sign-in throttle** (`src/lib/auth/rate-limit.ts`): keyed on normalised email, plus an IP key only when proxy trust is explicitly configured. Bounded map (5 000 keys) with expiry sweeping.
- **Expensive-endpoint quotas** (`src/lib/auth/quota.ts`): backtests 12/hour/user, operator agent scans 6/minute/user.
- **Single-instance limitation:** both live in process memory. With N instances the effective limit is N×. There is no Redis or database-backed limiter in this repository; a multi-instance deployment must replace these.

### Provider trust (data provenance)

Trust is **default-deny**. A quote is verified/actionable only when its freshness is `LIVE`, `DELAYED_15M` or `EOD` **and** its provider string is an exact, case-sensitive match in a configured allowlist:

```bash
INVESTPILOT_TRUSTED_QUOTE_PROVIDERS=""        # empty by default
INVESTPILOT_TRUSTED_FUNDAMENTAL_SOURCES=""    # empty by default
```

`src/lib/market-data/providers.ts` adds a `ProviderRegistry`. Only the synthetic fixture adapter is registered. `requireVerifiedProvider()` throws `NoVerifiedProviderError` — the fail-closed entry point for any workflow that would need real data. An adapter's declared kind can never grant trust, and even an allowlisted provider is reported as "integration not verified", because an allowlist is configuration, not evidence.

## 🛡️ Risk-control matrix

Every row is enforced in `src/lib/risk-engine.ts`, inside the execution transaction, against freshly read state. `UNAVAILABLE` is a third status: the control could not be measured and is **never** reported as a pass.

| Control | Formula / source | Fail-safe | Regression test |
| --- | --- | --- | --- |
| Portfolio active | `portfolios.is_active = 1` | Reject | `risk-engine.test.ts` |
| Emergency stop | `user_settings.emergency_stop_enabled = 1` | Reject | `risk-engine.test.ts` |
| Risk limits configured | `portfolio_permissions` row must exist and hold finite, non-negative numbers | **Fail closed** (missing/misconfigured limits block trading instead of defaulting) | `risk-engine.test.ts` |
| Product type | `allow_delivery` / `allow_intraday` | Reject | `execution-integrity.test.ts` |
| Real execution | `portfolios.type = 'REAL'` | Reject **before any write**, 403 `REAL_EXECUTION_DISABLED` | `execution-integrity.test.ts`, `authz-ownership.test.ts` |
| Autonomous live | `orderMode = AUTONOMOUS_LIVE` | Reject, 403 | `execution-integrity.test.ts` |
| Max orders/day | `COUNT(orders)` for the current **IST** date `< max_orders_per_day` | Reject | `risk-engine.test.ts` |
| Max order value | `quantity × effective fill price` (slippage included) `<= max_order_value` | Reject | `risk-engine.test.ts` |
| Sellable quantity | `positions.quantity` for `(portfolio, asset, product_type)` `>= quantity` | Reject; no cash credit, no execution row | `execution-integrity.test.ts` |
| Cash available | `current_cash − (turnover + totalCharges) >= 0` | Reject | `execution-integrity.test.ts` |
| Min cash reserve | `cashAfter / navAfter × 100 >= min_cash_reserve_pct` | Reject | `risk-engine.test.ts` |
| Single-stock cap | `positionValueAfter / navAfter × 100 <= max_position_pct` | Reject | `risk-engine.test.ts` |
| Portfolio exposure | `marketValueAfter / navAfter × 100 <= max_portfolio_exposure_pct` | Reject | `risk-engine.test.ts` |
| Max risk per trade | `quantity × (price − stop)` where the stop is the active thesis stop, else a documented **10 % assumed adverse move** (`DEFAULT_ASSUMED_STOP_LOSS_PCT`); must be `<= max_risk_per_trade_pct %` of NAV | Reject | `risk-engine.test.ts` |
| Daily loss | `SUM(executions.realised_pnl)` for the current **IST** date; a realised loss `>= max_daily_loss_limit` suspends new orders | Reject | `risk-engine.test.ts` |
| Max drawdown | `(peakNav − navAfter) / peakNav × 100 <= max_drawdown_limit_pct`, peak from `portfolio_snapshots` | **UNAVAILABLE** (not a pass) until ≥ 2 snapshots exist; snapshots are written after every fill | `risk-engine.test.ts`, `execution-integrity.test.ts` |
| Trading window | NSE continuous session 09:15–15:30 **Asia/Kolkata** on a trading day, then the portfolio's `trading_window_start/end` | Reject | `execution-integrity.test.ts` |
| Proposal approval | status `APPROVED`, unexpired, matching portfolio/asset/side/quantity | Reject; re-checked inside the transaction | `execution-integrity.test.ts`, `agent-validation.test.ts` |

### Exchange calendar — an explicit gap

`src/lib/trading-calendar.ts` computes IST wall-clock correctly and knows weekends and the standard session shape. **It ships no holiday calendar**, because NSE publishes trading holidays and special sessions (e.g. Muhurat trading) that change yearly, and inventing them would silently mis-gate orders. Configure the official list:

```bash
INVESTPILOT_TRADING_HOLIDAYS="2026-01-26,2026-11-09"
```

Without it, weekends are enforced and weekdays are treated as trading days; `/api/market` reports `holidayCalendarConfigured: false` so the UI can say so. A malformed window or unparseable date fails **closed**.

Per-portfolio enforcement can be turned off deliberately (`portfolio_permissions.trading_schedule_enabled = 0`) — that is a real, auditable configuration change, not an ignored setting.

---

## 🔁 Idempotency

| Property | Behaviour |
| --- | --- |
| Key source | `Idempotency-Key` header (or `idempotencyKey` in the body; both must agree) |
| Format | 8–200 characters `[A-Za-z0-9._:-]` |
| Scope | Unique per **(user, operation)**. Two users may use the same string; `order` and `proposal_approve` never collide. |
| Binding | SHA-256 of the normalised request. Same key + different details → **409 `IDEMPOTENCY_CONFLICT`**, never a silent replay of the wrong result. |
| Replay | A completed key returns the stored response; **no second trade**. |
| In-flight | A key claimed but never completed (crashed request) → **409 `IDEMPOTENCY_IN_PROGRESS`**. It is never treated as "safe to retry", because a side effect may already have happened. |
| Retention | 24 hours; expired rows are replaced on the next claim and swept opportunistically. |
| Atomicity | The claim, the financial writes and the completion commit in the same transaction. |
| No key supplied | The server generates a random one: storage uniqueness only, **no duplicate suppression**. Clients that need retry safety must send a key. Proposal approval is idempotent per proposal id regardless. |

The order row's `idempotency_key` column is namespaced by user so its global `UNIQUE` constraint does not prevent two users from choosing the same key.

---

## 🇮🇳 Estimated Indian transaction-cost model

Illustrative statutory rates applied to a **simulated** fill. Not a contract note, not tax advice, and not verified against a live broker in this build.

- **STT:** 0.1 % on delivery (CNC) buy and sell; 0.025 % on intraday sell only.
- **Exchange turnover:** 0.00345 % (NSE). **SEBI:** ₹10/crore.
- **Stamp duty:** 0.015 % delivery / 0.003 % intraday, buy side only.
- **Brokerage:** min(₹20, 0.03 %). **GST:** 18 % on brokerage + exchange + SEBI.
- **Slippage:** 0.05 % by default, applied to the price *before* turnover is computed, so recorded turnover always matches the recorded fill price.

Sign conventions: `netAmount = turnover + charges` (BUY, cash required) or `turnover − charges` (SELL, cash received). Non-finite, negative or zero inputs are rejected rather than coerced.

---

## 🧱 Concurrency model for execution

`portfolio-execution.ts` runs one synchronous `BEGIN IMMEDIATE` transaction containing: the idempotency claim, the fresh state read, the risk evaluation, the decision record, the order, the execution, the cash-ledger entry, the position write, the portfolio totals, the proposal transition, the audit row, the notification and the idempotency completion.

Consequences that are actually guaranteed:

- No `await` occurs inside the transaction — quotes and fundamentals are fetched first, so a slow network call never holds a write lock.
- A failure anywhere rolls back every financial row (proved by a test that forces a late write to fail).
- Node is single-threaded and better-sqlite3 is synchronous, so requests in one process cannot interleave; `BEGIN IMMEDIATE` + `busy_timeout = 5000` serialises writers across processes.

**Limitation:** SQLite serialises all writers. This is correct but not high-throughput; a real multi-tenant deployment should move to a server database with row-level locking.

---

## 🤖 The four agents

1. **Market Intelligence** (`src/lib/agents/market-intelligence.ts`) — read-only scans over stored rows; strictly cannot submit orders. Observations are persisted as non-actionable while the feed is synthetic.
2. **Investment Strategist** (`src/lib/agents/strategist.ts`) — validates portfolio ownership, asset, quote freshness and provenance; refuses the REAL portfolio; writes proposals whose risk assessment is **advisory only** (the trading window is deliberately not enforced at generation time, because a proposal may be approved in a later session). Narrative text never overrides executable policy.
3. **Portfolio & Execution** — the transactional path described above. Blocks REAL accounts, `AUTONOMOUS_LIVE`, client-supplied prices.
4. **Explainability** (`src/lib/agents/explainability.ts`) — the pre-execution decision record is written by the **same transaction** as the trade, through a synchronous writer, so an execution can never exist without its rationale or vice versa. Its risk summary lists any control that was not evaluable rather than claiming a clean pass.

---

## 📈 Backtesting: what it does and does not claim

- Inputs are bounded: ≤ 20 symbols, ≤ 20 characters each, deduplicated, known symbols only, known strategy version only, bounded capital/slippage/brokerage, ≤ 5 000 candles per symbol and ≤ 5 000 trades.
- Malformed candles are **quarantined and counted** (`dataQuality.quarantinedCandles`), never repaired.
- Decisions use only candles up to `i`; entry is modelled at candle `i+1`, exit at `i+3`. The previous engine entered at the close of the candle it had just used to decide.
- CAGR is withheld below a one-year span; Sharpe/Sortino are withheld below 20 trades; benchmark and alpha are `null` because no index series exists; `outOfSampleTested` is always `false` because no held-out data was ever used.
- A synthetic run says, in its own output, that it is *not evidence of strategy performance*.
- **Still missing:** out-of-sample / walk-forward evaluation, survivorship-bias control, corporate-action adjustment, and any independent evaluation of strategy quality. No profitability claim is made anywhere.

---

## ⚙️ Workers and automation

- `npm run worker` starts the daemon. It writes a `worker_heartbeats` row every 30 s and marks it `STOPPED` on graceful shutdown.
- `/api/system` reports `RUNNING_IN_PROCESS`, `RUNNING_EXTERNAL`, `STALE`, `STOPPED` or `UNKNOWN` with the beat age. Job history remains *evidence* and never upgrades the status.
- A cross-process job lock (conditional `UPDATE`, 15-minute TTL for crashed holders) prevents two workers, or an operator trigger racing the scheduler, from running the same job concurrently.
- Failed jobs record a coarse error category (`DATABASE_LOCKED`, `DATABASE_ERROR`, `NETWORK_ERROR`, `RATE_LIMITED`, `UNKNOWN`).
- Cash reconciliation no longer rewrites a balance silently: it writes an audited `CASH_RECONCILED` entry. REAL portfolios are never revalued or reconciled from demo data.
- **Limitation:** a `SIGKILL`ed worker cannot deregister, so its beat ages out into `STALE`. There is no distributed scheduler, exactly-once guarantee or alerting integration.

---

## 🗄️ Database, migrations, backup and restore

- `npm run db:init` creates missing tables and applies **additive** migrations (`PRAGMA user_version`). It never drops, truncates, reseeds or rewrites rows, refuses to run if the database is newer than the build, and runs `integrity_check` first.
- `npm run db:seed` is a **separate, explicit** command. Tests never call it against the real database.
- Migrations v2–v5 are additive: `users.is_disabled`, `user_credentials.token_version`, `executions.realised_pnl`, `idempotency_keys`, `worker_heartbeats`, `scheduled_jobs.locked_by/locked_at/last_run_error_category`, plus indexes. v4 rebuilds `idempotency_keys` to fix a primary key while preserving its rows.
- `tests/migration-safety.test.ts` builds a previous-release database, fills it with portfolios, positions, orders, executions, ledger rows and credentials, upgrades it, and asserts every row and value survives.
- Tests always point `INVESTPILOT_DB_PATH` at `data/investpilot.test.db` (wiped by `tests/global-setup.ts`, git-ignored). A regression test asserts the suite is not pointed at `data/investpilot.db`.

**Backup / restore** (verified procedure, not yet rehearsed against a real user's file):

```bash
# Back up (use SQLite's backup API so a live WAL database is consistent)
sqlite3 data/investpilot.db ".backup 'backup-$(date +%F).db'"

# Verify the backup opens and is internally consistent
sqlite3 backup-2026-10-21.db "PRAGMA integrity_check; SELECT COUNT(*) FROM portfolios;"

# Restore into a NEW location first, then move it into place
sqlite3 backup-2026-10-21.db ".backup 'restored.db'"
INVESTPILOT_DB_PATH=./restored.db npm run db:init
```

**Rollback:** application rollback is a code revert. Schema rollback is *not* automatic — migrations are additive, so an older build that does not know a new column ignores it; but a downgrade past v4 should be restored from the pre-migration backup rather than reversed.

---

## 📦 Dependencies

- Production dependency tree: `npm audit --omit=dev` → **0 vulnerabilities**.
- Development/build tree: 9 advisories (7 high, 2 moderate) in `braces` (GHSA-vfj7-8cjw-p6xm) and `postcss-selector-parser` (GHSA-rj75-hqrm-r3gf), reached through `tailwindcss@3 → chokidar/fast-glob/micromatch/postcss-nested`. **No non-breaking fix exists**: `npm audit fix --force` would upgrade Tailwind to v4, which changes PostCSS/config plumbing. These packages run at build time, are not shipped to the browser, and are not reachable from request handling. Deferred deliberately, not dismissed silently — a Tailwind 4 migration is the tracked fix.
- `next lint` was removed in Next.js 16 and the old `lint` script was broken; the project now uses ESLint 9 with `eslint-config-next` (`npm run lint`, 0 errors, 5 pre-existing hook warnings).

---

## 🧪 Testing

```bash
npm test
```

Current result: **23 test files, 245 tests passing.** (Update this count if you change the suite — it is asserted by review, not by a test.)

| Area | File |
| --- | --- |
| Concurrency, idempotency, CNC/MIS, oversell, rollback, quote validation, trading window | `tests/execution-integrity.test.ts` |
| Risk limits and thresholds | `tests/risk-engine.test.ts` |
| REAL/virtual isolation, forged prices, quantities | `tests/execution-isolation.test.ts` |
| Sessions, revocation, disablement, CSRF, body hygiene (18) | `tests/session-lifecycle.test.ts` |
| Authentication boundary, forged tokens, throttling | `tests/auth-session.test.ts`, `tests/login-rate-limit.test.ts` |
| Cross-user access (reads and writes) | `tests/authz-ownership.test.ts` |
| Operator-only actions | `tests/operator-permissions.test.ts` |
| Migration safety and test-DB isolation | `tests/migration-safety.test.ts` |
| Provider trust and registry | `tests/provider-trust.test.ts`, `tests/provider-registry.test.ts` |
| Worker heartbeat, stale/stopped states, job locks | `tests/worker-heartbeat.test.ts`, `tests/worker-status.test.ts` |
| Backtest limits, look-ahead, honesty | `tests/backtest-limits.test.ts`, `tests/backtest-metrics.test.ts`, `tests/backtesting.test.ts` |
| Costs, agents, provenance, formatting, env example | `tests/tax-calculator.test.ts`, `tests/agents.test.ts`, `tests/agent-validation.test.ts`, `tests/data-provenance.test.ts`, `tests/format.test.ts`, `tests/env-example.test.ts`, `tests/validation.test.ts` |

**Not covered by automated tests:** visual rendering, keyboard navigation, screen-reader output, real-browser CSRF behaviour, and any accessibility audit. There is **no** automated accessibility (axe/Playwright) suite in this repository.

---

## 🚀 Getting started

```bash
npm ci                        # reproducible install from package-lock.json
npm run db:init               # schema + additive migrations (no data changes)
npm run db:seed               # OPTIONAL: synthetic demo fixtures

INVESTPILOT_ADMIN_EMAIL="investor@investpilot.ai" \
INVESTPILOT_ADMIN_PASSWORD="a-long-unique-passphrase" \
npm run auth:set-password

npm run typecheck
npm run lint
npm test
npm run build
npm run dev                   # http://localhost:3000
```

`NODE_ENV` is intentionally not set in `.env.example`; the command decides it.

| | Development (`npm run dev`) | Production (`npm start`, Docker) |
| --- | --- | --- |
| Cookie `Secure` | omitted, so plain `http://localhost` works | **always set** — must be served over HTTPS |
| `INVESTPILOT_SESSION_SECRET` | optional (per-process random; sessions reset on restart) | **required**, 32+ chars; login returns 503 without it |

---

## ⚠️ Known limitations

- **Single-tenant demo.** One SQLite database; sign-in throttling and quotas are in-process only (reset on restart, not shared between instances).
- **No MFA, no email verification, no self-service password reset.** There is no mail service configured, so these flows are not simulated. Provisioning is administrator-assisted (`npm run auth:set-password`); recovery means re-running it. A real reset flow needs an SMTP/API provider, verified sender identity and expiring single-use tokens — none of which exist here.
- **Operator management is an environment variable**, not a database role: no UI, no grant/revoke audit trail.
- **Synthetic data everywhere.** Prices, fundamentals, news and backtest records are demo fixtures. No live NSE/BSE feed is wired in.
- **Broker integration is absent by design.** Do not enter broker keys, secrets, PINs or TOTP values into this build. A database row marked `CONNECTED` is forced back to `DISCONNECTED` at startup and is not proof of a session.
- **Real-money execution stays blocked** in the execution service. Do not bypass the guard, set a broker row to `CONNECTED`, or hand-edit `AUTHORISED_LIVE`.
- **CSP uses `'unsafe-inline'`** for scripts (see above).
- **5 ESLint hook warnings** remain: `setState` inside `useEffect` in four screens (a render-performance advisory). Tracked as UI debt.
- **No automated accessibility testing.** A manual keyboard/screen-reader pass over the major screens has not been performed in this environment; the beginner-facing copy and glossary exist but have not been usability-tested with real beginners.
- **Demo-only.** Costs are estimates; simulated fills do not establish likely future performance.

---

## ⚖️ Regulatory notice

InvestPilot AI 2.0 is an educational and personal research/simulation tool. It is not a SEBI-registered Investment Adviser (RIA) or Portfolio Management Service (PMS). Real-money automation is disabled in code and must remain disabled until a real broker adapter, credential storage, idempotent order submission, status polling, partial-fill/cancel handling and broker-confirmed reconciliation are implemented and independently tested.
