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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 p-5 rounded-2xl border border-slate-800">
        <div>
          <h1 className="text-lg font-bold text-white flex items-center gap-2">
            <LineChart className="h-5 w-5 text-blue-400" />
            Market Data & Research
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Demo workspace only: no verified live market-data provider is connected. Seed prices are synthetic and must not be used for real trading.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs border border-slate-800 rounded-xl px-3 py-2 bg-slate-950">
          <Clock className="h-4 w-4 text-slate-400" />
          <span className="font-mono text-slate-300">{session?.currentTimeIST}</span>
          <span className="text-slate-500">|</span>
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
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">
            Seeded Equity Universe (Demo Fixtures)
          </h2>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search ticker or name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-800 bg-slate-950 pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400 font-sans">
                <th className="pb-2">Symbol</th>
                <th className="pb-2">Company</th>
                <th className="pb-2">Price (₹)</th>
                <th className="pb-2">Day Change</th>
                <th className="pb-2">High / Low</th>
                <th className="pb-2">Volume</th>
                <th className="pb-2">Data Quality</th>
                <th className="pb-2 text-right font-sans">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredQuotes.map((q) => {
                const isPos = q.change >= 0;
                return (
                  <tr key={q.assetId} className="hover:bg-slate-800/30 transition">
                    <td className="py-2.5 font-bold text-white font-sans">
                      <button
                        onClick={() => onSelectAsset(q.symbol)}
                        className="text-blue-400 hover:underline"
                      >
                        {q.symbol}
                      </button>
                    </td>
                    <td className="py-2.5 text-slate-300 font-sans max-w-[160px] truncate">{q.name}</td>
                    <td className="py-2.5 text-white font-bold text-sm">₹{q.price.toFixed(2)}</td>
                    <td className="py-2.5">
                      <span className={`font-semibold flex items-center gap-0.5 ${isPos ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isPos ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {isPos ? '+' : ''}₹{q.change.toFixed(2)} ({isPos ? '+' : ''}{q.changePct.toFixed(2)}%)
                      </span>
                    </td>
                    <td className="py-2.5 text-slate-400">
                      ₹{q.high.toFixed(1)} / ₹{q.low.toFixed(1)}
                    </td>
                    <td className="py-2.5 text-slate-300">{q.volume.toLocaleString('en-IN')}</td>
                    <td className="py-2.5 font-sans">
                      <span
                        className={`text-[10px] rounded px-2 py-0.5 font-semibold ${
                          q.freshness === 'LIVE' || q.freshness === 'DELAYED_15M' || q.freshness === 'EOD'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : q.freshness === 'SYNTHETIC'
                            ? 'bg-amber-500/20 text-amber-300'
                            : 'bg-rose-500/20 text-rose-300'
                        }`}
                        title={q.provider || 'Unknown provider'}
                      >
                        {q.freshness}{q.provider ? ` · ${q.provider}` : ''}
                      </span>
                    </td>
                    <td className="py-2.5 text-right font-sans space-x-2">
                      <button
                        onClick={() => onSelectAsset(q.symbol)}
                        className="text-[11px] rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 px-2.5 py-1 text-slate-300 transition"
                      >
                        Research
                      </button>
                      <button
                        onClick={() => onOpenOrderModal({ id: q.assetId, symbol: q.symbol, name: q.name, price: q.price })}
                        className="text-[11px] rounded bg-blue-600 hover:bg-blue-500 px-2.5 py-1 text-white transition font-medium"
                      >
                        Order
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
