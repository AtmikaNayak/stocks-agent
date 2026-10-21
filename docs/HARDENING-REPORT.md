# InvestPilot AI 2.0 — Financial-Integrity Hardening Report

**Repository:** `AtmikaNayak/stocks-agent`
**Branch of record:** `arena/de0ec973-stocks-agent`
**Base commit:** `417e2ec` ("Report worker state truthfully and validate proxy IPs strictly")
**Head at time of writing:** the tip of the branch; run `git log 417e2ec..HEAD` for the exact list.
**Date:** 2026-10-21
**Product scope:** demo / paper-trading only. No real money, no broker adapter, no
live market data.

---

## Status vocabulary

Every requirement below carries exactly one of six statuses.

| Status | Meaning |
| --- | --- |
| `COMPLETE` | Implemented in code **and** covered by a passing regression test. |
| `PARTIAL` | Implemented, but a named part of the requirement is missing. |
| `BLOCKED` | Cannot be done in this environment/repository; the blocker is named. |
| `DEFERRED` | Deliberately postponed with a stated reason and a tracking note. |
| `UNAVAILABLE` | The control cannot be evaluated with the data that exists; it is **never** reported as a pass. |
| `NOT APPLICABLE` | Genuinely outside this product's scope, with a reason. |

---

## 1. Executive summary

The application already had a well-shaped risk engine and an audit trail. It did
**not** have a trustworthy execution path. Two defects made the simulator's
bookkeeping unsound:

1. The portfolio row was read **before** the transaction and the in-memory copy
   was used for the cash and position writes. Two concurrent orders could both
   pass the cash check and both be debited against the same starting balance.
2. Positions were looked up by `(portfolio, asset)` while writes were keyed by
   `(portfolio, asset, product_type)`. A CNC sell against an MIS holding found
   no delivery position, wrote nothing, and still credited cash — a free
   increase in simulated cash.

Both are fixed, along with the displaying-but-not-enforcing of four documented
limits, a "daily loss" figure that actually summed lifetime realised P&L, an
idempotency key derived from a random row id (which suppressed nothing), and a
logout that only cleared the browser cookie.

The single most important thing this report does **not** claim: none of this
makes the product safe or suitable for real money, and nothing here is evidence
that any strategy works.

## 2. Scope and constraints observed

Held throughout:

- Demo/paper trading only. No real-money enablement, no broker submission, no
  credential request, no simulated "connected" broker state.
- REAL-portfolio guard, `AUTONOMOUS_LIVE` and `AUTHORISED_LIVE` remain refused.
- No fabricated fills, positions, balances or prices.
- Synthetic data stays labelled synthetic everywhere it is surfaced.
- No destructive database action; `data/investpilot.db` was not reset, migrated
  or reseeded destructively; the test database is separate and disposable.
- No secrets, `.env`, database files or build artefacts committed.
- Explicit-path staging only; no force-push; no PR state change; no branch
  deletion.

### Deviation from the brief

The brief asked for a new branch named `hardening/financial-integrity`. This
session is pinned by the platform to `arena/de0ec973-stocks-agent`, and creating
or switching branches would detach the work from the session. **All seven
commits are therefore on `arena/de0ec973-stocks-agent`, branched from
`417e2ec`.** The base branch was not modified. This is recorded as `PARTIAL`
against the branch-hygiene requirement rather than being quietly ignored.

## 3. Baseline: what was actually broken

Found by reading the code, then confirmed with failing tests before fixing.

| # | Defect | Consequence |
| --- | --- | --- |
| B1 | Portfolio snapshot read outside the transaction | Concurrent orders double-spend; cash can go negative |
| B2 | Position lookup ignored `product_type` | CNC sell against MIS holding credits cash with no position write |
| B3 | `max_risk_per_trade_pct` never read | Configured, displayed, unenforced |
| B4 | `max_drawdown_limit_pct` never read | ditto |
| B5 | `trading_schedule_enabled` / `trading_window_start/end` never read | ditto |
| B6 | `allow_delivery` / `allow_intraday` never read | A portfolio could trade a product it had disabled |
| B7 | "Daily loss" summed lifetime `realised_pnl` | One bad month would block trading permanently |
| B8 | Cash check compared gross turnover, ignoring charges and slippage | An order that fits before costs can overdraw |
| B9 | `idempotency_key = idem_${random row id}` | No duplicate suppression at all |
| B10 | Proposal set to `EXECUTED` outside the execution transaction | Crash window: executed trade with no link, or a second execution |
| B11 | Logout cleared the cookie only | A copied token stayed valid until expiry |
| B12 | No same-origin check on mutations; `Access-Control-Allow-Origin: *` | CSRF exposure; any origin could read API JSON |
| B13 | `getMarketSessionStatus` did its own UTC+5:30 arithmetic | Wrong day across the IST rollover; disagreed with the risk engine |
| B14 | `npm run db:init` pointed at a file that did not exist; `npm run lint` used `next lint` (removed in Next 16) | Two shipped scripts simply failed |
| B15 | Tests shared the demo database; agent validation queried for "assets without fundamentals" | A legitimate test asset polluted an unrelated assertion |
| B16 | `readJsonBody` read the whole body before checking its length; login bypassed it entirely with `request.json()` | The one unauthenticated endpoint buffered an arbitrarily large body and skipped the content-type check |

