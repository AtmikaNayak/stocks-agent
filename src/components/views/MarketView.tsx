'use client';
import React, { useState } from 'react';
import {
  LineChart,
  TrendingUp,
  TrendingDown,
  Clock,
  ShieldCheck,
  Search,
  ArrowUpRight
} from 'lucide-react';

interface Props {
  quotes: any[];
  session: any;
  onSelectAsset: (symbol: string) => void;
  onOpenOrderModal: (asset: any) => void;
}

export default function MarketView({
  quotes,
  session,
  onSelectAsset,
  onOpenOrderModal
}: Props) {
  const [search, setSearch] = useState('');

  const filteredQuotes = quotes.filter(
    (q) =>
      q.symbol.toLowerCase().includes(search.toLowerCase()) ||
      q.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="text-lg font-bold text-white flex items-center gap-2">
            <LineChart className="h-5 w-5 text-blue-400" />
            Explore shares
          </h1>
          <p className="text-xs text-ink-2 mt-1">
            Sample prices from the demo dataset. No live market feed is connected, so use these to learn the mechanics rather than to make decisions.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs border border-white/[0.08] rounded-xl px-3 py-2 bg-black/30">
          <Clock className="h-4 w-4 text-ink-2" />
          <span className="font-mono text-ink-2">{session?.currentTimeIST}</span>
          <span className="text-ink-3">|</span>
          <span
            className={`font-semibold ${
              session?.isOpen ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {session?.session}
          </span>
        </div>
      </div>

      <div className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-4 text-sm">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          <div>
            <p className="font-semibold text-amber-200">Demo market data — not verified market prices</p>
            <p className="mt-1 text-xs leading-relaxed text-amber-100/80">
              No live NSE feed is connected in this build. Seed prices, candles, fundamentals and sample news are illustrative fixtures.
              Virtual orders use stored simulator quotes only. Do not use these fixtures to make real investment decisions.
            </p>
          </div>
        </div>
      </div>

      {/* Quotes Table with Search */}
      <div className="card p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">
            Companies in the demo dataset
          </h2>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-ink-3" />
            <input
              type="text"
              placeholder="Search ticker or name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-white/[0.08] bg-black/30 pl-9 pr-3 py-1.5 text-xs text-white placeholder-ink-3 focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-white/[0.08] text-[11px] uppercase tracking-wider text-ink-2 font-sans">
                <th className="pb-2">Company</th>
                <th className="pb-2">Full name</th>
                <th className="pb-2">Price</th>
                <th className="pb-2">Today</th>
                <th className="pb-2">Day range</th>
                <th className="pb-2">Volume</th>
                <th className="pb-2">Source</th>
                <th className="pb-2 text-right font-sans"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {filteredQuotes.map((q) => {
                const isPos = q.change >= 0;
                return (
                  <tr key={q.assetId} className="hover:bg-white/[0.03] transition">
                    <td className="py-2.5 font-bold text-white font-sans">
                      <button
                        onClick={() => onSelectAsset(q.symbol)}
                        className="text-blue-400 hover:underline"
                      >
                        {q.symbol}
                      </button>
                    </td>
                    <td className="py-2.5 text-ink-2 font-sans max-w-[160px] truncate">{q.name}</td>
                    <td className="py-2.5 text-white font-bold text-sm">₹{q.price.toFixed(2)}</td>
                    <td className="py-2.5">
                      <span className={`font-semibold flex items-center gap-0.5 ${isPos ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isPos ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {isPos ? '+' : ''}₹{q.change.toFixed(2)} ({isPos ? '+' : ''}{q.changePct.toFixed(2)}%)
                      </span>
                    </td>
                    <td className="py-2.5 text-ink-2">
                      ₹{q.high.toFixed(1)} / ₹{q.low.toFixed(1)}
                    </td>
                    <td className="py-2.5 text-ink-2">{q.volume.toLocaleString('en-IN')}</td>
                    <td className="py-2.5 font-sans">
                      <span
                        className={`text-[10px] rounded px-2 py-0.5 font-semibold ${
                          q.freshness === 'LIVE' || q.freshness === 'DELAYED_15M' || q.freshness === 'EOD'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : q.freshness === 'SYNTHETIC'
                            ? 'bg-amber-500/20 text-amber-300'
                            : 'bg-rose-500/20 text-rose-300'
                        }`}
                        title={q.provider ? `Source: ${q.provider}` : 'Source unknown'}
                      >
                        {q.freshness === 'SYNTHETIC' ? 'Demo data' : q.freshness}
                      </span>
                    </td>
                    <td className="py-2.5 text-right font-sans space-x-2">
                      <button
                        onClick={() => onSelectAsset(q.symbol)}
                        className="text-[11px] rounded border border-white/[0.12] bg-white/[0.06] hover:bg-white/[0.10] px-2.5 py-1 text-ink-2 transition"
                      >
                        Details
                      </button>
                      <button
                        onClick={() => onOpenOrderModal({ id: q.assetId, symbol: q.symbol, name: q.name, price: q.price })}
                        className="text-[11px] rounded bg-blue-600 hover:bg-blue-500 px-2.5 py-1 text-white transition font-medium"
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
      </div>
    </div>
  );
}
