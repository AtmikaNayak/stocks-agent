-- InvestPilot AI 2.0 Database Schema
-- Strict financial isolation between REAL and VIRTUAL portfolios
-- Immutable ledger entries, auditable agent decisions and strategy versions

PRAGMA foreign_keys = ON;

-- 1. Users
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    -- A disabled account cannot authenticate and its existing sessions are
    -- rejected server-side (see src/lib/auth/session.ts + guard.ts).
    is_disabled INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 1b. Local Credentials (scrypt password hashes)
-- No default, seeded, or hardcoded password is ever inserted here. Operators
-- provision credentials explicitly with `npm run auth:set-password`.
CREATE TABLE IF NOT EXISTS user_credentials (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    password_hash TEXT NOT NULL,
    password_updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_login_at TEXT,
    -- Bumped on logout, password change or account disable. A stateless signed
    -- session carries the value it was issued with; a mismatch revokes it.
    token_version INTEGER NOT NULL DEFAULT 0
);

-- 2. User Settings & Control Modes
-- control_mode: 'MANUAL', 'COPILOT', 'SUPERVISED', 'AUTONOMOUS_PAPER', 'AUTHORISED_LIVE'
-- experience_mode: 'BEGINNER', 'ADVANCED'
CREATE TABLE IF NOT EXISTS user_settings (
    id TEXT PRIMARY KEY,
    user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    experience_mode TEXT NOT NULL DEFAULT 'BEGINNER',
    control_mode TEXT NOT NULL DEFAULT 'COPILOT',
    emergency_stop_enabled INTEGER NOT NULL DEFAULT 0,
    emergency_stop_reason TEXT,
    emergency_stopped_at TEXT,
    notifications_email_enabled INTEGER NOT NULL DEFAULT 1,
    notifications_in_app_enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 3. Broker Connections (Real-Money Environment)
-- Status: 'DISCONNECTED', 'CONNECTING', 'CONNECTED', 'REVOKED', 'ERROR'
CREATE TABLE IF NOT EXISTS broker_connections (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    broker_name TEXT NOT NULL, -- 'ZERODHA', 'ANGEL_ONE', 'UPSTOX'
    client_id TEXT NOT NULL,
    api_key_masked TEXT NOT NULL,
    encrypted_access_token TEXT,
    token_expires_at TEXT,
    status TEXT NOT NULL DEFAULT 'DISCONNECTED',
    status_message TEXT,
    last_synced_at TEXT,
    compliance_acknowledged INTEGER NOT NULL DEFAULT 0,
    compliance_acknowledged_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 4. Portfolios (Strict separation: REAL vs VIRTUAL)
CREATE TABLE IF NOT EXISTS portfolios (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK(type IN ('REAL', 'VIRTUAL')),
    name TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'INR',
    initial_capital REAL NOT NULL,
    current_cash REAL NOT NULL,
    invested_value REAL NOT NULL DEFAULT 0.0,
    total_value REAL NOT NULL,
    realised_pnl REAL NOT NULL DEFAULT 0.0,
    unrealised_pnl REAL NOT NULL DEFAULT 0.0,
    is_active INTEGER NOT NULL DEFAULT 1,
    broker_connection_id TEXT REFERENCES broker_connections(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 5. Portfolio Permissions & Risk Limits
CREATE TABLE IF NOT EXISTS portfolio_permissions (
    id TEXT PRIMARY KEY,
    portfolio_id TEXT UNIQUE NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
    allow_autonomous_trading INTEGER NOT NULL DEFAULT 0,
    max_position_pct REAL NOT NULL DEFAULT 15.0, -- max 15% of portfolio in single stock
    max_portfolio_exposure_pct REAL NOT NULL DEFAULT 80.0, -- max 80% invested
    min_cash_reserve_pct REAL NOT NULL DEFAULT 20.0, -- 20% buffer in cash
    max_risk_per_trade_pct REAL NOT NULL DEFAULT 2.0, -- max 2% capital risk per trade
    max_daily_loss_limit REAL NOT NULL DEFAULT 1500.0, -- in INR
    max_drawdown_limit_pct REAL NOT NULL DEFAULT 10.0,
    max_order_value REAL NOT NULL DEFAULT 10000.0,
    max_orders_per_day INTEGER NOT NULL DEFAULT 10,
    allow_intraday INTEGER NOT NULL DEFAULT 0,
    allow_delivery INTEGER NOT NULL DEFAULT 1,
    trading_schedule_enabled INTEGER NOT NULL DEFAULT 1,
    trading_window_start TEXT NOT NULL DEFAULT '09:20', -- IST
    trading_window_end TEXT NOT NULL DEFAULT '15:15', -- IST
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 6. Portfolio Snapshots (For historical tracking & charts)
CREATE TABLE IF NOT EXISTS portfolio_snapshots (
    id TEXT PRIMARY KEY,
    portfolio_id TEXT NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    cash_balance REAL NOT NULL,
    positions_value REAL NOT NULL,
    total_value REAL NOT NULL,
    daily_pnl REAL NOT NULL DEFAULT 0.0,
    realised_pnl REAL NOT NULL DEFAULT 0.0,
    unrealised_pnl REAL NOT NULL DEFAULT 0.0,
    drawdown_pct REAL NOT NULL DEFAULT 0.0
);

-- 7. Assets / Instruments
CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY,
    symbol TEXT UNIQUE NOT NULL,
    exchange TEXT NOT NULL DEFAULT 'NSE',
    name TEXT NOT NULL,
    sector TEXT NOT NULL,
    industry TEXT,
    asset_type TEXT NOT NULL DEFAULT 'EQUITY', -- 'EQUITY', 'INDEX'
    lot_size INTEGER NOT NULL DEFAULT 1,
    tick_size REAL NOT NULL DEFAULT 0.05,
    is_tradable INTEGER NOT NULL DEFAULT 1,
    isin TEXT,
    description TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 8. Watchlists & Items
CREATE TABLE IF NOT EXISTS watchlists (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS watchlist_items (
    id TEXT PRIMARY KEY,
    watchlist_id TEXT NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
    asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    added_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(watchlist_id, asset_id)
);

-- 9. Market Data Points (OHLCV and tick history)
CREATE TABLE IF NOT EXISTS market_data_points (
    id TEXT PRIMARY KEY,
    asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    timestamp TEXT NOT NULL,
    timeframe TEXT NOT NULL DEFAULT '1D', -- '1m', '5m', '15m', '1D'
    open REAL NOT NULL,
    high REAL NOT NULL,
    low REAL NOT NULL,
    close REAL NOT NULL,
    volume INTEGER NOT NULL,
    vwap REAL,
    provider TEXT NOT NULL, -- real providers or SYNTHETIC_SEED for generated demo fixtures
    freshness_status TEXT NOT NULL DEFAULT 'STALE', -- 'LIVE', 'DELAYED_15M', 'EOD', 'HISTORICAL', 'SYNTHETIC', 'STALE'; never assume verified by default
    quality_score REAL NOT NULL DEFAULT 1.0,
    retrieved_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(asset_id, timestamp, timeframe)
);

-- 10. Company Fundamentals
CREATE TABLE IF NOT EXISTS company_fundamentals (
    id TEXT PRIMARY KEY,
    asset_id TEXT UNIQUE NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    market_cap REAL NOT NULL,
    pe_ratio REAL,
    pb_ratio REAL,
    dividend_yield REAL,
    roe REAL,
    roce REAL,
    debt_to_equity REAL,
    eps_ttm REAL,
    operating_margin REAL,
    net_profit_margin REAL,
    revenue_growth_yoy REAL,
    profit_growth_yoy REAL,
    free_cash_flow REAL,
    financial_year TEXT NOT NULL,
    source TEXT NOT NULL,
    verified_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 11. News Items
CREATE TABLE IF NOT EXISTS news_items (
    id TEXT PRIMARY KEY,
    asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
    headline TEXT NOT NULL,
    summary TEXT NOT NULL,
    source TEXT NOT NULL,
    url TEXT,
    sentiment_score REAL NOT NULL DEFAULT 0.0, -- -1.0 to +1.0
    sentiment_label TEXT NOT NULL DEFAULT 'NEUTRAL',
    published_at TEXT NOT NULL,
    retrieved_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 12. Agent Runs (Monitoring agent activities)
CREATE TABLE IF NOT EXISTS agent_runs (
    id TEXT PRIMARY KEY,
    agent_name TEXT NOT NULL, -- 'MARKET_INTELLIGENCE', 'STRATEGIST', 'PORTFOLIO_EXECUTION', 'EXPLAINABILITY'
    trigger_type TEXT NOT NULL, -- 'SCHEDULED', 'MANUAL', 'EVENT'
    status TEXT NOT NULL DEFAULT 'COMPLETED', -- 'RUNNING', 'COMPLETED', 'FAILED'
    summary TEXT NOT NULL,
    metadata_json TEXT,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT
);

-- 13. Agent Observations (Market Intelligence findings)
CREATE TABLE IF NOT EXISTS agent_observations (
    id TEXT PRIMARY KEY,
    agent_run_id TEXT REFERENCES agent_runs(id) ON DELETE SET NULL,
    asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    observation_type TEXT NOT NULL, -- 'BREAKOUT', 'VALUATION_DISCOUNT', 'UNUSUAL_VOLUME', 'EARNINGS_BEAT', 'RISK_SPIKE'
    facts TEXT NOT NULL,
    interpretation TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'MEDIUM', -- 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
    catalysts TEXT,
    risks TEXT,
    data_sources TEXT NOT NULL,
    is_actionable INTEGER NOT NULL DEFAULT 1,
    observed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 14. Investment Theses
CREATE TABLE IF NOT EXISTS investment_theses (
    id TEXT PRIMARY KEY,
    portfolio_id TEXT NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
    asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    horizon TEXT NOT NULL, -- 'LONG_TERM', 'SHORT_TERM'
    core_thesis TEXT NOT NULL,
    catalysts TEXT NOT NULL,
    target_price REAL,
    stop_loss_price REAL,
    time_horizon_days INTEGER NOT NULL,
    invalidation_criteria TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'VALIDATED', 'INVALIDATED', 'CLOSED'
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS thesis_reviews (
    id TEXT PRIMARY KEY,
    thesis_id TEXT NOT NULL REFERENCES investment_theses(id) ON DELETE CASCADE,
    review_date TEXT NOT NULL DEFAULT (datetime('now')),
    status TEXT NOT NULL, -- 'ON_TRACK', 'WARNING', 'INVALIDATED'
    notes TEXT NOT NULL,
    metrics_snapshot TEXT
);

-- 15. Strategy Definitions & Versions
CREATE TABLE IF NOT EXISTS strategy_definitions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    horizon TEXT NOT NULL, -- 'LONG_TERM', 'SHORT_TERM'
    category TEXT NOT NULL, -- 'VALUE_QUALITY', 'MOMENTUM_TREND', 'MEAN_REVERSION', 'DEFENSIVE'
    is_active INTEGER NOT NULL DEFAULT 1,
    active_version_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS strategy_versions (
    id TEXT PRIMARY KEY,
    strategy_id TEXT NOT NULL REFERENCES strategy_definitions(id) ON DELETE CASCADE,
    version_tag TEXT NOT NULL,
    parameters_json TEXT NOT NULL,
    rationale TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'DEVELOPMENT', -- 'DEVELOPMENT', 'BACKTESTED', 'SHADOW', 'PAPER_TESTING', 'APPROVED_LIVE', 'REJECTED', 'ROLLED_BACK'
    approval_notes TEXT,
    approved_by TEXT,
    approved_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 16. Backtest Runs & Strategy Evaluations
CREATE TABLE IF NOT EXISTS backtest_runs (
    id TEXT PRIMARY KEY,
    strategy_version_id TEXT NOT NULL REFERENCES strategy_versions(id) ON DELETE CASCADE,
    asset_universe TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    initial_capital REAL NOT NULL DEFAULT 25000.0,
    final_capital REAL NOT NULL,
    total_return_pct REAL NOT NULL,
    cagr_pct REAL NOT NULL,
    max_drawdown_pct REAL NOT NULL,
    sharpe_ratio REAL NOT NULL,
    sortino_ratio REAL NOT NULL,
    win_rate_pct REAL NOT NULL,
    total_trades INTEGER NOT NULL,
    turnover_ratio REAL NOT NULL,
    slippage_assumed_pct REAL NOT NULL DEFAULT 0.1,
    brokerage_assumed REAL NOT NULL DEFAULT 20.0,
    out_of_sample_tested INTEGER NOT NULL DEFAULT 0,
    results_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS strategy_evaluations (
    id TEXT PRIMARY KEY,
    strategy_version_id TEXT NOT NULL REFERENCES strategy_versions(id) ON DELETE CASCADE,
    evaluation_type TEXT NOT NULL, -- 'SHADOW', 'PAPER', 'LIVE'
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    benchmark_symbol TEXT NOT NULL DEFAULT 'NIFTY50',
    strategy_return_pct REAL NOT NULL,
    benchmark_return_pct REAL NOT NULL,
    alpha_pct REAL NOT NULL,
    beta REAL NOT NULL,
    max_drawdown_pct REAL NOT NULL,
    trade_count INTEGER NOT NULL,
    verdict TEXT NOT NULL, -- 'PROMOTE', 'HOLD', 'REJECT', 'ROLLBACK'
    verdict_reason TEXT NOT NULL,
    evaluated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 17. Investment Proposals (From Strategist Agent)
CREATE TABLE IF NOT EXISTS investment_proposals (
    id TEXT PRIMARY KEY,
    portfolio_id TEXT NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
    asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    strategy_version_id TEXT REFERENCES strategy_versions(id) ON DELETE SET NULL,
    action TEXT NOT NULL CHECK(action IN ('BUY', 'SELL', 'HOLD', 'WAIT')),
    horizon TEXT NOT NULL CHECK(horizon IN ('LONG_TERM', 'SHORT_TERM')),
    proposed_price REAL NOT NULL,
    proposed_quantity INTEGER NOT NULL,
    proposed_value REAL NOT NULL,
    rationale TEXT NOT NULL,
    supporting_evidence TEXT NOT NULL,
    contrary_evidence TEXT NOT NULL,
    alternatives_considered TEXT NOT NULL,
    invalidation_criteria TEXT NOT NULL,
    preconditions TEXT NOT NULL,
    expected_costs REAL NOT NULL,
    expires_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'APPROVED', 'REJECTED_RISK', 'REJECTED_USER', 'EXPIRED', 'EXECUTED'
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 18. Deterministic Risk Assessments
CREATE TABLE IF NOT EXISTS risk_assessments (
    id TEXT PRIMARY KEY,
    proposal_id TEXT UNIQUE NOT NULL REFERENCES investment_proposals(id) ON DELETE CASCADE,
    passed INTEGER NOT NULL,
    rejection_reasons TEXT,
    checks_json TEXT NOT NULL, -- Detailed boolean checks
    calculated_exposure_after_pct REAL NOT NULL,
    calculated_position_pct REAL NOT NULL,
    cash_remaining_after REAL NOT NULL,
    assessed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 19. Decision Records & Evidence (Pre-execution audit trail)
CREATE TABLE IF NOT EXISTS decision_records (
    id TEXT PRIMARY KEY,
    portfolio_id TEXT NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
    proposal_id TEXT REFERENCES investment_proposals(id) ON DELETE SET NULL,
    strategy_version_id TEXT REFERENCES strategy_versions(id) ON DELETE SET NULL,
    asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    price REAL NOT NULL,
    decision_timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    reasoning_plain_language TEXT NOT NULL,
    reasoning_advanced TEXT NOT NULL,
    risk_assessment_summary TEXT NOT NULL,
    what_could_go_wrong TEXT NOT NULL,
    market_snapshot_json TEXT NOT NULL,
    portfolio_state_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'RECORDED'
);

CREATE TABLE IF NOT EXISTS decision_evidence (
    id TEXT PRIMARY KEY,
    decision_id TEXT NOT NULL REFERENCES decision_records(id) ON DELETE CASCADE,
    evidence_type TEXT NOT NULL, -- 'FINANCIAL_RATIO', 'PRICE_ACTION', 'NEWS', 'REGULATORY', 'VALUATION'
    title TEXT NOT NULL,
    detail TEXT NOT NULL,
    source TEXT NOT NULL,
    source_timestamp TEXT NOT NULL,
    is_supporting INTEGER NOT NULL -- 1 = supporting, 0 = contrary
);

-- 20. Orders & Executions
-- order_mode: 'MANUAL', 'AI_PROPOSAL_APPROVED', 'AUTONOMOUS_VIRTUAL', 'AUTONOMOUS_LIVE'
-- status: 'PENDING_APPROVAL', 'SUBMITTED', 'OPEN', 'FILLED', 'PARTIALLY_FILLED', 'REJECTED', 'CANCELLED'
CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    portfolio_id TEXT NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
    asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    decision_id TEXT REFERENCES decision_records(id) ON DELETE SET NULL,
    proposal_id TEXT REFERENCES investment_proposals(id) ON DELETE SET NULL,
    portfolio_type TEXT NOT NULL CHECK(portfolio_type IN ('REAL', 'VIRTUAL')),
    order_mode TEXT NOT NULL,
    side TEXT NOT NULL CHECK(side IN ('BUY', 'SELL')),
    order_type TEXT NOT NULL DEFAULT 'LIMIT', -- 'MARKET', 'LIMIT', 'SL_LIMIT'
    product_type TEXT NOT NULL DEFAULT 'CNC', -- 'CNC' (Cash n Carry delivery) or 'MIS' (Intraday)
    quantity INTEGER NOT NULL,
    filled_quantity INTEGER NOT NULL DEFAULT 0,
    price REAL NOT NULL,
    average_fill_price REAL,
    trigger_price REAL,
    status TEXT NOT NULL DEFAULT 'SUBMITTED',
    status_reason TEXT,
    broker_order_id TEXT,
    idempotency_key TEXT UNIQUE NOT NULL,
    submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS executions (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    portfolio_id TEXT NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
    asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    portfolio_type TEXT NOT NULL CHECK(portfolio_type IN ('REAL', 'VIRTUAL')),
    side TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    fill_price REAL NOT NULL,
    gross_amount REAL NOT NULL,
    brokerage REAL NOT NULL DEFAULT 0.0,
    stt_charges REAL NOT NULL DEFAULT 0.0,
    exchange_turnover_charges REAL NOT NULL DEFAULT 0.0,
    stamp_duty REAL NOT NULL DEFAULT 0.0,
    sebi_charges REAL NOT NULL DEFAULT 0.0,
    gst REAL NOT NULL DEFAULT 0.0,
    total_charges REAL NOT NULL DEFAULT 0.0,
    net_amount REAL NOT NULL,
    -- P&L booked by this fill. Zero for BUY; on SELL it is
    -- (fill − average cost) × quantity − charges. Used by the daily-loss limit.
    realised_pnl REAL NOT NULL DEFAULT 0.0,
    executed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 21. Positions (Current active holdings per portfolio)
CREATE TABLE IF NOT EXISTS positions (
    id TEXT PRIMARY KEY,
    portfolio_id TEXT NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
    asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    portfolio_type TEXT NOT NULL CHECK(portfolio_type IN ('REAL', 'VIRTUAL')),
    product_type TEXT NOT NULL DEFAULT 'CNC',
    quantity INTEGER NOT NULL,
    average_buy_price REAL NOT NULL,
    current_price REAL NOT NULL,
    invested_amount REAL NOT NULL,
    current_market_value REAL NOT NULL,
    unrealised_pnl REAL NOT NULL DEFAULT 0.0,
    unrealised_pnl_pct REAL NOT NULL DEFAULT 0.0,
    realised_pnl REAL NOT NULL DEFAULT 0.0,
    last_updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(portfolio_id, asset_id, product_type)
);

-- 22. Cash Ledger Entries (Double-entry / immutable cash ledger)
-- entry_type: 'INITIAL_DEPOSIT', 'BUY_ORDER', 'SELL_ORDER', 'CHARGES', 'DIVIDEND', 'ADJUSTMENT'
CREATE TABLE IF NOT EXISTS cash_ledger_entries (
    id TEXT PRIMARY KEY,
    portfolio_id TEXT NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
    portfolio_type TEXT NOT NULL CHECK(portfolio_type IN ('REAL', 'VIRTUAL')),
    entry_type TEXT NOT NULL,
    amount REAL NOT NULL, -- positive for credits, negative for debits
    balance_after REAL NOT NULL,
    reference_id TEXT, -- execution_id, order_id, etc.
    description TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 23. Notifications
CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    portfolio_id TEXT REFERENCES portfolios(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- 'PROPOSAL', 'EXECUTION', 'RISK_ALERT', 'SYSTEM', 'REPORT'
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    action_url TEXT,
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 24. Scheduled Jobs & Background Worker Health
CREATE TABLE IF NOT EXISTS scheduled_jobs (
    id TEXT PRIMARY KEY,
    job_name TEXT UNIQUE NOT NULL,
    description TEXT NOT NULL,
    schedule_cron TEXT NOT NULL,
    interval_seconds INTEGER NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    last_run_at TEXT,
    last_run_status TEXT, -- 'SUCCESS', 'FAILED'
    last_run_message TEXT,
    last_run_error_category TEXT,
    next_run_at TEXT,
    -- Cross-process job lock. See src/lib/worker/scheduler.ts acquireJobLock().
    locked_by TEXT,
    locked_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 25. Immutable Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    portfolio_id TEXT REFERENCES portfolios(id) ON DELETE SET NULL,
    action_type TEXT NOT NULL,
    actor TEXT NOT NULL, -- 'USER', 'AGENT_MARKET', 'AGENT_STRATEGIST', 'AGENT_EXECUTION', 'WORKER', 'EMERGENCY_STOP'
    details TEXT NOT NULL,
    ip_address TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indices for performance and safety
CREATE INDEX IF NOT EXISTS idx_positions_portfolio ON positions(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_orders_portfolio ON orders(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_executions_portfolio ON executions(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_cash_ledger_portfolio ON cash_ledger_entries(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_market_data_asset_time ON market_data_points(asset_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_proposals_status ON investment_proposals(status);
CREATE INDEX IF NOT EXISTS idx_decision_records_portfolio ON decision_records(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_snapshots_portfolio_time ON portfolio_snapshots(portfolio_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_orders_portfolio_time ON orders(portfolio_id, submitted_at);
CREATE INDEX IF NOT EXISTS idx_executions_portfolio_time ON executions(portfolio_id, executed_at);
-- 26. Idempotency Store for financial mutations
-- A client-supplied (or server-derived) key is scoped to the authenticated
-- user and the operation. Reusing a key with a different request body is
-- rejected; replaying an identical request returns the stored result instead
-- of executing twice. Rows expire after 24 hours (see src/lib/idempotency.ts).
CREATE TABLE IF NOT EXISTS idempotency_keys (
    id TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scope TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'IN_PROGRESS', -- 'IN_PROGRESS' | 'COMPLETED'
    response_json TEXT,
    status_code INTEGER,
    resource_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL,
    -- One key per (user, operation). Two different users may use the same
    -- string; the same key string cannot be shared across operations.
    PRIMARY KEY (user_id, scope, id)
);
CREATE INDEX IF NOT EXISTS idx_idempotency_expiry ON idempotency_keys(expires_at);

-- 27. Worker Heartbeats
-- Written by the scheduler (in-process or the `npm run worker` daemon). The API
-- process reads this table to distinguish a live worker from a stale one; it
-- never infers liveness from job history.
CREATE TABLE IF NOT EXISTS worker_heartbeats (
    worker_id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'RUNNING', -- 'RUNNING' | 'STOPPED'
    host TEXT,
    pid INTEGER,
    interval_seconds INTEGER NOT NULL,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_beat_at TEXT NOT NULL DEFAULT (datetime('now'))
);
