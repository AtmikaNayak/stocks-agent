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
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400">
            <Briefcase className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-white">Real account (read-only)</h1>
              <span className="text-[10px] px-2 py-0.5 rounded font-mono font-semibold border bg-rose-500/20 text-rose-300 border-rose-500/30">
                REAL TRADING OFF
              </span>
            </div>
            <p className="text-xs text-ink-2">
              Read-only. No broker is connected, so the balances below are stored records rather than a broker-confirmed snapshot.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onSelectView('broker')}
            className="flex items-center gap-1.5 rounded-lg border border-white/[0.12] bg-white/[0.06] hover:bg-white/[0.10] px-3 py-2 text-xs font-semibold text-ink transition"
          >
            <Plug className="h-3.5 w-3.5" />
            <span>Broker connection</span>
          </button>

        </div>
      </div>

      <div className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-4 text-xs text-amber-100">
        <strong className="text-amber-200">Read-only records:</strong> broker login, order placement and balance reconciliation are not implemented.
        Any balances or holdings below are local database records and are not confirmed by a broker. All real-money orders are blocked.
      </div>

      {/* If Broker Disconnected: Honest Setup State */}
      {!isConnected ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-8 text-center space-y-4">
          <div className="h-14 w-14 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
            <Lock className="h-7 w-7" />
          </div>
          <div className="max-w-md mx-auto space-y-2">
            <h2 className="text-base font-bold text-white">No broker connected</h2>
            <p className="text-xs text-ink-2 leading-relaxed">
              This build has no broker login or order routing, so this screen cannot place a real order. Use the practice portfolio to try the same steps safely.
            </p>
          </div>

          <div className="pt-2 flex justify-center gap-3">
            <button
              onClick={() => onSelectView('broker')}
              className="flex items-center gap-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 px-5 py-2 text-xs font-semibold text-white shadow transition"
            >
              <span>See broker status</span> <ArrowRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => onSelectView('virtual-portfolio')}
              className="rounded-lg border border-white/[0.12] bg-white/[0.06] px-4 py-2 text-xs font-medium text-ink-2 hover:text-white"
            >
              Open practice portfolio
            </button>
          </div>
        </div>
      ) : (
        /* Stored ledger metrics and positions */
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="card p-4">
              <span className="text-xs text-ink-2 block mb-1">Stored account value</span>
              <span className="text-xl font-bold text-white font-mono">
                ₹{portfolio?.total_value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </span>
              <span className="text-[11px] text-emerald-400 block mt-1 font-semibold">
                Not broker-synced
              </span>
            </div>

            <div className="card p-4">
              <span className="text-xs text-ink-2 block mb-1">Stored cash balance</span>
              <span className="text-xl font-bold text-ink font-mono">
                ₹{portfolio?.current_cash.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </span>
              <span className="text-[11px] text-ink-3 block mt-1">
                No broker connection in this build
              </span>
            </div>

            <div className="card p-4">
              <span className="text-xs text-ink-2 block mb-1">Stored holdings value</span>
              <span className="text-xl font-bold text-ink-2 font-mono">
                ₹{portfolio?.invested_value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </span>
              <span className="text-[11px] text-ink-3 block mt-1">
                CNC Delivery Holdings
              </span>
            </div>

            <div className="card p-4">
              <span className="text-xs text-ink-2 block mb-1">Autonomous Execution</span>
              <span className="text-xs font-bold text-amber-400 block mt-2">
                SUPERVISED ONLY
              </span>
              <span className="text-[10px] text-ink-3 block">
                Orders require approval
              </span>
            </div>
          </div>

          <div className="card p-5">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4">
              Stored holdings (not broker-synced)
            </h3>
            {realPositions.length === 0 ? (
              <p className="text-xs text-ink-2 py-6 text-center">
                No holdings recorded in the stored real-account ledger.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-white/[0.08] text-ink-2">
                      <th className="pb-2">Company</th>
                      <th className="pb-2">Shares</th>
                      <th className="pb-2">Avg. price</th>
                      <th className="pb-2">Price now</th>
                      <th className="pb-2">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {realPositions.map((pos) => (
                      <tr key={pos.id} className="border-b border-white/[0.05]">
                        <td className="py-2.5 font-bold text-white">{pos.symbol}</td>
                        <td className="py-2.5 text-ink">{pos.quantity}</td>
                        <td className="py-2.5 text-ink-2">₹{pos.average_buy_price.toFixed(2)}</td>
                        <td className="py-2.5 text-white">₹{pos.current_price.toFixed(2)}</td>
                        <td className="py-2.5 text-ink">₹{pos.current_market_value.toLocaleString('en-IN')}</td>
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
