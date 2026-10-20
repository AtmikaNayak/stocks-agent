'use client';
import React from 'react';
import {
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  Bot,
  Layers,
  Briefcase,
  AlertCircle,
  ArrowUpRight,
  Sparkles,
  CheckCircle2
} from 'lucide-react';

interface Props {
  data: {
    portfolios: any[];
    positions: any[];
    quotes: any[];
    observations: any[];
    proposals: any[];
    settings: any;
  };
  activePortfolioType: 'REAL' | 'VIRTUAL';
  onSelectView: (view: any) => void;
  onOpenOrderModal: (asset?: any) => void;
  onOpenProposalModal: () => void;
  experienceMode: 'BEGINNER' | 'ADVANCED';
}

export default function DashboardView({
  data,
  activePortfolioType,
  onSelectView,
  onOpenOrderModal,
  onOpenProposalModal,
  experienceMode
}: Props) {
  const currentPortfolio = data.portfolios.find((p) => p.type === activePortfolioType) || data.portfolios[0] || {
    total_value: 25000,
    current_cash: 25000,
    invested_value: 0,
    realised_pnl: 0,
    unrealised_pnl: 0
  };

  const virtualPort = data.portfolios.find((p) => p.type === 'VIRTUAL');
  const realPort = data.portfolios.find((p) => p.type === 'REAL');

  const currentPositions = data.positions.filter((p) => p.portfolio_type === activePortfolioType);
  const pendingProposals = data.proposals.filter((p) => p.status === 'PENDING');

  const totalReturn = currentPortfolio.total_value - currentPortfolio.initial_capital;
  const returnPct = currentPortfolio.initial_capital > 0
    ? ((totalReturn / currentPortfolio.initial_capital) * 100).toFixed(2)
    : '0.00';

  return (
    <div className="space-y-6">
      {/* Welcome & System Summary */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-slate-900 to-slate-800/80 p-5 rounded-2xl border border-slate-800 shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-bold text-white tracking-tight">
              InvestPilot Autonomous Dashboard
            </h1>
            <span className="text-[11px] bg-blue-500/20 text-blue-400 font-semibold px-2 py-0.5 rounded border border-blue-500/30">
              {experienceMode === 'BEGINNER' ? 'Guided Beginner View' : 'Quantitative Workspace'}
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Disciplined evidence-based investing for Indian equities. Two strictly isolated portfolios, four autonomous agents.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onOpenProposalModal}
            className="flex items-center gap-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 px-3.5 py-2 text-xs font-semibold text-white shadow transition"
          >
            <Sparkles className="h-4 w-4" />
            <span>Generate AI Proposal</span>
          </button>
          <button
            onClick={() => onOpenOrderModal()}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 px-3.5 py-2 text-xs font-semibold text-white shadow transition"
          >
            <span>New Order Ticket</span>
          </button>
        </div>
      </div>

      {/* Two Environment Comparison Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Virtual Portfolio Card */}
        <div
          className={`rounded-xl border p-5 transition ${
            activePortfolioType === 'VIRTUAL'
              ? 'border-blue-500/50 bg-blue-950/20 shadow-md shadow-blue-500/5'
              : 'border-slate-800 bg-slate-900/60 opacity-80 hover:opacity-100'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-blue-500/20 text-blue-400">
                <Layers className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white">Environment B: Virtual Simulator</h3>
                <span className="text-[11px] text-blue-400 font-medium">Initial Capital: ₹25,000</span>
              </div>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30">
              Active Simulator
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 py-3 border-y border-slate-800/80 my-2">
            <div>
              <span className="text-[11px] text-slate-400 block">Total NAV</span>
              <span className="text-base font-bold text-white">
                ₹{virtualPort?.total_value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </span>
            </div>
            <div>
              <span className="text-[11px] text-slate-400 block">Available Cash</span>
              <span className="text-base font-bold text-slate-200">
                ₹{virtualPort?.current_cash.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </span>
            </div>
            <div>
              <span className="text-[11px] text-slate-400 block">Invested</span>
              <span className="text-base font-bold text-slate-300">
                ₹{virtualPort?.invested_value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1 text-xs">
            <span className="text-slate-400">Deterministic Safeguards:</span>
            <span className="text-emerald-400 font-semibold flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5" /> 15% Cap / 20% Cash Buffer
            </span>
          </div>
        </div>

        {/* Real Demat Account Card */}
        <div
          className={`rounded-xl border p-5 transition ${
            activePortfolioType === 'REAL'
              ? 'border-amber-500/50 bg-amber-950/20 shadow-md shadow-amber-500/5'
              : 'border-slate-800 bg-slate-900/60 opacity-80 hover:opacity-100'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400">
                <Briefcase className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white">Environment A: Real-Money Demat</h3>
                <span className="text-[11px] text-amber-400 font-medium">Broker Gateway (Zerodha / Angel One)</span>
              </div>
            </div>
            <span
              className={`text-xs px-2.5 py-1 rounded-full font-semibold border ${
                realPort?.broker_status === 'CONNECTED'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
              }`}
            >
              {realPort?.broker_status === 'CONNECTED' ? 'Broker Linked' : 'DISCONNECTED'}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 py-3 border-y border-slate-800/80 my-2">
            <div>
              <span className="text-[11px] text-slate-400 block">Live Demat Value</span>
              <span className="text-base font-bold text-white">
                ₹{realPort?.total_value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </span>
            </div>
            <div>
              <span className="text-[11px] text-slate-400 block">Broker Cash</span>
              <span className="text-base font-bold text-slate-200">
                ₹{realPort?.current_cash.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </span>
            </div>
            <div>
              <span className="text-[11px] text-slate-400 block">Autonomous Mode</span>
              <span className="text-xs font-semibold text-rose-400 flex items-center gap-1 mt-1">
                DISABLED SAFE
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1 text-xs">
            <span className="text-slate-400">SEBI Regulatory Mandate:</span>
            <button
              onClick={() => onSelectView('broker')}
              className="text-amber-400 hover:underline font-semibold flex items-center gap-1"
            >
              Configure Official Broker API <ArrowUpRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid: Active Positions & Market Observations */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active Positions Table (2 cols) */}
        <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                Current Holdings ({activePortfolioType === 'VIRTUAL' ? 'Virtual' : 'Real'})
              </h2>
              <span className="text-xs rounded bg-slate-800 px-2 py-0.5 text-slate-300 font-mono">
                {currentPositions.length} active
              </span>
            </div>
            <button
              onClick={() => onOpenOrderModal()}
              className="text-xs text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1"
            >
              Add Position <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {currentPositions.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-800 p-8 text-center">
              <Layers className="h-8 w-8 text-slate-600 mx-auto mb-2" />
              <p className="text-xs text-slate-400 font-medium">No open positions in this portfolio.</p>
              <p className="text-[11px] text-slate-500 mt-1">
                You can request an evidence-based recommendation from the AI Strategist or place a manual order.
              </p>
              <div className="mt-4 flex justify-center gap-3">
                <button
                  onClick={onOpenProposalModal}
                  className="rounded-lg bg-purple-600 hover:bg-purple-500 px-3 py-1.5 text-xs font-semibold text-white transition"
                >
                  Generate AI Proposal
                </button>
                <button
                  onClick={() => onOpenOrderModal()}
                  className="rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 transition"
                >
                  Manual Trade
                </button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400">
                    <th className="pb-2">Instrument</th>
                    <th className="pb-2">Quantity</th>
                    <th className="pb-2">Avg Buy Price</th>
                    <th className="pb-2">Current Quote</th>
                    <th className="pb-2">Market Value</th>
                    <th className="pb-2">Unrealised P&L</th>
                    <th className="pb-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {currentPositions.map((pos) => {
                    const isPositive = pos.unrealised_pnl >= 0;
                    return (
                      <tr key={pos.id} className="hover:bg-slate-800/30 transition">
                        <td className="py-2.5 font-sans">
                          <span className="font-bold text-white block">{pos.symbol}</span>
                          <span className="text-[10px] text-slate-400 block truncate max-w-[120px]">{pos.name}</span>
                        </td>
                        <td className="py-2.5 text-slate-200">{pos.quantity} shares</td>
                        <td className="py-2.5 text-slate-300">₹{pos.average_buy_price.toFixed(2)}</td>
                        <td className="py-2.5 text-white font-semibold">₹{pos.current_price.toFixed(2)}</td>
                        <td className="py-2.5 text-slate-200">₹{pos.current_market_value.toLocaleString('en-IN')}</td>
                        <td className="py-2.5">
                          <span className={`font-semibold flex items-center gap-0.5 ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                            ₹{pos.unrealised_pnl.toFixed(2)} ({pos.unrealised_pnl_pct.toFixed(2)}%)
                          </span>
                        </td>
                        <td className="py-2.5 text-right font-sans">
                          <button
                            onClick={() => onOpenOrderModal({ id: pos.asset_id, symbol: pos.symbol, name: pos.name, price: pos.current_price })}
                            className="text-[11px] rounded bg-slate-800 hover:bg-slate-700 px-2.5 py-1 text-slate-200 transition"
                          >
                            Trade
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* AI Market Observations (1 col) */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-blue-400" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Market Intelligence</h2>
            </div>
            <button
              onClick={() => onSelectView('agents')}
              className="text-xs text-blue-400 hover:underline"
            >
              Agent Centre
            </button>
          </div>

          <div className="space-y-3">
            {data.observations.slice(0, 4).map((obs) => (
              <div key={obs.id} className="rounded-lg border border-slate-800 bg-slate-950 p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-white">{obs.symbol}</span>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                      obs.priority === 'HIGH'
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    }`}
                  >
                    {obs.observation_type}
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 leading-snug">{obs.facts}</p>
                <p className="text-[10px] text-slate-500 italic">Interp: {obs.interpretation}</p>
              </div>
            ))}
          </div>

          {/* Pending Proposals Card if any */}
          {pendingProposals.length > 0 && (
            <div className="rounded-lg border border-purple-500/30 bg-purple-950/20 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-purple-300">
                  {pendingProposals.length} Actionable Proposal Ready
                </span>
                <button
                  onClick={() => onSelectView('decisions')}
                  className="text-[11px] text-purple-400 hover:underline"
                >
                  Review
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
