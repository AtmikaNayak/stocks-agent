# InvestPilot AI 2.0 🇮🇳
### Research and Virtual-Trading Platform for Indian Equities

**Current build status: demo / paper-trading only.** InvestPilot AI 2.0 contains a research dashboard, strategy and proposal workflows, a virtual portfolio simulator, deterministic risk checks, and an audit trail. The checked-in seed data is synthetic demo content—not verified NSE prices, audited fundamentals, real news, or validated backtest results. This codebase does **not** yet contain a verified external market-data adapter or real broker authentication/order/fill-reconciliation adapter. Real-money orders and live broker connection attempts are intentionally blocked.

---

## Authentication, Authorization & Data Provenance

### Signing in

Every API route except `POST /api/auth/login` requires a valid session. The
Next.js UI shows a sign-in screen when no session exists.

```bash
# 1. Create the account row first (the seeded demo user already exists).
# 2. Provision a password (never stored in source, never printed):
INVESTPILOT_ADMIN_EMAIL="you@example.com" \
INVESTPILOT_ADMIN_PASSWORD="a-long-unique-passphrase" \
npm run auth:set-password
```

There is **no default account, no default password, no bypass header and no
environment variable that logs a user in**. Passwords are stored as salted
scrypt hashes in `user_credentials`. Sessions are HMAC-SHA256 signed tokens in
an `HttpOnly`, `SameSite=Lax`, `Path=/` cookie that is `Secure` whenever
`NODE_ENV=production`.

| Variable | Required | Purpose |
| --- | --- | --- |
| `INVESTPILOT_SESSION_SECRET` | **yes in production** (32+ chars) | Signs session cookies. Without it in production every session is rejected (401/503) — there is no fallback. In development a per-process random secret is generated. |
| `INVESTPILOT_SESSION_TTL_SECONDS` | no | Session lifetime, default `28800` (8 h), clamped to 300–604800. |
| `INVESTPILOT_ADMIN_EMAIL` / `INVESTPILOT_ADMIN_PASSWORD` | only for `auth:set-password` | Provisioning input. Never read by the running server. |

Because production cookies are `Secure`, a production server (`npm start`,
`NODE_ENV=production`) must be reached over HTTPS. Use `npm run dev` for plain
HTTP on localhost.

### Route protection

| Route | Method | Policy |
| --- | --- | --- |
| `/api/auth/login` | POST | Public. Rate-limited (10 failed attempts / 15 min per IP+email). |
| `/api/auth/logout` | POST | Public (idempotent); clears the cookie and audits when a session existed. |
| `/api/auth/session` | GET | Requires a session; returns the caller. |
| `/api/portfolios` | GET | Session; scoped to `portfolios.user_id` (positions and ledger joined through it). |
| `/api/orders` | GET | Session; scoped; a `portfolioId` that is not yours returns 404. |
| `/api/orders` | POST | Session; portfolio ownership checked before execution. |
| `/api/proposals` | GET | Session; scoped. |
| `/api/proposals` | POST `generate` | Session; target portfolio ownership checked. |
| `/api/proposals` | POST `respond` | Session; proposal existence **and** ownership resolved in one query; 404 otherwise. |
| `/api/settings` | GET/POST | Session; the hardcoded user id was removed — the session identity is used. |
| `/api/broker` | GET/POST | Session; scoped; a `userId` in the body is rejected, never trusted. |
| `/api/explainability` | GET/POST | Session; portfolio scoped (including evidence rows). |
| `/api/market` | GET | Session; watchlists scoped to the caller. |
| `/api/agents`, `/api/backtest`, `/api/system` | GET/POST | Session. Backtest/agent artifacts are workspace-wide research data and are not row-scoped; `/api/system` audit rows are limited to the caller. |

Authorization lives in one shared guard, `src/lib/auth/guard.ts`
(`requireAuth`, `requireOwnedPortfolio`, `requirePortfolioForRequest`).
Identity always comes from the verified session; client-supplied `userId`,
`x-user-id` or query parameters never change it.