## 4. Changes made

Ordered oldest first. Each commit was type-checked and tested before it was
made; `lint` only existed from `8637f15` onwards and has passed since. The last
entries touch only this document and the README.

| SHA | Change |
| --- | --- |
| `3dbb736` | Additive migration runner (`PRAGMA user_version`), `writeTransaction` with `BEGIN IMMEDIATE`, `busy_timeout`, idempotency store, error type, safe JSON body reader, quote validation, exchange calendar. v2–v4 migrations. |
| `bbcd9da` | Risk engine enforces every documented limit; charges model validated; position/quote/date determinism. |
| `b552804` | Execution rewritten as one synchronous transaction; idempotency; proposal/decision records commit atomically; 26-test integrity suite. |
| `25271f7` | Revocable sessions (`tv`), disabled-account refusal, same-origin checks on all mutating routes, security headers, error scrubbing; 14 session + 4 migration tests. |
| `bb80866` | Bounded backtest inputs, unknown symbol/strategy rejection, candle quarantine, per-user quotas, same-bar look-ahead fixed. |
| `22ae206` | Worker heartbeat table, `RUNNING_EXTERNAL`/`STALE`/`STOPPED` states, cross-process job lock with TTL reclaim, error categories, audited cash reconciliation. |
| `d203d32` | Default-deny provider registry; `/api/market` exposes provider inventory and holiday-calendar status. |
| `8637f15` | Tooling, CI and documentation repairs: `db:init` entry point that did not exist, `next lint` that no longer exists, CI that only ran on two branch names, README rewritten against the code. |
| `c1f312b` | Market-session status delegates to the shared exchange calendar (IST rollover bug, invented `POST_CLOSE`). |
| `b22cd78` | Trade dialog gets real dialog semantics; unescaped entity fixed. |
| `668671f` | Login body bounded before buffering; login now enforces JSON content-type and size like every other write. |

The later four commits are tooling and documentation repairs plus two defects
found during the final review pass (the IST rollover in the market-session status
and the unbounded login body).

### The two bookkeeping fixes in detail

**Atomic decision + write.** `portfolio-execution.ts` now performs one
synchronous `BEGIN IMMEDIATE` transaction containing: idempotency claim → fresh
read of portfolio, positions and proposal → risk evaluation against *that* state
→ decision record → order → execution → cash-ledger entry → position write →
portfolio totals → snapshot → proposal transition → audit → notification →
idempotency completion. No `await` occurs inside it: quotes and fundamentals are
fetched first. A failure anywhere rolls every financial row back — a test forces
a late write to fail and asserts no order, execution or ledger row survives.

**Product-type correctness.** Positions are read and written by
`(portfolio_id, asset_id, product_type)`. A sell that has no matching delivery
position is rejected by the risk engine's sellable-quantity check *before* any
write, so it can no longer credit cash without moving shares.

## 5. Requirement-by-requirement status

