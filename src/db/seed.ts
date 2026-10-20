import { db } from './index';

export function runSeed() {
  console.log('🌱 Seeding demo fixtures. Market, news, fundamentals and backtest fixtures are NOT verified live data.');

  // 1. Default User
  const userId = 'usr_pilot_01';
  db.execute(`
    INSERT OR IGNORE INTO users (id, email, name, created_at, updated_at)
    VALUES (?, ?, ?, datetime('now'), datetime('now'))
  `, [userId, 'investor@investpilot.ai', 'Rajesh K. Verma']);

  // 2. User Settings
  db.execute(`
    INSERT OR IGNORE INTO user_settings (
      id, user_id, experience_mode, control_mode, emergency_stop_enabled,
      notifications_email_enabled, notifications_in_app_enabled, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 0, 1, 1, datetime('now'), datetime('now'))
  `, ['set_pilot_01', userId, 'BEGINNER', 'COPILOT']);

  // 3. Broker Connections (Real environment starts DISCONNECTED)
  const brokerId = 'brk_zerodha_01';
  db.execute(`
    INSERT OR IGNORE INTO broker_connections (
      id, user_id, broker_name, client_id, api_key_masked,
      status, status_message, compliance_acknowledged, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'))
  `, [
    brokerId,
    userId,
    'ZERODHA',
    'ZL7892',
    'kite_live_****3891',
    'DISCONNECTED',
    'API connection required. SEBI multi-factor authentication and TOTP verification pending.'
  ]);

  // 4. Portfolios
  // Real Portfolio (Environment A: strictly disconnected and 0 until authorized)
  const realPortId = 'port_real_01';
  db.execute(`
    INSERT OR IGNORE INTO portfolios (
      id, user_id, type, name, currency, initial_capital,
      current_cash, invested_value, total_value, realised_pnl, unrealised_pnl,
      is_active, broker_connection_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, datetime('now'), datetime('now'))
  `, [realPortId, userId, 'REAL', 'Live Demat Portfolio', 'INR', 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, brokerId]);

  // Virtual Portfolio (Environment B: ₹25,000 initial capital simulator)
  const virtPortId = 'port_virt_01';
  db.execute(`
    INSERT OR IGNORE INTO portfolios (
      id, user_id, type, name, currency, initial_capital,
      current_cash, invested_value, total_value, realised_pnl, unrealised_pnl,
      is_active, broker_connection_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, datetime('now'), datetime('now'))
  `, [virtPortId, userId, 'VIRTUAL', 'Virtual Wealth Builder', 'INR', 25000.0, 25000.0, 0.0, 25000.0, 0.0, 0.0]);

  // Initial cash ledger entry for virtual portfolio
  db.execute(`
    INSERT OR IGNORE INTO cash_ledger_entries (
      id, portfolio_id, portfolio_type, entry_type, amount, balance_after,
      reference_id, description, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `, ['csh_virt_init', virtPortId, 'VIRTUAL', 'INITIAL_DEPOSIT', 25000.0, 25000.0, 'INIT_ALLOCATION', 'Initial virtual simulator capital allocation']);

  // Initial cash ledger entry for real portfolio (zero)
  db.execute(`
    INSERT OR IGNORE INTO cash_ledger_entries (
      id, portfolio_id, portfolio_type, entry_type, amount, balance_after,
      reference_id, description, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `, ['csh_real_init', realPortId, 'REAL', 'INITIAL_DEPOSIT', 0.0, 0.0, 'INIT_LIVE', 'Real broker account unlinked balance']);

  // 5. Portfolio Permissions & Risk Limits
  // Real: strict zero live trading until broker connected & authorized
  db.execute(`
    INSERT OR IGNORE INTO portfolio_permissions (
      id, portfolio_id, allow_autonomous_trading, max_position_pct, max_portfolio_exposure_pct,
      min_cash_reserve_pct, max_risk_per_trade_pct, max_daily_loss_limit, max_drawdown_limit_pct,
      max_order_value, max_orders_per_day, allow_intraday, allow_delivery, trading_schedule_enabled
    ) VALUES (?, ?, 0, 10.0, 70.0, 30.0, 1.5, 2000.0, 8.0, 25000.0, 5, 0, 1, 1)
  `, ['perm_real_01', realPortId]);

  // Virtual: default conservative limits with autonomous simulation allowed
  db.execute(`
    INSERT OR IGNORE INTO portfolio_permissions (
      id, portfolio_id, allow_autonomous_trading, max_position_pct, max_portfolio_exposure_pct,
      min_cash_reserve_pct, max_risk_per_trade_pct, max_daily_loss_limit, max_drawdown_limit_pct,
      max_order_value, max_orders_per_day, allow_intraday, allow_delivery, trading_schedule_enabled
    ) VALUES (?, ?, 1, 15.0, 80.0, 20.0, 2.0, 1500.0, 10.0, 5000.0, 10, 0, 1, 1)
  `, ['perm_virt_01', virtPortId]);

  // 6. Assets (Verified NSE Instruments)
  const assets = [
    {
      id: 'ast_reliance',
      symbol: 'RELIANCE',
      name: 'Reliance Industries Limited',
      exchange: 'NSE',
      sector: 'Energy & Petrochemicals',
      industry: 'Oil, Gas & Consumable Fuels',
      isin: 'INE002A01018',
      description: 'Conglomerate spanning energy, retail (Reliance Retail), and digital telecom (Jio Platforms).'
    },
    {
      id: 'ast_tcs',
      symbol: 'TCS',
      name: 'Tata Consultancy Services Limited',
      exchange: 'NSE',
      sector: 'Information Technology',
      industry: 'IT Services & Consulting',
      isin: 'INE467B01029',
      description: 'Premier global IT services and digital transformation enterprise with high cash-flow generation.'
    },
    {
      id: 'ast_infy',
      symbol: 'INFY',
      name: 'Infosys Limited',
      exchange: 'NSE',
      sector: 'Information Technology',
      industry: 'IT Services & Consulting',
      isin: 'INE009A01021',
      description: 'Leading global next-generation digital services and enterprise consulting company.'
    },
    {
      id: 'ast_hdfcbank',
      symbol: 'HDFCBANK',
      name: 'HDFC Bank Limited',
      exchange: 'NSE',
      sector: 'Financial Services',
      industry: 'Private Commercial Banks',
      isin: 'INE040A01034',
      description: "India's largest private sector bank following historic merger with parent HDFC Limited."
    },
    {
      id: 'ast_icicibank',
      symbol: 'ICICIBANK',
      name: 'ICICI Bank Limited',
      exchange: 'NSE',
      sector: 'Financial Services',
      industry: 'Private Commercial Banks',
      isin: 'INE090A01021',
      description: 'Major private banking entity with industry-leading ROA and digital underwriting capabilities.'
    },
    {
      id: 'ast_tatamotors',
      symbol: 'TATAMOTORS',
      name: 'Tata Motors Limited',
      exchange: 'NSE',
      sector: 'Automobile',
      industry: 'Commercial & Passenger Vehicles',
      isin: 'INE155A01022',
      description: 'Automotive manufacturing leader comprising JLR luxury marques and Indian EV leadership.'
    },
    {
      id: 'ast_itc',
      symbol: 'ITC',
      name: 'ITC Limited',
      exchange: 'NSE',
      sector: 'Fast Moving Consumer Goods',
      industry: 'FMCG & Agri Business',
      isin: 'INE154A01025',
      description: 'Diversified conglomerate spanning FMCG, Hotels, Agri Business and Paperboards with high dividend payouts.'
    },
    {
      id: 'ast_sbin',
      symbol: 'SBIN',
      name: 'State Bank of India',
      exchange: 'NSE',
      sector: 'Financial Services',
      industry: 'Public Sector Banks',
      isin: 'INE062A01020',
      description: "India's premier public sector bank and largest lender with systemic importance."
    },
    {
      id: 'ast_lt',
      symbol: 'LT',
      name: 'Larsen & Toubro Limited',
      exchange: 'NSE',
      sector: 'Capital Goods & Infrastructure',
      industry: 'Heavy Engineering & Construction',
      isin: 'INE018A01030',
      description: "India's flagship engineering, procurement, manufacturing and infrastructure powerhouse."
    },
    {
      id: 'ast_bhartiartl',
      symbol: 'BHARTIARTL',
      name: 'Bharti Airtel Limited',
      exchange: 'NSE',
      sector: 'Telecommunications',
      industry: 'Telecom Services',
      isin: 'INE397D01024',
      description: 'Leading telecom provider across India and Africa with strong ARPU growth and 5G deployment.'
    }
  ];

  for (const asset of assets) {
    db.execute(`
      INSERT OR IGNORE INTO assets (
        id, symbol, exchange, name, sector, industry, asset_type,
        lot_size, tick_size, is_tradable, isin, description, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'EQUITY', 1, 0.05, 1, ?, ?, datetime('now'))
    `, [asset.id, asset.symbol, asset.exchange, asset.name, asset.sector, asset.industry, asset.isin, asset.description]);
  }

  // 7. Illustrative fundamentals (demo-only values; not audited or verified)
  const fundamentals = [
    {
      assetId: 'ast_reliance',
      marketCap: 1985400.0, // in Cr INR
      peRatio: 27.8,
      pbRatio: 2.3,
      dividendYield: 0.36,
      roe: 9.4,
      roce: 10.1,
      debtToEquity: 0.39,
      epsTtm: 102.5,
      operatingMargin: 17.2,
      netProfitMargin: 7.8,
      revenueGrowthYoy: 10.4,
      profitGrowthYoy: 7.3,
      freeCashFlow: 32000.0,
      fy: 'FY24-25',
      source: 'SYNTHETIC_SEED — illustrative metrics; not verified'
    },
    {
      assetId: 'ast_tcs',
      marketCap: 1475000.0,
      peRatio: 31.2,
      pbRatio: 14.8,
      dividendYield: 1.45,
      roe: 48.5,
      roce: 61.2,
      debtToEquity: 0.0,
      epsTtm: 132.8,
      operatingMargin: 25.8,
      netProfitMargin: 19.3,
      revenueGrowthYoy: 6.8,
      profitGrowthYoy: 8.5,
      freeCashFlow: 41200.0,
      fy: 'FY24-25',
      source: 'SYNTHETIC_SEED — illustrative metrics; not verified'
    },
    {
      assetId: 'ast_infy',
      marketCap: 785000.0,
      peRatio: 29.4,
      pbRatio: 8.6,
      dividendYield: 2.1,
      roe: 31.8,
      roce: 40.5,
      debtToEquity: 0.05,
      epsTtm: 64.2,
      operatingMargin: 21.2,
      netProfitMargin: 16.9,
      revenueGrowthYoy: 5.2,
      profitGrowthYoy: 6.1,
      freeCashFlow: 21500.0,
      fy: 'FY24-25',
      source: 'SYNTHETIC_SEED — illustrative metrics; not verified'
    },
    {
      assetId: 'ast_hdfcbank',
      marketCap: 1280000.0,
      peRatio: 18.5,
      pbRatio: 2.8,
      dividendYield: 1.15,
      roe: 16.2,
      roce: 14.8,
      debtToEquity: 6.8, // banking leverage
      epsTtm: 91.0,
      operatingMargin: 36.5,
      netProfitMargin: 24.1,
      revenueGrowthYoy: 15.6,
      profitGrowthYoy: 12.8,
      freeCashFlow: 0.0,
      fy: 'FY24-25',
      source: 'SYNTHETIC_SEED — illustrative metrics; not verified'
    },
    {
      assetId: 'ast_icicibank',
      marketCap: 890000.0,
      peRatio: 17.4,
      pbRatio: 3.1,
      dividendYield: 0.8,
      roe: 18.9,
      roce: 16.5,
      debtToEquity: 6.1,
      epsTtm: 73.5,
      operatingMargin: 38.2,
      netProfitMargin: 26.5,
      revenueGrowthYoy: 18.4,
      profitGrowthYoy: 21.0,
      freeCashFlow: 0.0,
      fy: 'FY24-25',
      source: 'SYNTHETIC_SEED — illustrative metrics; not verified'
    },
    {
      assetId: 'ast_tatamotors',
      marketCap: 345000.0,
      peRatio: 10.8,
      pbRatio: 3.8,
      dividendYield: 0.65,
      roe: 35.2,
      roce: 22.4,
      debtToEquity: 0.88,
      epsTtm: 88.0,
      operatingMargin: 14.2,
      netProfitMargin: 7.2,
      revenueGrowthYoy: 18.2,
      profitGrowthYoy: 45.0,
      freeCashFlow: 18500.0,
      fy: 'FY24-25',
      source: 'SYNTHETIC_SEED — illustrative metrics; not verified'
    },
    {
      assetId: 'ast_itc',
      marketCap: 615000.0,
      peRatio: 29.8,
      pbRatio: 8.9,
      dividendYield: 2.8,
      roe: 28.5,
      roce: 37.1,
      debtToEquity: 0.01,
      epsTtm: 16.4,
      operatingMargin: 37.4,
      netProfitMargin: 28.1,
      revenueGrowthYoy: 8.5,
      profitGrowthYoy: 7.2,
      freeCashFlow: 16800.0,
      fy: 'FY24-25',
      source: 'SYNTHETIC_SEED — illustrative metrics; not verified'
    },
    {
      assetId: 'ast_sbin',
      marketCap: 735000.0,
      peRatio: 10.4,
      pbRatio: 1.6,
      dividendYield: 1.65,
      roe: 17.5,
      roce: 13.9,
      debtToEquity: 11.2,
      epsTtm: 78.5,
      operatingMargin: 29.4,
      netProfitMargin: 19.8,
      revenueGrowthYoy: 14.2,
      profitGrowthYoy: 15.6,
      freeCashFlow: 0.0,
      fy: 'FY24-25',
      source: 'SYNTHETIC_SEED — illustrative metrics; not verified'
    },
    {
      assetId: 'ast_lt',
      marketCap: 495000.0,
      peRatio: 34.5,
      pbRatio: 5.4,
      dividendYield: 0.9,
      roe: 15.8,
      roce: 17.2,
      debtToEquity: 1.1,
      epsTtm: 105.0,
      operatingMargin: 11.8,
      netProfitMargin: 6.4,
      revenueGrowthYoy: 16.5,
      profitGrowthYoy: 14.2,
      freeCashFlow: 8900.0,
      fy: 'FY24-25',
      source: 'SYNTHETIC_SEED — illustrative metrics; not verified'
    },
    {
      assetId: 'ast_bhartiartl',
      marketCap: 945000.0,
      peRatio: 72.0,
      pbRatio: 9.8,
      dividendYield: 0.45,
      roe: 14.2,
      roce: 15.6,
      debtToEquity: 1.9,
      epsTtm: 22.8,
      operatingMargin: 51.5,
      netProfitMargin: 8.9,
      revenueGrowthYoy: 12.8,
      profitGrowthYoy: 38.5,
      freeCashFlow: 24000.0,
      fy: 'FY24-25',
      source: 'SYNTHETIC_SEED — illustrative metrics; not verified'
    }
  ];

  for (const f of fundamentals) {
    db.execute(`
      INSERT OR IGNORE INTO company_fundamentals (
        id, asset_id, market_cap, pe_ratio, pb_ratio, dividend_yield,
        roe, roce, debt_to_equity, eps_ttm, operating_margin, net_profit_margin,
        revenue_growth_yoy, profit_growth_yoy, free_cash_flow, financial_year,
        source, verified_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `, [
      `fnd_${f.assetId}`, f.assetId, f.marketCap, f.peRatio, f.pbRatio, f.dividendYield,
      f.roe, f.roce, f.debtToEquity, f.epsTtm, f.operatingMargin, f.netProfitMargin,
      f.revenueGrowthYoy, f.profitGrowthYoy, f.freeCashFlow, f.fy, f.source
    ]);
  }

  // 8. Synthetic OHLCV fixtures (generated numbers; not NSE closing prices)
  // Base current quotes for each stock
  const currentPrices: Record<string, { close: number; open: number; high: number; low: number; vol: number }> = {
    ast_reliance: { close: 2942.50, open: 2930.00, high: 2955.00, low: 2922.00, vol: 4850000 },
    ast_tcs: { close: 4125.00, open: 4105.00, high: 4140.00, low: 4090.00, vol: 1980000 },
    ast_infy: { close: 1885.75, open: 1870.00, high: 1898.00, low: 1865.00, vol: 5400000 },
    ast_hdfcbank: { close: 1682.30, open: 1675.00, high: 1690.00, low: 1670.00, vol: 11200000 },
    ast_icicibank: { close: 1264.40, open: 1255.00, high: 1272.00, low: 1251.00, vol: 9400000 },
    ast_tatamotors: { close: 924.10, open: 915.00, high: 932.00, low: 910.00, vol: 8100000 },
    ast_itc: { close: 492.65, open: 490.00, high: 495.50, low: 489.00, vol: 6200000 },
    ast_sbin: { close: 814.20, open: 808.00, high: 820.00, low: 805.00, vol: 14500000 },
    ast_lt: { close: 3620.00, open: 3590.00, high: 3640.00, low: 3585.00, vol: 1750000 },
    ast_bhartiartl: { close: 1680.50, open: 1665.00, high: 1695.00, low: 1660.00, vol: 3900000 }
  };

  // Generate 30 daily candles ending today for each asset with deterministic realistic historical walk
  const today = new Date('2026-10-20T00:00:00Z');
  for (const [assetId, base] of Object.entries(currentPrices)) {
    let price = base.close;
    for (let dayOffset = 0; dayOffset < 30; dayOffset++) {
      const d = new Date(today);
      d.setDate(d.getDate() - dayOffset);
      // Skip weekends (Saturday=6, Sunday=0)
      if (d.getDay() === 0 || d.getDay() === 6) continue;

      const dateStr = d.toISOString().split('T')[0];
      // Deterministic small drift
      const factor = 1 - (Math.sin(dayOffset * 0.7 + assetId.length) * 0.015);
      const dayClose = parseFloat((price * factor).toFixed(2));
      const dayOpen = parseFloat((dayClose * (1 + (dayOffset % 2 === 0 ? -0.004 : 0.003))).toFixed(2));
      const dayHigh = parseFloat((Math.max(dayOpen, dayClose) * 1.008).toFixed(2));
      const dayLow = parseFloat((Math.min(dayOpen, dayClose) * 0.992).toFixed(2));
      const dayVol = Math.floor(base.vol * (0.8 + 0.4 * Math.sin(dayOffset)));
      const vwap = parseFloat(((dayHigh + dayLow + dayClose) / 3).toFixed(2));

      db.execute(`
        INSERT OR IGNORE INTO market_data_points (
          id, asset_id, timestamp, timeframe, open, high, low, close,
          volume, vwap, provider, freshness_status, quality_score, retrieved_at
        ) VALUES (?, ?, ?, '1D', ?, ?, ?, ?, ?, ?, 'SYNTHETIC_SEED', ?, 0.0, datetime('now'))
      `, [
        `mdp_${assetId}_${dateStr}`,
        assetId,
        dateStr,
        dayOpen,
        dayHigh,
        dayLow,
        dayClose,
        dayVol,
        vwap,
        'SYNTHETIC'
      ]);
    }
  }

  // Correct provenance labels for demo fixtures created by older versions of this seed script.
  db.execute(`
    UPDATE market_data_points
    SET provider = 'SYNTHETIC_SEED', freshness_status = 'SYNTHETIC', quality_score = 0.0
    WHERE id GLOB 'mdp_ast_*' AND provider IN ('NSE_EOD_VERIFIED', 'NSE_EOD_SAMPLE')
  `);
  db.execute(`
    UPDATE company_fundamentals
    SET source = 'SYNTHETIC_SEED — illustrative metrics; not verified'
    WHERE id GLOB 'fnd_ast_*' AND source = 'NSE / Audited Annual Filings'
  `);

  // 9. Demo news placeholders (not real or verified corporate announcements)
  const newsItems = [
    {
      id: 'news_01',
      assetId: 'ast_reliance',
      headline: '[DEMO DATA — NOT VERIFIED] Reliance Retail Expands FMCG Footprint with Strategic Distribution Tie-ups',
      summary: 'Illustrative seed content only; this is not a verified market-news item. Reliance Retail announced key supply-chain partnerships expanding grocery delivery throughput across Tier-2 and Tier-3 Indian cities.',
      source: 'DEMO_SEED',
      sentiment: 0.45,
      label: 'POSITIVE',
      publishedAt: '2026-10-19 14:30:00'
    },
    {
      id: 'news_02',
      assetId: 'ast_tcs',
      headline: '[DEMO DATA — NOT VERIFIED] TCS Secures $450 Million Multi-Year Cloud Migration Deal with European Banking Group',
      summary: 'Illustrative seed content only; this is not a verified market-news item. TCS confirmed a long-term enterprise transformation mandate leveraging AI-assisted mainframe modernisations.',
      source: 'DEMO_SEED',
      sentiment: 0.62,
      label: 'POSITIVE',
      publishedAt: '2026-10-18 10:15:00'
    },
    {
      id: 'news_03',
      assetId: 'ast_hdfcbank',
      headline: '[DEMO DATA — NOT VERIFIED] RBI Maintains Repo Rate at 6.50%; HDFC Bank Credit Growth Remains Robust at 16%',
      summary: 'Illustrative seed content only; this is not a verified market-news item. Reserve Bank of India Monetary Policy Committee kept key lending rates unchanged, maintaining liquidity stability across scheduled commercial banks.',
      source: 'DEMO_SEED',
      sentiment: 0.35,
      label: 'POSITIVE',
      publishedAt: '2026-10-17 11:45:00'
    },
    {
      id: 'news_04',
      assetId: 'ast_tatamotors',
      headline: '[DEMO DATA — NOT VERIFIED] Tata Motors Electric Vehicle Deliveries Surge 24% YoY in September Quarter',
      summary: 'Illustrative seed content only; this is not a verified market-news item. Strong commercial demand for Punch EV and Nexon EV platforms pushed domestic passenger EV market share to 68%.',
      source: 'DEMO_SEED',
      sentiment: 0.58,
      label: 'POSITIVE',
      publishedAt: '2026-10-16 09:30:00'
    },
    {
      id: 'news_05',
      assetId: 'ast_infy',
      headline: '[DEMO DATA — NOT VERIFIED] Infosys Expands AI Enterprise Platform Topaz with Specialized Financial Services Models',
      summary: 'Illustrative seed content only; this is not a verified market-news item. New generative enterprise tools target regulatory compliance and wealth management workflows for Tier-1 lenders.',
      source: 'DEMO_SEED',
      sentiment: 0.40,
      label: 'POSITIVE',
      publishedAt: '2026-10-15 16:00:00'
    }
  ];

  for (const n of newsItems) {
    db.execute(`
      INSERT OR IGNORE INTO news_items (
        id, asset_id, headline, summary, source, sentiment_score, sentiment_label, published_at, retrieved_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `, [n.id, n.assetId, n.headline, n.summary, n.source, n.sentiment, n.label, n.publishedAt]);
  }

  // Re-label previous seeded news rows so previously-created databases cannot present fixtures as genuine news.
  const demoNews = [
    ['news_01', '[DEMO DATA] Example Reliance Industries headline'],
    ['news_02', '[DEMO DATA] Example TCS headline'],
    ['news_03', '[DEMO DATA] Example HDFC Bank / RBI headline'],
    ['news_04', '[DEMO DATA] Example Tata Motors headline'],
    ['news_05', '[DEMO DATA] Example Infosys headline']
  ];
  for (const [id, headline] of demoNews) {
    db.execute(`
      UPDATE news_items
      SET headline = ?, summary = 'Demo fixture only; this is not a real or verified market-news item.',
          source = 'DEMO_SEED', sentiment_score = 0.0, sentiment_label = 'NEUTRAL'
      WHERE id = ?
    `, [headline, id]);
  }

  // 10. Default Watchlists
  const watchlistId = 'wl_nifty50_core';
  db.execute(`
    INSERT OR IGNORE INTO watchlists (id, user_id, name, description, is_default, created_at)
    VALUES (?, ?, 'NIFTY 50 High-Conviction Core', 'Systematic watchlist tracking top weighted bluechips across banking, tech, energy and FMCG.', 1, datetime('now'))
  `, [watchlistId, userId]);

  for (const asset of assets) {
    db.execute(`
      INSERT OR IGNORE INTO watchlist_items (id, watchlist_id, asset_id, added_at)
      VALUES (?, ?, ?, datetime('now'))
    `, [`wli_${asset.id}`, watchlistId, asset.id]);
  }

  // 11. Strategy Definitions and Strategy Versions
  const strat1Id = 'strat_value_quality';
  db.execute(`
    INSERT OR IGNORE INTO strategy_definitions (
      id, name, description, horizon, category, is_active, active_version_id, created_at
    ) VALUES (?, ?, ?, 'LONG_TERM', 'VALUE_QUALITY', 1, 'ver_strat_1_v12', datetime('now'))
  `, [strat1Id, 'Indian Bluechip Quality & Cashflow Compounder', 'Focuses on low leverage (D/E < 1), high return on capital (ROCE > 18%), and stable pricing power with attractive valuation multiples.']);

  db.execute(`
    INSERT OR IGNORE INTO strategy_versions (
      id, strategy_id, version_tag, parameters_json, rationale, status, approval_notes, approved_by, approved_at, created_at
    ) VALUES (?, ?, 'v1.2-conservative', ?, ?, 'PAPER_TESTING', ?, 'DEMO_SEED', datetime('now'), datetime('now'))
  `, [
    'ver_strat_1_v12',
    strat1Id,
    JSON.stringify({
      min_roce: 18.0,
      max_debt_to_equity: 1.0,
      min_operating_margin: 15.0,
      valuation_pe_discount_to_sector: 0.1,
      max_single_stock_allocation_pct: 15.0,
      holding_period_days_target: 365
    }),
    'Version 1.2 incorporates tighter debt-to-equity filters and sector relative PE valuation criteria.',
    'Demo fixture only; no verified market dataset or independent out-of-sample backtest has been run.'
  ]);

  const strat2Id = 'strat_momentum_trend';
  db.execute(`
    INSERT OR IGNORE INTO strategy_definitions (
      id, name, description, horizon, category, is_active, active_version_id, created_at
    ) VALUES (?, ?, ?, 'SHORT_TERM', 'MOMENTUM_TREND', 1, 'ver_strat_2_v20', datetime('now'))
  `, [strat2Id, 'NSE Momentum & Volatility Breakout', 'Trades systematic breakouts above 20-day VWAP with volume confirmation (>1.5x 20-day average) and strict trailing stop-losses.']);

  db.execute(`
    INSERT OR IGNORE INTO strategy_versions (
      id, strategy_id, version_tag, parameters_json, rationale, status, approval_notes, approved_by, approved_at, created_at
    ) VALUES (?, ?, 'v2.0-momentum', ?, ?, 'PAPER_TESTING', ?, 'Lead Trader', datetime('now'), datetime('now'))
  `, [
    'ver_strat_2_v20',
    strat2Id,
    JSON.stringify({
      trend_filter: 'SMA_50 > SMA_200',
      entry_trigger: 'CLOSE > 20D_HIGH',
      volume_multiplier_threshold: 1.5,
      stop_loss_pct: 2.5,
      profit_target_pct: 6.0,
      max_holding_days: 14
    }),
    'Demo strategy configuration only; paper trading activity has not been independently verified.',
    'Demo fixture only. Do not interpret this as evidence of live or paper-trading validation.'
  ]);

  // Backtest records for Strategy 1
  db.execute(`
    INSERT OR IGNORE INTO backtest_runs (
      id, strategy_version_id, asset_universe, start_date, end_date, initial_capital,
      final_capital, total_return_pct, cagr_pct, max_drawdown_pct, sharpe_ratio,
      sortino_ratio, win_rate_pct, total_trades, turnover_ratio, slippage_assumed_pct,
      brokerage_assumed, out_of_sample_tested, results_json, created_at
    ) VALUES (?, ?, ?, ?, ?, 25000.0, 34250.0, 37.0, 17.0, 9.4, 1.84, 2.45, 68.2, 28, 0.45, 0.1, 20.0, 1, ?, datetime('now'))
  `, [
    'bt_strat_1_2024_2026',
    'ver_strat_1_v12',
    'NIFTY 50 Core Top 10 Equities',
    '2024-01-01',
    '2026-09-30',
    JSON.stringify({
      benchmark_return_pct: 24.5,
      alpha_pct: 12.5,
      beta: 0.82,
      profit_factor: 2.38,
      average_holding_period_days: 142
    })
  ]);

  // Prevent old seeded strategy records from implying verified live approval or a completed test.
  db.execute(`
    UPDATE strategy_versions
    SET status = 'PAPER_TESTING', approved_by = NULL, approved_at = NULL,
        approval_notes = 'Seed fixture only; live use is not approved. Requires real data and independent validation.'
    WHERE id IN ('ver_strat_1_v12', 'ver_strat_2_v20')
  `);
  db.execute(`
    UPDATE backtest_runs
    SET asset_universe = 'DEMO FIXTURE — NO VERIFIED BACKTEST',
        initial_capital = 25000.0, final_capital = 25000.0,
        total_return_pct = 0.0, cagr_pct = 0.0, max_drawdown_pct = 0.0,
        sharpe_ratio = 0.0, sortino_ratio = 0.0, win_rate_pct = 0.0,
        total_trades = 0, turnover_ratio = 0.0, slippage_assumed_pct = 0.0,
        brokerage_assumed = 0.0, out_of_sample_tested = 0,
        results_json = '{"demoFixture":true,"verified":false,"message":"Placeholder only; no actual backtest has been run."}'
    WHERE id = 'bt_strat_1_2024_2026'
  `);

  // 12. Scheduled Jobs
  const jobs = [
    { name: 'market_session_monitor', desc: 'Checks NSE market hours (09:15-15:30 IST) & exchange holiday calendar', cron: '*/5 9-15 * * 1-5', interval: 300 },
    { name: 'portfolio_valuation_worker', desc: 'Re-evaluates mark-to-market prices and calculates live portfolio NAV', cron: '*/1 * * * *', interval: 60 },
    { name: 'risk_safeguard_checks', desc: 'Enforces deterministic loss limits, exposure ceilings & emergency stops', cron: '*/2 * * * *', interval: 120 },
    { name: 'strategist_thesis_review', desc: 'Audits open investment theses against incoming quarterly and price data', cron: '0 16 * * 1-5', interval: 86400 },
    { name: 'order_reconciliation_engine', desc: 'Reconciles virtual and real demat fills, fees, and ledger balances', cron: '*/1 * * * *', interval: 60 }
  ];

  for (const job of jobs) {
    db.execute(`
      INSERT OR IGNORE INTO scheduled_jobs (
        id, job_name, description, schedule_cron, interval_seconds, is_active,
        last_run_at, last_run_status, last_run_message, next_run_at, created_at
      ) VALUES (?, ?, ?, ?, ?, 1, datetime('now'), 'NOT_RUN', 'Seed fixture; no worker execution has been verified.', datetime('now', '+60 seconds'), datetime('now'))
    `, [`job_${job.name}`, job.name, job.desc, job.cron, job.interval]);
  }

  // 13. Audit Log initialization
  db.execute(`
    INSERT OR IGNORE INTO audit_logs (id, user_id, portfolio_id, action_type, actor, details, created_at)
    VALUES (?, ?, ?, 'SYSTEM_INIT', 'SYSTEM', 'InvestPilot AI 2.0 demo fixtures initialized; synthetic data and live-trading safeguards remain clearly separated.', datetime('now'))
  `, ['aud_init_01', userId, virtPortId]);

  console.log('✅ Seeding completed successfully!');
}

if (require.main === module) {
  runSeed();
}