### Provider trust (data provenance)

Trust is **default-deny**. A quote is verified/actionable only when its
freshness is `LIVE`, `DELAYED_15M` or `EOD` **and** its provider string is an
exact, case-sensitive match in a configured allowlist:

```bash
INVESTPILOT_TRUSTED_QUOTE_PROVIDERS=""        # empty by default
INVESTPILOT_TRUSTED_FUNDAMENTAL_SOURCES=""    # empty by default
```

Both lists ship empty because every price in this repository is a synthetic
fixture. An unknown, unconfigured, lookalike or misspelled source is
unverified and non-actionable; the word "demo" is used only for labels, never
to grant trust. Enabling an allowlist does **not** create a feed — no real
NSE/BSE adapter exists.

### Known limitations

- Single-tenant demo: one database, and login rate limiting is in-process only
  (it resets on restart and is not shared between instances).
- No role separation — any authenticated user can run the shared research
  actions (`/api/agents`, `/api/backtest`, `/api/system`), which are not
  row-scoped.
- Logout clears the client cookie; signed tokens are stateless and cannot be
  revoked server-side before they expire.
- This is not a hardened internet-facing auth service: there is no MFA, email
  verification, password-reset flow or CSRF token (mitigated by `SameSite=Lax`
  and JSON-only POST bodies).

---

## 🏛️ Key System Architecture

```
                                 +-------------------------------------+
                                 |         InvestPilot AI 2.0          |
                                 |       Next.js / TypeScript App      |
                                 +-------------------------------------+
                                                    |
                      +-----------------------------+-----------------------------+
                      |                                                           |
                      v                                                           v
       +-------------------------------+                           +-------------------------------+
       |   Environment A: Live (BLOCKED) |                         |   Environment B: Virtual      |
       |   No broker adapter yet       |                           |     Persistent Simulator      |
       |  (Zerodha / Angel / Upstox)   |                           |    Pre-funded: ₹25,000 INR    |
       +-------------------------------+                           +-------------------------------+
                      |                                                           |
                      +-----------------------------+-----------------------------+
                                                    |
                                                    v
                                    +-------------------------------+
                                    |  Deterministic Risk Engine    |
                                    |  (Hard mathematical limits)  |
                                    |  - Max 15% single stock cap   |
                                    |  - Max 80% portfolio exposure |
                                    |  - Min 20% liquid cash buffer |
                                    |  - ₹1,500 daily loss limit    |
                                    |  - Instant Emergency Kill-Sw  |
                                    +-------------------------------+
                                                    |
                      +-----------------------------+-----------------------------+
                      |                             |                             |
                      v                             v                             v
           +--------------------+        +--------------------+        +--------------------+
           | Agent 1: Market    |        | Agent 2: Strategist|        | Agent 3: Execution |
           | Intelligence (Scan)|        | Agent (Proposals)  |        | Agent (Ledger/Tax) |
           +--------------------+        +--------------------+        +--------------------+
                      \                             |                             /
                       \                            |                            /
                        +---------------------------+---------------------------+
                                                    |
                                                    v
                                       +-------------------------+
                                       | Agent 4: Explainability |
                                       | & Grounded Audit Trail  |
                                       +-------------------------+
```

---

## 💎 The Four Specialised AI Agents

1. **Agent 1: Market Intelligence Agent (`src/lib/agents/market-intelligence.ts`)**
   - Reads local seeded market-data rows and sample announcements. Until an external provider is integrated, these rows are demo fixtures only.
   - Keeps stored data and derived observations available for the UI; the current seed does not verify the sample values against real sources.
   - Generates priority watchlists. Strictly read-only; cannot submit orders.

2. **Agent 2: Investment Strategist Agent (`src/lib/agents/strategist.ts`)**
   - Evaluates long-term wealth compounding vs short-term trend trades.
   - Establishes entry conditions, expected statutory costs, alternatives considered, and explicit **thesis invalidation criteria**.
   - Produces structured, auditable proposals that require review or permission checks.