| # | Requirement | Status | Evidence / gap |
| --- | --- | --- | --- |
| 1 | Inspect existing system before changing it | `COMPLETE` | Baseline recorded in §3; 161 → 248 tests |
| 2 | Make order execution atomic | `COMPLETE` | `tests/execution-integrity.test.ts` (26) |
| 3 | Eliminate stale-snapshot double spend | `COMPLETE` | Concurrent-execution test |
| 4 | Product-type-correct positions (CNC/MIS) | `COMPLETE` | CNC-vs-MIS tests |
| 5 | Prevent negative cash including charges | `COMPLETE` | Charge-aware cash test |
| 6 | Idempotent order submission | `COMPLETE` | Replay, conflict, in-flight tests |
| 7 | Atomic proposal lifecycle | `COMPLETE` | `PROPOSAL_NOT_EXECUTABLE` tests |
| 8 | Enforce every documented risk limit | `PARTIAL` | 17 of 18 checks can stop an order (§6). Maximum drawdown is conditional — see row 11. |
| 9 | Risk per trade | `COMPLETE` | Stop-distance model; assumption documented |
| 10 | Daily loss (per IST day, not lifetime) | `COMPLETE` | `executions.realised_pnl` + date filter |
| 11 | Max drawdown | `PARTIAL` | Blocks once ≥ 2 NAV snapshots exist (proved by test). A brand-new portfolio has no peak to measure against, so it reports `UNAVAILABLE` and that limit does not protect the first few orders. |
| 12 | Trading-hours / exchange calendar | `PARTIAL` | Session times, weekends, timezone and per-portfolio window enforced. **No holiday calendar ships** — NSE publishes it annually and inventing it would mis-gate orders. Configurable via `INVESTPILOT_TRADING_HOLIDAYS`; status is surfaced, not assumed. |
| 13 | Trading-schedule control actually enforced in the execution path | `COMPLETE` | Enforced with the window on; generation-time assessment is explicitly advisory |
| 14 | Product-type permissions (`allow_delivery` / `allow_intraday`) | `COMPLETE` | |
| 15 | REAL portfolio cannot trade | `COMPLETE` | Rejected before any write, 403 |
| 16 | `AUTONOMOUS_LIVE` / `AUTHORISED_LIVE` refused | `COMPLETE` | |
| 17 | No client-supplied fill price | `COMPLETE` | 400 on `price` in body |
| 18 | Quote validation before pricing | `COMPLETE` | Rejects missing, non-finite, non-positive or OHLC-inconsistent prices, unknown freshness, `STALE`/`HISTORICAL` quotes and future-dated timestamps (`src/lib/market-data/validation.ts`). Synthetic fixtures remain usable to price a **simulated** fill by design; the provenance layer marks such a proposal `isActionable: false`. No provider allowlist is enforced at the execution boundary. |
| 19 | Session authentication on every route | `COMPLETE` | 13 route files. 11 require a verified session; `login` is public by necessity and `logout` is public but idempotent (it revokes whatever session is presented and writes no data otherwise). |
| 20 | Session revocation | `COMPLETE` | `token_version`; logout and password change both bump it |
| 21 | Disabled accounts refused | `COMPLETE` | Checked on every request, not only at login |
| 22 | CSRF protection | `PARTIAL` | Three layers on all mutating routes. A request with **no** provenance headers is allowed (documented; not a browser vector). |
| 23 | Security headers / no wildcard CORS | `PARTIAL` | All present; `script-src` still needs `'unsafe-inline'` (no nonce propagation) |
| 24 | Cross-user isolation | `COMPLETE` | `tests/authz-ownership.test.ts` |
| 25 | Operator-only actions | `COMPLETE` | Env allowlist against verified session id |
| 26 | Rate limiting / quotas | `PARTIAL` | In-process memory; per-instance, resets on restart |
| 27 | Password storage | `COMPLETE` | scrypt, salted, no default account, no bypass |
| 28 | MFA / email verification / self-service reset | `BLOCKED` | No mail service and no second factor infrastructure exists in this repository |
| 29 | Provider trust, default deny | `COMPLETE` | Registry + allowlists empty by default |
| 30 | Verified market-data integration | `NOT APPLICABLE` | No licensed feed exists or can be procured here; `requireVerifiedProvider()` throws by design |
| 31 | Backtest input bounds | `COMPLETE` | Symbols, candles, capital, slippage, brokerage |
| 32 | Backtest look-ahead | `COMPLETE` | Same-bar entry removed; entry at `i+1` |
| 33 | Backtest honesty (CAGR/Sharpe/benchmark/OOS) | `COMPLETE` | Withheld rather than fabricated |
| 34 | Out-of-sample / walk-forward evaluation | `DEFERRED` | No held-out data exists; would require a data-splitting design |
| 35 | Worker liveness tells the truth | `COMPLETE` | Heartbeat table; job history never upgrades status |
| 36 | Overlapping job execution | `COMPLETE` | Conditional-UPDATE lock with TTL reclaim |
| 37 | Safe additive migrations | `COMPLETE` | `tests/migration-safety.test.ts` |
| 38 | Test isolation from the real database | `COMPLETE` | Separate file, wiped per run, asserted by test |
| 39 | Backup / restore procedure | `PARTIAL` | Documented and syntax-checked; **not rehearsed against a real user file** in this environment |
| 40 | Transaction-cost correctness | `COMPLETE` | Slippage folded into turnover so `gross == qty × fill` |
| 41 | Automated UI / accessibility tests | `BLOCKED` | No browser test harness runs in this environment |
| 42 | Accessibility review | `PARTIAL` | Dialog semantics, `aria-modal`, labels and Escape handling added; no screen-reader pass performed |
| 43 | CI runs on every push | `COMPLETE` | `push` / `pull_request` / `workflow_dispatch` |
| 44 | CI verifies typecheck, lint, tests, build, audit | `COMPLETE` | Workflow updated accordingly |
| 45 | Broken npm scripts repaired | `COMPLETE` | `db:init` (missing file) and `lint` (removed `next lint`) |
| 46 | Documentation matches behaviour | `COMPLETE` | README rewritten against the code |
| 47 | Isolated hardening branch | `PARTIAL` | All commits on `arena/de0ec973-stocks-agent`; see §2 deviation |
| 48 | Independent security audit | `NOT APPLICABLE` | Only source review and automated checks were performed; see `docs/SECURITY-REVIEW.md` |
| 49 | Deployment / production readiness | `NOT APPLICABLE` | Out of scope; the app is not safe to expose publicly |

