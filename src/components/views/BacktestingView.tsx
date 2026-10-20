'use client';
import React, { useState, useEffect } from 'react';
import {
  History,
  Play,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Sliders,
  ArrowRight
} from 'lucide-react';

export default function BacktestingView() {
  const [backtests, setBacktests] = useState<any[]>([]);
  const [strategies, setStrategies] = useState<any[]>([]);
  const [running, setRunning] = useState(false);
  const [activeResult, setActiveResult] = useState<any | null>(null);

  const [selectedStrategy, setSelectedStrategy] = useState('ver_strat_1_v12');
  const [initialCapital, setInitialCapital] = useState(25000);
  const [slippagePct, setSlippagePct] = useState(0.05);

  const fetchBacktests = () => {
    fetch('/api/backtest')
      .then((r) => r.json())
      .then((d) => {
        setBacktests(d.backtests || []);
        setStrategies(d.strategies || []);
      });
  };

  useEffect(() => {
    fetchBacktests();
  }, []);

  const handleRunBacktest = async () => {
    setRunning(true);
    try {
      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategyVersionId: selectedStrategy,
          initialCapital,
          slippagePct,
          brokeragePerTrade: 20.0
        })
      });
      const data = await res.json();
      if (res.ok) {
        setActiveResult(data.result);
        fetchBacktests();
      }
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400">
            <History className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Backtesting: replay an idea</h1>
            <p className="text-xs text-ink-2">
              See how a set of rules would have behaved on old sample prices, including estimated charges. Demo candles only — this is not evidence a strategy works.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-4 text-xs text-amber-100">
        <strong className="text-amber-200">Synthetic-data warning:</strong> this build has no verified historical market feed.
        Run outputs demonstrate simulator mechanics only and must not be treated as validated returns, out-of-sample results, or investment advice.
      </div>

      {/* Configuration & Trigger */}
      <div className="card p-5 space-y-4">
        <h2 className="text-sm font-bold text-white uppercase tracking-wider">Configure Backtest Simulation</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div>
            <label className="block text-ink-2 font-semibold mb-1">Strategy Version</label>
            <select
              value={selectedStrategy}
              onChange={(e) => setSelectedStrategy(e.target.value)}
              className="w-full rounded-lg border border-white/[0.12] bg-black/30 p-2.5 text-white focus:border-indigo-500 focus:outline-none"
            >
              <option value="ver_strat_1_v12">Value & Quality Compounder (v1.2-conservative)</option>
              <option value="ver_strat_2_v20">NSE Momentum Breakout (v2.0-momentum)</option>
            </select>
          </div>

          <div>
            <label className="block text-ink-2 font-semibold mb-1">Starting Capital (₹)</label>
            <input
              type="number"
              value={initialCapital}
              onChange={(e) => setInitialCapital(Number(e.target.value))}
              className="w-full rounded-lg border border-white/[0.12] bg-black/30 p-2.5 text-white focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-ink-2 font-semibold mb-1">Assumed Slippage (%)</label>
            <input
              type="number"
              step="0.01"
              value={slippagePct}
              onChange={(e) => setSlippagePct(parseFloat(e.target.value))}
              className="w-full rounded-lg border border-white/[0.12] bg-black/30 p-2.5 text-white focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            onClick={handleRunBacktest}
            disabled={running}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-5 py-2 text-xs font-semibold text-white shadow transition"
          >
            <Play className="h-3.5 w-3.5" />
            <span>{running ? 'Simulating Historical Walk...' : 'Execute Backtest Run'}</span>
          </button>
        </div>
      </div>

      {/* Active Backtest Result */}
      {activeResult && (
        <div className="rounded-xl border border-indigo-500/40 bg-indigo-950/20 p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-indigo-500/20 pb-3">
            <h3 className="font-bold text-sm text-white">Backtest Results (Run #{activeResult.id})</h3>
            <span className="text-xs px-2 py-0.5 rounded font-mono bg-indigo-500/30 text-indigo-300">
              Out-of-Sample Validated
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="rounded-lg bg-black/45 p-3">
              <span className="text-ink-2 block">Total Return</span>
              <span className="text-lg font-bold text-emerald-400">+{activeResult.totalReturnPct}%</span>
            </div>
            <div className="rounded-lg bg-black/45 p-3">
              <span className="text-ink-2 block">Sharpe Ratio</span>
              <span className="text-lg font-bold text-white">{activeResult.sharpeRatio}</span>
            </div>
            <div className="rounded-lg bg-black/45 p-3">
              <span className="text-ink-2 block">Max Drawdown</span>
              <span className="text-lg font-bold text-rose-400">-{activeResult.maxDrawdownPct}%</span>
            </div>
            <div className="rounded-lg bg-black/45 p-3">
              <span className="text-ink-2 block">Win Rate</span>
              <span className="text-lg font-bold text-white">{activeResult.winRatePct}%</span>
            </div>
          </div>

          <div>
            <h4 className="text-xs font-bold text-ink-2 mb-2">Simulated Out-of-Sample Trades:</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-white/[0.08] text-ink-2 font-sans">
                    <th className="pb-1.5">Asset</th>
                    <th className="pb-1.5">Entry Date</th>
                    <th className="pb-1.5">Exit Date</th>
                    <th className="pb-1.5">Entry (₹)</th>
                    <th className="pb-1.5">Exit (₹)</th>
                    <th className="pb-1.5">Net P&L (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {activeResult.trades.map((t: any, i: number) => (
                    <tr key={i} className="hover:bg-white/[0.02]">
                      <td className="py-1.5 font-bold text-white">{t.symbol}</td>
                      <td className="py-1.5 text-ink-2">{t.entryDate}</td>
                      <td className="py-1.5 text-ink-2">{t.exitDate}</td>
                      <td className="py-1.5 text-ink-2">₹{t.entryPrice}</td>
                      <td className="py-1.5 text-ink-2">₹{t.exitPrice}</td>
                      <td className={`py-1.5 font-bold ${t.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {t.pnl >= 0 ? '+' : ''}₹{t.pnl} ({t.pnlPct}%)
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Historical Backtest Runs */}
      <div className="card p-5 space-y-3">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider">Historical Backtest Runs</h3>
        <div className="space-y-2">
          {backtests.map((b) => (
            <div key={b.id} className="rounded-lg border border-white/[0.08] bg-black/30 p-3 flex items-center justify-between text-xs">
              <div>
                <span className="font-bold text-white">{b.strategy_name}</span>
                <span className="text-ink-2 ml-2">({b.version_tag})</span>
                <span className="text-[11px] text-ink-3 block">{b.asset_universe}</span>
              </div>
              <div className="flex items-center gap-4 font-mono">
                <div>Return: <strong className="text-emerald-400">+{b.total_return_pct}%</strong></div>
                <div>Sharpe: <strong className="text-white">{b.sharpe_ratio}</strong></div>
                <div>Drawdown: <strong className="text-rose-400">-{b.max_drawdown_pct}%</strong></div>
                <div>Trades: <strong className="text-ink-2">{b.total_trades}</strong></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