3. **Agent 3: Portfolio & Execution Agent (`src/lib/agents/portfolio-execution.ts`)**
   - Simulates virtual trades using an estimated Indian transaction-cost model and a local ledger. These outputs are simulations, not exchange executions.
   - Blocks all real-money orders because broker submission and broker-confirmed fill reconciliation are not implemented.
   - Rejects client-supplied fill prices and invalid quantities; simulator execution requires stored quote data.

4. **Agent 4: Explainability, Audit & Learning Agent (`src/lib/agents/explainability.ts`)**
   - Records pre-execution decision rationale **before** order submission (no retroactive justification).
   - Offers dual explanations: plain language for complete beginners and quantitative metrics for experienced investors.
   - Provides a conversational Q&A assistant answering questions strictly grounded in stored database records:
     - *“Why did you make this decision?”*
     - *“What could go wrong?”*
     - *“What alternatives were considered?”*

---

## 🛡️ Deterministic Risk Management Engine

Risk checks are deterministic TypeScript code, not free-form LLM output. They are safety controls, not a guarantee of profit or a substitute for validating the input data:
- **Maximum Single Stock Allocation:** Capped at 15% of portfolio NAV.
- **Minimum Cash Reserve Buffer:** Preserves a minimum 20% liquid cash buffer at all times.
- **Maximum Portfolio Exposure:** Maximum 80% invested.
- **Daily Loss Circuit Safeguard:** Halts new orders if daily losses exceed ₹1,500.
- **Single Order Value Ceiling:** Rejects any order exceeding ₹10,000.
- **Order Frequency Throttle:** Max 10 orders per trading day.
- **Trading Schedule:** Restricts execution to official NSE equity hours (09:20 - 15:15 IST).
- **Emergency Stop:** Immediate kill-switch halts all trading instantly.

---

## 🇮🇳 Estimated Indian Transaction-Cost Model

The simulator estimates transaction costs using configured rates. These are illustrative estimates, not broker-confirmed charges or legal/tax advice. Verify current rates before relying on them:
- **STT (Securities Transaction Tax):** 0.1% on delivery (CNC) buy & sell; 0.025% on intraday sell.
- **Exchange Turnover Charges:** 0.00345% (NSE).
- **SEBI Turnover Charges:** ₹10 per crore (0.0001%).
- **Stamp Duty:** 0.015% on buy delivery.
- **Brokerage:** Discount broker model (min of ₹20 or 0.03%).
- **GST:** 18% on (Brokerage + Exchange turnover fees + SEBI charges).
- **Slippage:** Configurable realistic execution model (0.05% default).

---

## 🎛️ Control Modes in This Build

The interface uses friendlier labels than the internal mode names; the mapping is in brackets.

1. **Mode 1: Manual** [“Watch only”] - User directs all orders; AI provides research and risk validation.
2. **Mode 2: AI Copilot** [“AI suggests, you decide”] (Default) - AI researches and formulates proposals; user reviews and approves each order.
3. **Mode 3: Supervised Automation** [“AI helps with rebalancing”] - AI monitors and manages rebalancing within strict limits; user notified.
4. **Mode 4: Autonomous Paper Trading** [“Fully automated (practice money only)”] - AI autonomously manages the virtual ₹25,000 simulator.
5. **Authorised Live Automation** [shown as unavailable] - UI/data model placeholder only. It is rejected by the API and must remain disabled until a real broker adapter, credentials handling, order submission, status polling, and fill/balance reconciliation are implemented and independently tested.

---

## ⚠️ Current limitations and safe use