## 6. Risk-control matrix

All 18 checks run inside the execution transaction, against freshly read state.

**17 are enforced: they can stop an order.** The eighteenth, maximum drawdown,
is not in the same category and is not counted as enforced — see the separate
table below. `UNAVAILABLE` means the control could not be measured; it is never
reported as a pass and never counted as protection.

| Control | Basis | On failure | Status |
| --- | --- | --- | --- |
| Portfolio active | `portfolios.is_active` | Reject | Enforced |
| Emergency stop | `user_settings.emergency_stop_enabled` | Reject | Enforced |
| Limits configured | finite, non-negative numbers present | **Reject** (fail closed) | Enforced |
| Product permission | `allow_delivery` / `allow_intraday` | Reject | Enforced |
| REAL portfolio | `type = 'REAL'` | Reject, 403, pre-write | Enforced |
| `AUTONOMOUS_LIVE` | order mode | Reject, 403 | Enforced |
| Orders per day | count for current IST date | Reject | Enforced |
| Max order value | `qty × effective price` (slippage included) | Reject | Enforced |
| Sellable quantity | `positions` for `(portfolio, asset, product)` | Reject, no cash credit | Enforced |
| Cash available | `cash − (turnover + charges) ≥ 0` | Reject | Enforced |
| Min cash reserve | post-trade cash % of NAV | Reject | Enforced |
| Single-stock cap | post-trade position % of NAV | Reject | Enforced |
| Portfolio exposure | post-trade market value % of NAV | Reject | Enforced |
| Max risk per trade | `qty × (price − stop)`; thesis stop, else documented 10 % assumption | Reject | Enforced |
| Daily loss | realised P&L for current IST date | Reject | Enforced |
| Trading window | NSE 09:15–15:30 IST + portfolio window (when `trading_schedule_enabled = 1`) | Reject | Enforced; holidays configurable, not shipped |
| Proposal approval | status, expiry, portfolio/asset/side/qty match | Reject | Enforced and re-checked in-transaction |

### Controls that are reported but not enforced

| Control | When it cannot be enforced | What is reported | Evidence |
| --- | --- | --- | --- |
| Max drawdown | Fewer than 2 NAV snapshots exist for the portfolio (a brand-new portfolio has none) | `MAX_DRAWDOWN` with status `UNAVAILABLE` — measured, not passed | `tests/risk-engine.test.ts` (3 drawdown cases) |
| Trading-window holidays | `INVESTPILOT_TRADING_HOLIDAYS` is unset (the default) | Weekends and session hours are enforced; public holidays are not, and the check says so | `tests/execution-integrity.test.ts` |

The drawdown gap is real and matters: a new portfolio can trade its first few
orders without any drawdown protection, because there is no recorded peak to
measure against. It is stated here rather than being folded into the "enforced"
count. No HTTP route can bypass any check: `enforceTradingWindow: false` is used
only by the strategist when drafting a proposal, and execution re-evaluates with
the window enforced; `bypassMarketHours` defaults to false and no route sets it.

## 7. Security summary

Full detail in `docs/SECURITY-REVIEW.md`. In short:

- **Closed:** unauthenticated reads, horizontal privilege escalation, cookie-only
  logout, CSRF on mutations, wildcard CORS, missing security headers, unscrubbed
  error leakage.
- **Open (High):** `script-src 'unsafe-inline'`; no browser-level verification of
  CSRF behaviour.
- **Accepted and documented:** in-process rate limiting, account-wide (not
  per-device) revocation, env-var operator role, no MFA / email / self-service
  reset.
- No independent penetration test was performed.

## 8. Data integrity and migrations

- `PRAGMA user_version` gates the schema; the app refuses to run against a newer
  database instead of silently downgrading it.
