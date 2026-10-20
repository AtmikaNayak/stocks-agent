'use client';
import React, { useState } from 'react';
import {
  Terminal,
  TrendingUp,
  TrendingDown,
  Layers,
  ArrowRight,
  ShieldCheck,
  Activity
} from 'lucide-react';

interface Props {
  quotes: any[];
  onOpenOrderModal: (asset: any) => void;
}

export default function AdvancedWorkspaceView({ quotes, onOpenOrderModal }: Props) {
  const [selectedSymbol, setSelectedSymbol] = useState(quotes[0]?.symbol || 'RELIANCE');
  const activeQuote = quotes.find((q) => q.symbol === selectedSymbol) || quotes[0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-white/[0.06] text-blue-400">
            <Terminal className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Advanced workspace</h1>
            <p className="text-xs text-ink-2">
              A denser trading desk for experienced users: simulated market depth and quick order tickets.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {quotes.slice(0, 5).map((q) => (
            <button
              key={q.symbol}
              onClick={() => setSelectedSymbol(q.symbol)}
              className={`px-2.5 py-1 rounded text-xs font-mono font-semibold transition ${
                selectedSymbol === q.symbol
                  ? 'bg-blue-600 text-white shadow'
                  : 'bg-white/[0.06] text-ink-2 hover:text-white'
              }`}
            >
              {q.symbol}
            </button>
          ))}
        </div>
      </div>

      {/* Workspace Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 cols: Quote Details & Depth Simulation */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-white font-mono">{activeQuote?.symbol}</h2>
                <span className="text-xs text-ink-2">{activeQuote?.name}</span>
              </div>
              <div className="text-right">
                <span className="text-2xl font-bold text-white font-mono block">
                  ₹{activeQuote?.price.toFixed(2)}
                </span>
                <span className={`text-xs font-semibold ${activeQuote?.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {activeQuote?.change >= 0 ? '+' : ''}₹{activeQuote?.change.toFixed(2)} ({activeQuote?.changePct}%)
                </span>
              </div>
            </div>

            {/* Depth simulation table (5 Best Bids / Asks) */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-ink-2 block">
                Simulated Market Depth (L2 Order Book)
              </span>
              <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                {/* Bids */}
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-950/10 p-3">
                  <div className="flex justify-between text-ink-2 font-sans pb-1 border-b border-white/[0.08]">
                    <span>Bid Qty</span>
                    <span>Bid Price (₹)</span>
                  </div>
                  <div className="space-y-1 pt-1.5 text-emerald-300">
                    <div className="flex justify-between"><span>1,450</span><span>{(activeQuote?.price - 0.05).toFixed(2)}</span></div>
                    <div className="flex justify-between"><span>2,800</span><span>{(activeQuote?.price - 0.10).toFixed(2)}</span></div>
                    <div className="flex justify-between"><span>5,120</span><span>{(activeQuote?.price - 0.20).toFixed(2)}</span></div>
                    <div className="flex justify-between"><span>8,900</span><span>{(activeQuote?.price - 0.35).toFixed(2)}</span></div>
                    <div className="flex justify-between"><span>14,200</span><span>{(activeQuote?.price - 0.50).toFixed(2)}</span></div>
                  </div>
                </div>

                {/* Asks */}
                <div className="rounded-lg border border-rose-500/20 bg-rose-950/10 p-3">
                  <div className="flex justify-between text-ink-2 font-sans pb-1 border-b border-white/[0.08]">
                    <span>Ask Price (₹)</span>
                    <span>Ask Qty</span>
                  </div>
                  <div className="space-y-1 pt-1.5 text-rose-300">
                    <div className="flex justify-between"><span>{(activeQuote?.price + 0.05).toFixed(2)}</span><span>1,200</span></div>
                    <div className="flex justify-between"><span>{(activeQuote?.price + 0.10).toFixed(2)}</span><span>3,400</span></div>
                    <div className="flex justify-between"><span>{(activeQuote?.price + 0.20).toFixed(2)}</span><span>4,900</span></div>
                    <div className="flex justify-between"><span>{(activeQuote?.price + 0.35).toFixed(2)}</span><span>7,150</span></div>
                    <div className="flex justify-between"><span>{(activeQuote?.price + 0.50).toFixed(2)}</span><span>12,800</span></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right col: Rapid Execution Ticket */}
        <div className="card p-5 space-y-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            Fast Execution Ticket
          </h3>

          <div className="rounded-lg bg-black/30 p-4 space-y-3 text-xs">
            <div className="flex justify-between">
              <span className="text-ink-2">Target Instrument:</span>
              <span className="font-bold text-white font-mono">{activeQuote?.symbol}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-2">Last Trade Price:</span>
              <span className="font-bold text-white font-mono">₹{activeQuote?.price.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-2">NSE Tick Size:</span>
              <span className="font-mono text-ink-2">₹0.05</span>
            </div>

            <div className="pt-2 flex gap-2">
              <button
                onClick={() => onOpenOrderModal({ id: activeQuote?.assetId, symbol: activeQuote?.symbol, price: activeQuote?.price })}
                className="flex-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 py-2.5 font-bold text-white text-center shadow"
              >
                BUY {activeQuote?.symbol}
              </button>
              <button
                onClick={() => onOpenOrderModal({ id: activeQuote?.assetId, symbol: activeQuote?.symbol, price: activeQuote?.price })}
                className="flex-1 rounded-lg bg-rose-600 hover:bg-rose-500 py-2.5 font-bold text-white text-center shadow"
              >
                SELL {activeQuote?.symbol}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
