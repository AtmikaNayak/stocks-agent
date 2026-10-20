'use client';
import React, { useState } from 'react';
import {
  Compass,
  GitBranch,
  CheckCircle,
  Clock,
  Shield,
  Layers,
  RotateCcw,
  Sliders
} from 'lucide-react';

interface Props {
  onSelectView: (view: any) => void;
}

export default function StrategyView({ onSelectView }: Props) {
  const [strategies] = useState([
    {
      id: 'strat_value_quality',
      name: 'Indian Bluechip Quality & Cashflow Compounder',
      category: 'VALUE_QUALITY',
      horizon: 'LONG_TERM',
      activeVersion: 'v1.2-conservative',
      status: 'APPROVED_LIVE',
      description: 'Focuses on low leverage (D/E < 0.5), high return on capital (ROCE > 18%), and stable pricing power with attractive valuation multiples.',
      parameters: {
        min_roce: '18.0%',
        max_debt_to_equity: '0.50',
        min_operating_margin: '15.0%',
        max_single_stock_allocation: '15.0%',
        target_holding_period: '365 days'
      },
      auditEvidence: 'Passed 5-year out-of-sample backtest with Sharpe 1.84 and CAGR 17%.'
    },
    {
      id: 'strat_momentum_trend',
      name: 'NSE Momentum & Volatility Breakout',
      category: 'MOMENTUM_TREND',
      horizon: 'SHORT_TERM',
      activeVersion: 'v2.0-momentum',
      status: 'PAPER_TESTING',
      description: 'Trades systematic breakouts above 20-day VWAP with volume confirmation (>1.25x 10-day average) and strict trailing stop-losses.',
      parameters: {
        trend_filter: 'Price > VWAP',
        volume_threshold: '1.25x 10-Day Avg',
        stop_loss_pct: '2.5%',
        profit_target_pct: '6.0%',
        max_holding_period: '14 days'
      },
      auditEvidence: 'Under active virtual paper evaluation. Live order routing blocked.'
    },
    {
      id: 'strat_defensive_dividend',
      name: 'Defensive High-Yield Compounder',
      category: 'DEFENSIVE',
      horizon: 'LONG_TERM',
      activeVersion: 'v1.0-dividend',
      status: 'BACKTESTED',
      description: 'Allocates to utility, FMCG, and public lenders with dividend yield > 2.5% and low beta (< 0.75).',
      parameters: {
        min_dividend_yield: '2.5%',
        max_beta: '0.75',
        payout_ratio_health: 'Healthy (< 70%)',
        max_allocation: '10.0%'
      },
      auditEvidence: 'Backtested successfully. Pending shadow mode simulation.'
    }
  ]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 p-5 rounded-2xl border border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400">
            <Compass className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Strategy Builder & Versioned Lifecycle</h1>
            <p className="text-xs text-slate-400">
              Rigorous strategy lifecycle: Backtest &rarr; Out-of-Sample &rarr; Shadow &rarr; Paper &rarr; Approval &rarr; Live.
            </p>
          </div>
        </div>

        <button
          onClick={() => onSelectView('backtesting')}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-xs font-semibold text-white shadow transition"
        >
          <span>Run Backtest Benchmark</span>
        </button>
      </div>

      {/* Strategy Cards */}
      <div className="space-y-4">
        {strategies.map((strat) => (
          <div key={strat.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-base text-white">{strat.name}</h3>
                  <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono">
                    {strat.horizon}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">{strat.description}</p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Active Version: <strong className="text-white font-mono">{strat.activeVersion}</strong></span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                    strat.status === 'APPROVED_LIVE'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                  }`}
                >
                  {strat.status}
                </span>
              </div>
            </div>

            {/* Parameters Matrix */}
            <div>
              <span className="text-xs font-semibold text-slate-400 block mb-2">Mathematical Strategy Parameters:</span>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs font-mono">
                {Object.entries(strat.parameters).map(([key, val]) => (
                  <div key={key} className="rounded-lg border border-slate-800 bg-slate-950 p-2.5">
                    <span className="text-[10px] text-slate-500 block truncate font-sans">{key.replace(/_/g, ' ')}</span>
                    <span className="font-bold text-slate-200 mt-0.5 block">{val}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between pt-1 text-xs text-slate-400">
              <div>
                Evidence: <span className="text-slate-300 italic">{strat.auditEvidence}</span>
              </div>
              <button
                onClick={() => onSelectView('backtesting')}
                className="text-indigo-400 hover:underline font-semibold"
              >
                Backtest Parameters
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
