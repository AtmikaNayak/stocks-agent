'use client';
import React, { useState } from 'react';
import {
  Layers,
  TrendingUp,
  TrendingDown,
  PlusCircle,
  Sparkles,
  ArrowUpRight,
  ShieldAlert,
  RotateCcw,
  Receipt
} from 'lucide-react';

interface Props {
  portfolio: any;
  positions: any[];
  ledger: any[];
  onOpenOrderModal: (asset?: any) => void;
  onOpenProposalModal: () => void;
  onRefresh: () => void;
}

export default function VirtualPortfolioView({
  portfolio,
  positions,
  ledger,
  onOpenOrderModal,
  onOpenProposalModal,
  onRefresh
}: Props) {
  const [tab, setTab] = useState<'holdings' | 'ledger'>('holdings');

  const virtualPositions = positions.filter((p) => p.portfolio_type === 'VIRTUAL');
  const virtualLedger = ledger.filter((l) => l.portfolio_type === 'VIRTUAL');

  const totalValue = portfolio?.total_value || 25000;
  const initialCap = portfolio?.initial_capital || 25000;
  const currentCash = portfolio?.current_cash || 25000;
  const investedVal = portfolio?.invested_value || 0;
  const totalReturn = totalValue - initialCap;
  const returnPct = initialCap > 0 ? ((totalReturn / initialCap) * 100).toFixed(2) : '0.00';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 p-5 rounded-2xl border border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-500/20 text-blue-400">
            <Layers className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-white">Environment B: Virtual Money Portfolio</h1>
              <span className="text-[10px] px-2 py-0.5 rounded font-mono font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                Persistent Simulator
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Verified NSE market quotes with simulated Indian transaction charges (STT, GST, Exchange charges, Stamp Duty).
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onOpenProposalModal}
            className="flex items-center gap-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 px-3 py-2 text-xs font-semibold text-white shadow transition"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>AI Proposal</span>
          </button>
          <button
            onClick={() => onOpenOrderModal()}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 px-3.5 py-2 text-xs font-semibold text-white shadow transition"
          >
            <PlusCircle className="h-3.5 w-3.5" />
            <span>Simulate Order</span>
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <span className="text-xs text-slate-400 block mb-1">Total Virtual NAV</span>
          <span className="text-xl font-bold text-white">
            ₹{totalValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
          </span>
          <div className="mt-1 flex items-center gap-1 text-[11px] font-semibold">
            {totalReturn >= 0 ? (
              <span className="text-emerald-400 flex items-center">
                <TrendingUp className="h-3 w-3 mr-0.5" /> +₹{totalReturn.toFixed(2)} (+{returnPct}%)
              </span>
            ) : (
              <span className="text-rose-400 flex items-center">
                <TrendingDown className="h-3 w-3 mr-0.5" /> ₹{totalReturn.toFixed(2)} ({returnPct}%)
              </span>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <span className="text-xs text-slate-400 block mb-1">Available Liquid Cash</span>
          <span className="text-xl font-bold text-slate-200">
            ₹{currentCash.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
          </span>
          <span className="text-[11px] text-slate-500 block mt-1">
            Cash buffer: {((currentCash / totalValue) * 100).toFixed(1)}% (Min 20%)
          </span>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <span className="text-xs text-slate-400 block mb-1">Invested Value</span>
          <span className="text-xl font-bold text-slate-300">
            ₹{investedVal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
          </span>
          <span className="text-[11px] text-slate-500 block mt-1">
            Exposure: {((investedVal / totalValue) * 100).toFixed(1)}% (Max 80%)
          </span>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <span className="text-xs text-slate-400 block mb-1">Realised P&L</span>
          <span className={`text-xl font-bold ${portfolio?.realised_pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            ₹{(portfolio?.realised_pnl || 0).toFixed(2)}
          </span>
          <span className="text-[11px] text-slate-500 block mt-1">
            Unrealised: ₹{(portfolio?.unrealised_pnl || 0).toFixed(2)}
          </span>
        </div>
      </div>

      {/* Tabs: Holdings vs Cash Ledger */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex gap-2 text-xs font-semibold">
            <button
              onClick={() => setTab('holdings')}
              className={`px-3 py-1.5 rounded-lg transition ${
                tab === 'holdings' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Active Holdings ({virtualPositions.length})
            </button>
            <button
              onClick={() => setTab('ledger')}
              className={`px-3 py-1.5 rounded-lg transition ${
                tab === 'ledger' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Double-Entry Cash Ledger ({virtualLedger.length})
            </button>
          </div>
        </div>

        {tab === 'holdings' && (
          virtualPositions.length === 0 ? (
            <div className="py-12 text-center">
              <Layers className="h-8 w-8 text-slate-600 mx-auto mb-2" />
              <p className="text-xs text-slate-400">No active positions in the virtual portfolio.</p>
              <button
                onClick={() => onOpenOrderModal()}
                className="mt-3 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500"
              >
                Place First Simulated Order
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400 font-sans">
                    <th className="pb-2">Symbol</th>
                    <th className="pb-2">Quantity</th>
                    <th className="pb-2">Avg Buy (₹)</th>
                    <th className="pb-2">Current (₹)</th>
                    <th className="pb-2">Total Value (₹)</th>
                    <th className="pb-2">Unrealised P&L</th>
                    <th className="pb-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {virtualPositions.map((pos) => {
                    const isPos = pos.unrealised_pnl >= 0;
                    return (
                      <tr key={pos.id} className="hover:bg-slate-800/30">
                        <td className="py-2.5 font-sans font-bold text-white">{pos.symbol}</td>
                        <td className="py-2.5 text-slate-300">{pos.quantity}</td>
                        <td className="py-2.5 text-slate-300">{pos.average_buy_price.toFixed(2)}</td>
                        <td className="py-2.5 text-white font-semibold">{pos.current_price.toFixed(2)}</td>
                        <td className="py-2.5 text-slate-200">{pos.current_market_value.toLocaleString('en-IN')}</td>
                        <td className="py-2.5">
                          <span className={`font-semibold ${isPos ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isPos ? '+' : ''}₹{pos.unrealised_pnl.toFixed(2)} ({pos.unrealised_pnl_pct.toFixed(2)}%)
                          </span>
                        </td>
                        <td className="py-2.5 text-right font-sans">
                          <button
                            onClick={() => onOpenOrderModal({ id: pos.asset_id, symbol: pos.symbol, price: pos.current_price })}
                            className="text-[11px] rounded bg-slate-800 hover:bg-slate-700 px-2 py-1 text-slate-200"
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
          )
        )}

        {tab === 'ledger' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400 font-sans">
                  <th className="pb-2">Timestamp</th>
                  <th className="pb-2">Type</th>
                  <th className="pb-2">Description</th>
                  <th className="pb-2">Amount (₹)</th>
                  <th className="pb-2">Balance After (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {virtualLedger.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-800/30">
                    <td className="py-2 text-slate-500 text-[11px]">{entry.created_at}</td>
                    <td className="py-2">
                      <span className="font-semibold text-slate-300 font-sans">{entry.entry_type}</span>
                    </td>
                    <td className="py-2 text-slate-400 text-xs font-sans max-w-xs truncate">{entry.description}</td>
                    <td className="py-2 font-bold">
                      <span className={entry.amount >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        {entry.amount >= 0 ? '+' : ''}₹{entry.amount.toFixed(2)}
                      </span>
                    </td>
                    <td className="py-2 text-slate-200">₹{entry.balance_after.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
