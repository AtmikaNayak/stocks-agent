# InvestPilot AI 2.0 🇮🇳
### Research and Virtual-Trading Platform for Indian Equities

**Current build status: demo / paper-trading only.** InvestPilot AI 2.0 contains a research dashboard, strategy and proposal workflows, a virtual portfolio simulator, deterministic risk checks, and an audit trail. The checked-in seed data is synthetic demo content—not verified NSE prices, audited fundamentals, real news, or validated backtest results. This codebase does **not** yet contain a verified external market-data adapter or real broker authentication/order/fill-reconciliation adapter. Real-money orders and live broker connection attempts are intentionally blocked.

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

1. **Mode 1: Manual** - User directs all orders; AI provides research and risk validation.
2. **Mode 2: AI Copilot** (Default) - AI researches and formulates proposals; user reviews and approves each order.
3. **Mode 3: Supervised Automation** - AI monitors and manages rebalancing within strict limits; user notified.
4. **Mode 4: Autonomous Paper Trading** - AI autonomously manages the virtual ₹25,000 simulator.
5. **Authorised Live Automation** - UI/data model placeholder only. It is rejected by the API and must remain disabled until a real broker adapter, credentials handling, order submission, status polling, and fill/balance reconciliation are implemented and independently tested.

---

## ⚠️ Current limitations and safe use

- Seeded OHLCV, fundamentals, news items, index cards and backtest records are for UI/demo testing only. They must not be described as verified or used to make investment decisions.
- Market-data integration currently reads SQLite. No live NSE feed is wired in this branch; unknown, invalid, and stale quote states must fail closed for simulation.
- Broker integration is intentionally disabled. Do not enter broker keys, secrets, PINs, or TOTP values into this build. A saved database row marked connected is not proof of a real session.
- Real-money execution is blocked in the execution service. Do not bypass the guard, set a broker row to `CONNECTED`, or toggle `AUTHORISED_LIVE` manually.
- Virtual trading is still a simulator. Costs are estimates and simulated fills do not establish likely future performance.
- Before any live use, implement and test provider-specific auth, secret storage, idempotent broker order submission, broker status polling, partial-fill/cancel handling, and broker-confirmed positions/cash reconciliation. Keep candidate strategies in backtest and paper trading until separately validated.
- The repository currently contains a SQLite file under `data/investpilot.db`. Back it up before running migrations or seed commands; seed re-runs are now non-destructive to existing portfolio rows.

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ or 22+
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
