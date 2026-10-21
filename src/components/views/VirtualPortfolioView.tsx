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
import { titleCase } from '@/lib/format';

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
  const cashPct = totalValue > 0 ? ((currentCash / totalValue) * 100).toFixed(1) : '100.0';
  const investedPct = totalValue > 0 ? ((investedVal / totalValue) * 100).toFixed(1) : '0.0';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-500/20 text-blue-400">
            <Layers className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-white">Practice portfolio</h1>
              <span className="text-[10px] px-2 py-0.5 rounded font-mono font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                Practice account
              </span>
            </div>
            <p className="text-xs text-ink-2">
              Simulated quotes from the demo dataset, with realistic Indian charges (STT, exchange fees, GST, stamp duty).
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
        <div className="card p-4">
          <span className="text-xs text-ink-2 block mb-1">Total value</span>
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

        <div className="card p-4">
          <span className="text-xs text-ink-2 block mb-1">Cash available</span>
          <span className="text-xl font-bold text-ink">
            ₹{currentCash.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
          </span>
          <span className="text-[11px] text-ink-3 block mt-1">
            Cash cushion: {cashPct}% (minimum 20%)
          </span>
        </div>

        <div className="card p-4">
          <span className="text-xs text-ink-2 block mb-1">Money in shares</span>
          <span className="text-xl font-bold text-ink-2">
            ₹{investedVal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
          </span>
          <span className="text-[11px] text-ink-3 block mt-1">
            Invested: {investedPct}% (maximum 80%)
          </span>
        </div>

        <div className="card p-4">
          <span className="text-xs text-ink-2 block mb-1">Profit booked (sold)</span>
          <span className={`text-xl font-bold ${portfolio?.realised_pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            ₹{(portfolio?.realised_pnl || 0).toFixed(2)}
          </span>
          <span className="text-[11px] text-ink-3 block mt-1">
            Still on paper: ₹{(portfolio?.unrealised_pnl || 0).toFixed(2)}
          </span>
        </div>
      </div>

      {/* Tabs: Holdings vs Cash Ledger */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
          <div className="flex gap-2 text-xs font-semibold">
            <button
              onClick={() => setTab('holdings')}
              className={`px-3 py-1.5 rounded-lg transition ${
                tab === 'holdings' ? 'bg-blue-600 text-white' : 'text-ink-2 hover:text-white'
              }`}
            >
              Shares you own ({virtualPositions.length})
            </button>
            <button
              onClick={() => setTab('ledger')}
              className={`px-3 py-1.5 rounded-lg transition ${
                tab === 'ledger' ? 'bg-blue-600 text-white' : 'text-ink-2 hover:text-white'
              }`}
            >
              Cash movements ({virtualLedger.length})
            </button>
          </div>
        </div>

        {tab === 'holdings' && (
          virtualPositions.length === 0 ? (
            <div className="py-12 text-center">
              <Layers className="h-8 w-8 text-ink-3 mx-auto mb-2" />
              <p className="text-xs text-ink-2">You don&apos;t own any shares yet. A practice trade is the easiest way to start.</p>
              <button
                onClick={() => onOpenOrderModal()}
                className="mt-3 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500"
              >
                Make your first practice trade
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-white/[0.08] text-[11px] uppercase tracking-wider text-ink-2 font-sans">
                    <th className="pb-2">Company</th>
                    <th className="pb-2">Shares</th>
                    <th className="pb-2">Avg. price</th>
                    <th className="pb-2">Price now</th>
                    <th className="pb-2">Value</th>
                    <th className="pb-2">Profit / loss</th>
                    <th className="pb-2 text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {virtualPositions.map((pos) => {
                    const isPos = pos.unrealised_pnl >= 0;
                    return (
                      <tr key={pos.id} className="hover:bg-white/[0.03]">
                        <td className="py-2.5 font-sans font-bold text-white">{pos.symbol}</td>
                        <td className="py-2.5 text-ink-2">{pos.quantity}</td>
                        <td className="py-2.5 text-ink-2">{pos.average_buy_price.toFixed(2)}</td>
                        <td className="py-2.5 text-white font-semibold">{pos.current_price.toFixed(2)}</td>
                        <td className="py-2.5 text-ink">{pos.current_market_value.toLocaleString('en-IN')}</td>
                        <td className="py-2.5">
                          <span className={`font-semibold ${isPos ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isPos ? '+' : ''}₹{pos.unrealised_pnl.toFixed(2)} ({pos.unrealised_pnl_pct.toFixed(2)}%)
                          </span>
                        </td>
                        <td className="py-2.5 text-right font-sans">
                          <button
                            onClick={() => onOpenOrderModal({ id: pos.asset_id, symbol: pos.symbol, price: pos.current_price })}
                            className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-ink transition-colors hover:bg-white/[0.09]"
                          >
                            Practise
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
                <tr className="border-b border-white/[0.08] text-[11px] uppercase tracking-wider text-ink-2 font-sans">
                  <th className="pb-2">When</th>
                  <th className="pb-2">What happened</th>
                  <th className="pb-2">Details</th>
                  <th className="pb-2">Amount</th>
                  <th className="pb-2">Balance after</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {virtualLedger.map((entry) => (
                  <tr key={entry.id} className="hover:bg-white/[0.03]">
                    <td className="py-2 text-ink-3 text-[11px]">{entry.created_at}</td>
                    <td className="py-2">
                      <span className="font-semibold text-ink-2 font-sans">{titleCase(entry.entry_type)}</span>
                    </td>
                    <td className="py-2 text-ink-2 text-xs font-sans max-w-xs truncate">{entry.description}</td>
                    <td className="py-2 font-bold">
                      <span className={entry.amount >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        {entry.amount >= 0 ? '+' : ''}₹{entry.amount.toFixed(2)}
                      </span>
                    </td>
                    <td className="py-2 text-ink">₹{entry.balance_after.toFixed(2)}</td>
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