- v2 `users.is_disabled`; v3 `executions.realised_pnl`; v4 rebuilds
  `idempotency_keys` to fix its primary key (rows preserved); v5 adds
  `worker_heartbeats` and job-lock columns. All additive.
- `tests/migration-safety.test.ts` builds a previous-release database, fills it,
  upgrades it, and asserts every row and value survives; a second test proves the
  migration is idempotent.
- The real database file was never reset, reseeded or destructively migrated.
- Cash reconciliation no longer rewrites a balance silently; it writes an audited
  `CASH_RECONCILED` entry, and never touches a REAL portfolio.

## 9. Testing evidence

All figures below were produced by running the commands in this repository on the
commit that contains this document. They are not carried over from an earlier
state.

```
$ npm test
 Test Files  23 passed (23)
      Tests  248 passed (248)

$ npx tsc --noEmit
(no output — clean)

$ npm run lint
✖ 5 problems (0 errors, 5 warnings)   # pre-existing setState-in-effect advisories

$ npm run build
✓ Compiled successfully

$ npm audit --omit=dev
found 0 vulnerabilities

$ npm audit
9 vulnerabilities (2 moderate, 7 high)   # build-time only
```

Baseline before this work: **17 files / 161 tests**. Net: **+6 files / +87 tests**
(23 files, 248 tests).

**Runtime smoke test** (production build, `next start`, isolated throwaway
database, then the server was stopped and the file deleted):

| Request | Observed |
| --- | --- |
| `GET /` | `200` |
| `GET /api/orders` with no cookie | `401` |
| `GET /api/auth/session` with no cookie | `401` |
| `POST /api/auth/login` with `Origin: https://evil.example` + `Sec-Fetch-Site: cross-site` | `403` |
| `POST /api/auth/login` with a 20 KB body | `413` |
| `POST /api/auth/login` with `content-type: application/x-www-form-urlencoded` | `415` |
| Response headers on `/` | CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`; **no** `Access-Control-Allow-Origin` |

**Not proven by these numbers:** that the UI renders correctly, that keyboard and
screen-reader navigation works, that CSRF is blocked in a real browser, or that
any strategy is profitable. No manual exploratory testing session is claimed.

## 10. Git report

| Item | Value |
| --- | --- |
| Base commit | `417e2ec` |
| Base branch | untouched |
| Working branch | `arena/de0ec973-stocks-agent` |
| Commits added | Twelve from `3dbb736` to `e07f652`, plus documentation-only commits after that |
| Force-push | none |
| History rewrite | none |
| Branch deletion | none |
| PR state change | none (PR #3 untouched) |
| Staging | explicit paths only |
| Secrets / `.env` / DB / build artefacts committed | none |

## 11. Outstanding checklist

| Item | Status | Note |
| --- | --- | --- |
| Holiday calendar for NSE | `PARTIAL` | Must be supplied via `INVESTPILOT_TRADING_HOLIDAYS` |
| Nonce-based CSP | `DEFERRED` | Removes `'unsafe-inline'` |
| Browser-level CSRF / a11y test harness | `BLOCKED` | No browser available here |
| Distributed rate limiting | `DEFERRED` | Needs Redis or a DB-backed counter |
| Out-of-sample backtest evaluation | `DEFERRED` | Design work, not plumbing |
| Backup/restore rehearsal on a real file | `PARTIAL` | Procedure documented, untested on user data |
| Tailwind 4 migration (clears 9 build-time advisories) | `DEFERRED` | Breaking change; deliberately not forced |
| Branch naming per brief | `PARTIAL` | Platform-pinned working branch |
| Independent security audit | `NOT APPLICABLE` | Not performed by anyone external |

## 12. Release decisions

**Decision 1 — Is this build safe to run as a local, single-user demo?**
**Yes, with conditions.** The execution path is now internally consistent under
concurrency, refuses REAL accounts and `AUTONOMOUS_LIVE` before writing anything,
and every figure it displays about risk traces to a check that actually ran.
Conditions: keep it on `localhost`, keep the session secret out of source, do not
expose it to a LAN or the internet, and treat every price, fundamental and
backtest number as synthetic.

**Decision 2 — Is this build ready for real money or public deployment?**
**No.** There is no broker adapter, no verified market-data feed, no holiday
calendar, no MFA, no nonce-based CSP, no distributed rate limiting, and no
independent security review. Those are prerequisites, not polish. The REAL
portfolio guard must stay in place until each one is implemented *and* tested.

**Recommendation:** continue using the simulator for learning and for validating
the workflow, and treat the remaining `DEFERRED` items as the gate to any further
ambition.
