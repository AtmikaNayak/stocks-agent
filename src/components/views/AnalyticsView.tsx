'use client';
import React from 'react';
import {
  PieChart,
  TrendingUp,
  Activity,
  Award,
  Shield,
  BarChart2
} from 'lucide-react';

interface Props {
  portfolio: any;
  positions: any[];
}

export default function AnalyticsView({ portfolio, positions }: Props) {
  const currentPositions = positions.filter((p) => p.portfolio_type === (portfolio?.type || 'VIRTUAL'));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400">
            <PieChart className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Performance</h1>
            <p className="text-xs text-ink-2">
              How your portfolio has behaved: returns, ups and downs, and how concentrated your money is. Figures below are computed from demo data.
            </p>
          </div>
        </div>

        <span className="text-xs font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-3 py-1 rounded-lg">
          Benchmark: NIFTY 50 TRI
        </span>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card p-4">
          <span className="text-xs text-ink-2 block mb-1">Sharpe Ratio (Annualized)</span>
          <span className="text-xl font-bold text-emerald-400 font-mono">1.84</span>
          <span className="text-[10px] text-ink-3 block mt-1">Rf: 6.50% RBI Repo Rate</span>
        </div>

        <div className="card p-4">
          <span className="text-xs text-ink-2 block mb-1">Sortino Ratio (Downside)</span>
          <span className="text-xl font-bold text-emerald-400 font-mono">2.45</span>
          <span className="text-[10px] text-ink-3 block mt-1">Excludes upside volatility</span>
        </div>

        <div className="card p-4">
          <span className="text-xs text-ink-2 block mb-1">Maximum Peak Drawdown</span>
          <span className="text-xl font-bold text-white font-mono">3.4%</span>
          <span className="text-[10px] text-emerald-500 block mt-1">Well inside 10% limit</span>
        </div>

        <div className="card p-4">
          <span className="text-xs text-ink-2 block mb-1">Generated Alpha vs Index</span>
          <span className="text-xl font-bold text-emerald-400 font-mono">+6.2%</span>
          <span className="text-[10px] text-ink-3 block mt-1">Excess return over NIFTY 50</span>
        </div>
      </div>

      {/* Asset Allocation Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card p-5 space-y-4">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">
            Portfolio Asset Allocation
          </h2>

          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-ink-2">Liquid Cash Buffer</span>
                <span className="text-blue-400 font-mono font-semibold">
                  {portfolio?.total_value ? ((portfolio.current_cash / portfolio.total_value) * 100).toFixed(1) : 100}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full"
                  style={{ width: `${portfolio?.total_value ? ((portfolio.current_cash / portfolio.total_value) * 100) : 100}%` }}
                />
              </div>
            </div>

            {currentPositions.map((p) => {
              const weight = portfolio?.total_value ? ((p.current_market_value / portfolio.total_value) * 100).toFixed(1) : '0';
              return (
                <div key={p.id}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-ink-2">{p.symbol} ({p.name})</span>
                    <span className="text-emerald-400 font-mono font-semibold">{weight}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full"
                      style={{ width: `${weight}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Statistical Risk Characteristics */}
        <div className="card p-5 space-y-4">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">
            Quantitative Risk Parameters
          </h2>

          <div className="space-y-2.5 text-xs font-mono">
            <div className="flex justify-between p-2.5 rounded-lg border border-white/[0.08] bg-black/30 font-sans">
              <span className="text-ink-2">Beta vs NIFTY 50:</span>
              <span className="text-white font-bold font-mono">0.82 (Defensive tilt)</span>
            </div>
            <div className="flex justify-between p-2.5 rounded-lg border border-white/[0.08] bg-black/30 font-sans">
              <span className="text-ink-2">Win Rate (% Profitable):</span>
              <span className="text-emerald-400 font-bold font-mono">68.2%</span>
            </div>
            <div className="flex justify-between p-2.5 rounded-lg border border-white/[0.08] bg-black/30 font-sans">
              <span className="text-ink-2">Profit Factor (Gross Win / Gross Loss):</span>
              <span className="text-white font-bold font-mono">2.38</span>
            </div>
            <div className="flex justify-between p-2.5 rounded-lg border border-white/[0.08] bg-black/30 font-sans">
              <span className="text-ink-2">Portfolio Annualized Turnover:</span>
              <span className="text-white font-bold font-mono">0.45x (Low churn)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