- Seeded OHLCV, fundamentals, news items, index cards and backtest records are for UI/demo testing only. They must not be described as verified or used to make investment decisions.
- Market-data integration currently reads SQLite. No live NSE feed is wired in this branch; unknown, invalid, and stale quote states must fail closed for simulation.
- Broker integration is intentionally disabled. Do not enter broker keys, secrets, PINs, or TOTP values into this build. A saved database row marked connected is not proof of a real session.
- Real-money execution is blocked in the execution service. Do not bypass the guard, set a broker row to `CONNECTED`, or toggle `AUTHORISED_LIVE` manually.
- Virtual trading is still a simulator. Costs are estimates and simulated fills do not establish likely future performance.
- Before any live use, implement and test provider-specific auth, secret storage, idempotent broker order submission, broker status polling, partial-fill/cancel handling, and broker-confirmed positions/cash reconciliation. Keep candidate strategies in backtest and paper trading until separately validated.
- The repository currently contains a SQLite file under `data/investpilot.db`. Back it up before running migrations or seed commands; seed re-runs are now non-destructive to existing portfolio rows.
- This is a single-user local prototype and does not yet implement authenticated application sessions/authorization for its API routes. The npm scripts bind to `127.0.0.1` by default; do not expose the app to a LAN or the public internet until authentication, authorization, CSRF protection, and secret-management controls are implemented.
- The current dependency tree reports npm security advisories, including critical/high severity items, and the current Next.js version is flagged as vulnerable. Run a reviewed dependency update and retest before any deployment; do not use `npm audit fix --force` blindly.

## 🧭 Interface guide (beginner-first)

The app is organised around what a first-time investor actually needs, not around internal module names:

- **Everyday** — Home, Learn the basics, Practice portfolio, Explore shares, Ideas & decisions, Safety & limits.
- **More tools** — research, AI assistants, orders and receipts, performance, backtesting, strategies, the read-only real account, broker status, automation controls, updates, system status and settings.

House conventions in the UI:
- Money is always shown in ₹ with Indian digit grouping; profit/loss is the only place green and red appear.
- Plain words are preferred to jargon, and any technical term is one tap away in the built-in glossary (help icon in the top bar).
- The top status strip states plainly that this is a practice build: simulated money, demo prices, and no real orders. A separate read-only banner appears when the real account is selected.
- Every important figure is described in a sentence next to it, and empty states explain the next step instead of showing a blank table.

---

## 🚀 Getting Started

### Prerequisites
- Node.js 22+ (required by the current better-sqlite3 dependency)
- npm 9+

### Installation & Database Initialization

```bash
# Clone the repository
git clone https://github.com/AtmikaNayak/stocks-agent.git
cd stocks-agent

# Install dependencies
npm install

# Initialize demo fixtures (synthetic data; not verified NSE data)
npm run db:seed

# Run automated test suite
npm test

# Build production application
npm run build

# Start web application
npm run start
```

The application will be live at `http://localhost:3000`.

### Background Worker Runner
To run the background scheduler daemon for periodic MTM revaluation, risk checks, and thesis reviews:
```bash
npm run worker
```

---

## 🧪 Automated Testing

InvestPilot AI 2.0 includes automated test suites covering:
- Statutory Indian taxes, STT, and slippage calculations (`tests/tax-calculator.test.ts`)
- Deterministic risk limits, position caps, and emergency stops (`tests/risk-engine.test.ts`)
- Strict financial isolation between Real and Virtual portfolios (`tests/execution-isolation.test.ts`)
- Four AI agents coordination and grounded Q&A (`tests/agents.test.ts`)
- Quantitative backtesting with no look-ahead bias (`tests/backtesting.test.ts`)
- Money/percentage formatting and plain-language helpers used across the UI (`tests/format.test.ts`)

Run all tests:
```bash
npm test
```

---

## 🐳 Docker Deployment

Run with Docker Compose:
```bash
docker-compose up --build -d
```

---

## ⚖️ Regulatory Notice & SEBI Compliance

InvestPilot AI 2.0 is an educational and personal execution software platform. It is not a SEBI-registered Investment Adviser (RIA) or Portfolio Management Service (PMS). Real-money automation is disabled by default and requires explicit broker API authorization and statutory risk acknowledgment.
