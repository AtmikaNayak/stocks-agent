'use client';
import React from 'react';
import { PieChart, Shield } from 'lucide-react';

interface Props {
  portfolio: any;
  positions: any[];
}

export default function AnalyticsView({ portfolio, positions }: Props) {
  const currentPositions = positions.filter((p) => p.portfolio_type === (portfolio?.type || 'VIRTUAL'));

  const totalValue = Number(portfolio?.total_value) || 0;
  const cash = Number(portfolio?.current_cash) || 0;
  const invested = Number(portfolio?.invested_value) || 0;
  const cashPct = totalValue > 0 ? (cash / totalValue) * 100 : 100;
  const investedPct = totalValue > 0 ? (invested / totalValue) * 100 : 0;
  const largestWeightPct = currentPositions.reduce(
    (max, p) => Math.max(max, totalValue > 0 ? (Number(p.current_market_value) / totalValue) * 100 : 0),
    0
  );
  const unrealisedPnl = currentPositions.reduce((sum, p) => sum + (Number(p.unrealised_pnl) || 0), 0);
  const unrealisedPct = invested > 0 ? (unrealisedPnl / invested) * 100 : 0;
  const initialCapital = Number(portfolio?.initial_capital) || 0;
  const totalReturnPct = initialCapital > 0 ? ((totalValue - initialCapital) / initialCapital) * 100 : null;

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

        <span className="text-xs font-mono bg-white/[0.05] text-ink-2 border border-white/[0.08] px-3 py-1 rounded-lg">
          No index benchmark stored in this build
        </span>
      </div>

      {/* Metrics Grid — only figures we can actually derive are shown */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card p-4">
          <span className="text-xs text-ink-2 block mb-1">Portfolio return since start</span>
          <span className={`text-xl font-bold font-mono ${totalReturnPct === null ? 'text-ink-3' : totalReturnPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {totalReturnPct === null ? 'Not available' : `${totalReturnPct >= 0 ? '+' : ''}${totalReturnPct.toFixed(2)}%`}
          </span>
          <span className="text-[10px] text-ink-3 block mt-1">
            {totalReturnPct === null ? 'No starting capital recorded for this account' : 'Measured against recorded starting capital'}
          </span>
        </div>

        <div className="card p-4">
          <span className="text-xs text-ink-2 block mb-1">Unrealised profit / loss</span>
          <span className={`text-xl font-bold font-mono ${unrealisedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {unrealisedPnl >= 0 ? '+' : ''}₹{unrealisedPnl.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
          </span>
          <span className="text-[10px] text-ink-3 block mt-1">
            {invested > 0 ? `${unrealisedPct >= 0 ? '+' : ''}${unrealisedPct.toFixed(2)}% on money in shares` : 'No open positions'}
          </span>
        </div>

        <div className="card p-4">
          <span className="text-xs text-ink-2 block mb-1">Cash cushion</span>
          <span className="text-xl font-bold text-white font-mono">{cashPct.toFixed(1)}%</span>
          <span className={`text-[10px] block mt-1 ${cashPct >= 20 ? 'text-emerald-500' : 'text-rose-400'}`}>
            {cashPct >= 20 ? 'Above the 20% minimum' : 'Below the 20% minimum'}
          </span>
        </div>

        <div className="card p-4">
          <span className="text-xs text-ink-2 block mb-1">Largest single holding</span>
          <span className="text-xl font-bold text-white font-mono">{largestWeightPct.toFixed(1)}%</span>
          <span className={`text-[10px] block mt-1 ${largestWeightPct <= 15 ? 'text-emerald-500' : 'text-rose-400'}`}>
            {largestWeightPct <= 15 ? 'Inside the 15% cap' : 'Above the 15% cap'}
          </span>
        </div>
      </div>

      {/* Metrics we cannot compute are named rather than invented */}
      <div className="card p-4">
        <div className="flex items-start gap-3">
          <Shield className="h-4 w-4 text-ink-3 mt-0.5 shrink-0" />
          <div className="text-xs leading-relaxed text-ink-2">
            <p className="font-semibold text-ink">Sharpe ratio, Sortino ratio, beta and alpha are not shown.</p>
            <p className="mt-1 text-ink-3">
              Those figures need a stored daily return series and an index price series. This build stores neither, so
              the app will not display an invented number. They will appear once a verified market-data feed is
              connected and enough history has accumulated.
            </p>
          </div>
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

        {/* Concentration & structure — derived from stored positions */}
        <div className="card p-5 space-y-4">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">
            Concentration &amp; structure
          </h2>

          <div className="space-y-2.5 text-xs">
            <div className="flex justify-between p-2.5 rounded-lg border border-white/[0.08] bg-black/30">
              <span className="text-ink-2">Companies held</span>
              <span className="text-white font-bold font-mono">{currentPositions.length}</span>
            </div>
            <div className="flex justify-between p-2.5 rounded-lg border border-white/[0.08] bg-black/30">
              <span className="text-ink-2">Money in shares</span>
              <span className="text-white font-bold font-mono">{investedPct.toFixed(1)}%</span>
            </div>
            <div className="flex justify-between p-2.5 rounded-lg border border-white/[0.08] bg-black/30">
              <span className="text-ink-2">Largest single position</span>
              <span className="text-white font-bold font-mono">{largestWeightPct.toFixed(1)}%</span>
            </div>
            <div className="flex justify-between p-2.5 rounded-lg border border-white/[0.08] bg-black/30">
              <span className="text-ink-2">Cash available</span>
              <span className="text-white font-bold font-mono">
                ₹{cash.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          <p className="text-[11px] leading-relaxed text-ink-3">
            Beta, win rate, profit factor and turnover need a full trade history and an index series. They are
            intentionally blank until that data exists, rather than estimated from a single snapshot.
          </p>
        </div>
      </div>
    </div>
  );
}
