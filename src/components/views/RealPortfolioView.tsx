'use client';
import React from 'react';
import {
  Briefcase,
  AlertTriangle,
  ShieldCheck,
  Plug,
  Lock,
  ArrowRight,
  TrendingUp,
  RefreshCw
} from 'lucide-react';

interface Props {
  portfolio: any;
  positions: any[];
  onSelectView: (view: any) => void;
  onOpenOrderModal: () => void;
}

export default function RealPortfolioView({
  portfolio,
  positions,
  onSelectView,
  onOpenOrderModal
}: Props) {
  // A database flag is not proof of a verified external broker session.
  const isConnected = false;
  const realPositions = positions.filter((p) => p.portfolio_type === 'REAL');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 p-5 rounded-2xl border border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400">
            <Briefcase className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-white">Environment A: Real-Money Demat Portfolio</h1>
              <span className="text-[10px] px-2 py-0.5 rounded font-mono font-semibold border bg-rose-500/20 text-rose-300 border-rose-500/30">
                LIVE EXECUTION DISABLED
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Live broker adapter is not implemented. Displayed balances and holdings are stored records, not a broker-confirmed account snapshot.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onSelectView('broker')}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 transition"
          >
            <Plug className="h-3.5 w-3.5" />
            <span>Manage Broker API</span>
          </button>

        </div>
      </div>

      <div className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-4 text-xs text-amber-100">
        <strong className="text-amber-200">Unverified stored data:</strong> broker authentication, live order submission, and balance/fill reconciliation are disabled.
        Any balances or holdings below are local database records and are not confirmed by a broker. All real-money orders are blocked.
      </div>

      {/* If Broker Disconnected: Honest Setup State */}
      {!isConnected ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-8 text-center space-y-4">
          <div className="h-14 w-14 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
            <Lock className="h-7 w-7" />
          </div>
          <div className="max-w-md mx-auto space-y-2">
            <h2 className="text-base font-bold text-white">Live Broker API Integration Inactive</h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              In strict accordance with SEBI guidelines and regulatory risk controls, live real-money trading is disabled by default. No real funds can be moved without explicit multi-factor broker authentication.
            </p>
          </div>

          <div className="pt-2 flex justify-center gap-3">
            <button
              onClick={() => onSelectView('broker')}
              className="flex items-center gap-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 px-5 py-2 text-xs font-semibold text-white shadow transition"
            >
              <span>Connect Broker (Zerodha / Angel One)</span> <ArrowRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => onSelectView('virtual-portfolio')}
              className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-medium text-slate-300 hover:text-white"
            >
              Switch to Virtual Simulator (₹25,000)
            </button>
          </div>
        </div>
      ) : (
        /* When Connected: Show Live Demat Metrics & Positions */
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <span className="text-xs text-slate-400 block mb-1">Live Demat Portfolio Value</span>
              <span className="text-xl font-bold text-white font-mono">
                ₹{portfolio?.total_value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </span>
              <span className="text-[11px] text-emerald-400 block mt-1 font-semibold">
                Verified Broker Margin
              </span>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <span className="text-xs text-slate-400 block mb-1">Available Trading Margin</span>
              <span className="text-xl font-bold text-slate-200 font-mono">
                ₹{portfolio?.current_cash.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </span>
              <span className="text-[11px] text-slate-500 block mt-1">
                Synchronized with broker
              </span>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <span className="text-xs text-slate-400 block mb-1">Invested Demat Holdings</span>
              <span className="text-xl font-bold text-slate-300 font-mono">
                ₹{portfolio?.invested_value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </span>
              <span className="text-[11px] text-slate-500 block mt-1">
                CNC Delivery Holdings
              </span>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <span className="text-xs text-slate-400 block mb-1">Autonomous Execution</span>
              <span className="text-xs font-bold text-amber-400 block mt-2">
                SUPERVISED ONLY
              </span>
              <span className="text-[10px] text-slate-500 block">
                Orders require approval
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4">
              Verified Demat Holdings
            </h3>
            {realPositions.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">
                No active holdings reported in connected broker account.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="pb-2">Symbol</th>
                      <th className="pb-2">Qty</th>
                      <th className="pb-2">Avg Buy Price</th>
                      <th className="pb-2">Current Quote</th>
                      <th className="pb-2">Market Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {realPositions.map((pos) => (
                      <tr key={pos.id} className="border-b border-slate-800/40">
                        <td className="py-2.5 font-bold text-white">{pos.symbol}</td>
                        <td className="py-2.5 text-slate-200">{pos.quantity}</td>
                        <td className="py-2.5 text-slate-300">₹{pos.average_buy_price.toFixed(2)}</td>
                        <td className="py-2.5 text-white">₹{pos.current_price.toFixed(2)}</td>
                        <td className="py-2.5 text-slate-200">₹{pos.current_market_value.toLocaleString('en-IN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
