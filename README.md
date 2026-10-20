# InvestPilot AI 2.0 🇮🇳
### Autonomous Personal Investment, Trading, Learning and Portfolio Management Platform

InvestPilot AI 2.0 is an evidence-based personal investment and trading platform designed specifically for the Indian equity markets (NSE/BSE). It brings together autonomous AI research agents, strict deterministic mathematical risk controls, and a dual-portfolio architecture that completely isolates virtual simulation from authorized real-money broker execution.

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
       |   Environment A: Real-Money   |                           |   Environment B: Virtual      |
       |     Authorized Demat Demat    |                           |     Persistent Simulator      |
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
   - Monitors live & historical NSE quotes and corporate announcements.
   - Separates empirical facts (e.g. *“ROCE is 48.5%, D/E is 0.0, volume +25% above 10-day avg”*) from model interpretations (*“High capital efficiency with zero balance-sheet risk”*).
   - Generates priority watchlists. Strictly read-only; cannot submit orders.

2. **Agent 2: Investment Strategist Agent (`src/lib/agents/strategist.ts`)**
   - Evaluates long-term wealth compounding vs short-term trend trades.
   - Establishes entry conditions, expected statutory costs, alternatives considered, and explicit **thesis invalidation criteria**.
   - Produces structured, auditable proposals that require review or permission checks.

3. **Agent 3: Portfolio & Execution Agent (`src/lib/agents/portfolio-execution.ts`)**
   - Executes virtual trades through the realistic simulator with exact Indian statutory fees (STT, NSE turnover fees, SEBI charges, Stamp Duty, 18% GST, brokerage, and slippage).
   - For real-money execution: performs server-side authorization checks, validates broker session, enforces SEBI compliance acknowledgment, and prevents duplicate orders.
   - Maintains an immutable double-entry cash ledger.

4. **Agent 4: Explainability, Audit & Learning Agent (`src/lib/agents/explainability.ts`)**
   - Records pre-execution decision rationale **before** order submission (no retroactive justification).
   - Offers dual explanations: plain language for complete beginners and quantitative metrics for experienced investors.
   - Provides a conversational Q&A assistant answering questions strictly grounded in stored database records:
     - *“Why did you make this decision?”*
     - *“What could go wrong?”*
     - *“What alternatives were considered?”*

---

## 🛡️ Deterministic Risk Management Engine

All risk boundaries are computed with deterministic TypeScript code, never free-form LLM output:
- **Maximum Single Stock Allocation:** Capped at 15% of portfolio NAV.
- **Minimum Cash Reserve Buffer:** Preserves a minimum 20% liquid cash buffer at all times.
- **Maximum Portfolio Exposure:** Maximum 80% invested.
- **Daily Loss Circuit Safeguard:** Halts new orders if daily losses exceed ₹1,500.
- **Single Order Value Ceiling:** Rejects any order exceeding ₹10,000.
- **Order Frequency Throttle:** Max 10 orders per trading day.
- **Trading Schedule:** Restricts execution to official NSE equity hours (09:20 - 15:15 IST).
- **Emergency Stop:** Immediate kill-switch halts all trading instantly.

---

## 🇮🇳 Real Statutory Indian Transaction Costs

The platform models actual Indian regulatory taxes:
- **STT (Securities Transaction Tax):** 0.1% on delivery (CNC) buy & sell; 0.025% on intraday sell.
- **Exchange Turnover Charges:** 0.00345% (NSE).
- **SEBI Turnover Charges:** ₹10 per crore (0.0001%).
- **Stamp Duty:** 0.015% on buy delivery.
- **Brokerage:** Discount broker model (min of ₹20 or 0.03%).
- **GST:** 18% on (Brokerage + Exchange turnover fees + SEBI charges).
- **Slippage:** Configurable realistic execution model (0.05% default).

---

## 🎛️ Five User Autonomy Modes

1. **Mode 1: Manual** - User directs all orders; AI provides research and risk validation.
2. **Mode 2: AI Copilot** (Default) - AI researches and formulates proposals; user reviews and approves each order.
3. **Mode 3: Supervised Automation** - AI monitors and manages rebalancing within strict limits; user notified.
4. **Mode 4: Autonomous Paper Trading** - AI autonomously manages the virtual ₹25,000 simulator.
5. **Mode 5: Authorised Live Automation** - AI submits eligible real orders only after multi-factor broker authentication, SEBI compliance confirmation, and hard risk checks.

---

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

# Initialize and seed database with verified NSE market data
npm run db:seed

# Run automated test suites (12 unit and integration tests)
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
