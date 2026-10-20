'use client';
import React, { useState, useEffect } from 'react';
import {
  Search,
  Building,
  CheckCircle,
  FileText,
  DollarSign,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  Sparkles,
  ExternalLink
} from 'lucide-react';

interface Props {
  initialSymbol?: string;
  onOpenOrderModal: (asset: any) => void;
  onOpenProposalModal: (symbol?: string) => void;
}

export default function ResearchView({
  initialSymbol = 'RELIANCE',
  onOpenOrderModal,
  onOpenProposalModal
}: Props) {
  const [symbol, setSymbol] = useState(initialSymbol);
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchAssetData = async (sym: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/market?symbol=${sym}`);
      const json = await res.json();
      setData(json);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssetData(symbol);
  }, [symbol]);

  const quote = data?.quote;
  const fund = data?.fundamentals;
  const news = data?.news || [];
  const candles = data?.candles || [];

  return (
    <div className="space-y-6">
      {/* Search Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-purple-500/20 text-purple-400">
            <Building className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Asset Research & Fundamentals</h1>
            <p className="text-xs text-ink-2">
              Sample fundamentals (ROCE, debt, margins) and price history, for learning only.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'TATAMOTORS', 'ITC'].map((s) => (
            <button
              key={s}
              onClick={() => setSymbol(s)}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
                symbol === s ? 'bg-purple-600 text-white shadow' : 'bg-white/[0.06] text-ink-2 hover:text-white'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center text-ink-2 text-xs">
          Loading company records…
        </div>
      ) : data ? (
        <div className="space-y-6">
          {/* Main Asset Banner */}
          <div className="card p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-bold text-white">{fund?.symbol || symbol}</h2>
                <span className="text-xs px-2.5 py-0.5 rounded font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  {fund?.sector || 'NSE Equity'}
                </span>
                <span className="text-xs text-ink-2">NSE India</span>
              </div>
              <p className="text-xs text-ink-2 mt-1">{fund?.name}</p>
            </div>

            <div className="flex items-baseline gap-4">
              <div>
                <span className="text-xs text-ink-2 block">Price now</span>
                <span className="text-2xl font-bold text-white font-mono">
                  ₹{quote?.price.toFixed(2)}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => onOpenOrderModal({ id: quote?.assetId, symbol: quote?.symbol, name: quote?.name, price: quote?.price })}
                  className="rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-2 text-xs font-semibold text-white shadow transition"
                >
                  Practise a trade
                </button>
                <button
                  onClick={() => onOpenProposalModal(symbol)}
                  className="rounded-lg bg-purple-600 hover:bg-purple-500 px-4 py-2 text-xs font-semibold text-white shadow transition"
                >
                  Ask the AI
                </button>
              </div>
            </div>
          </div>

          {/* Sample financial fundamentals */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="card p-4">
              <span className="text-xs text-ink-2 block">ROCE — profit per ₹100 of capital</span>
              <span className="text-xl font-bold text-emerald-400 mt-1 block">
                {fund?.roce}%
              </span>
              <span className="text-[10px] text-ink-3">Above 18% is strong</span>
            </div>

            <div className="card p-4">
              <span className="text-xs text-ink-2 block">Borrowings vs owner money</span>
              <span className={`text-xl font-bold mt-1 block ${fund?.debtToEquity < 0.5 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {fund?.debtToEquity}
              </span>
              <span className="text-[10px] text-ink-3">Below 0.5 is comfortable</span>
            </div>

            <div className="card p-4">
              <span className="text-xs text-ink-2 block">P/E — price per ₹1 of profit</span>
              <span className="text-xl font-bold text-white mt-1 block">
                {fund?.peRatio}x
              </span>
              <span className="text-[10px] text-ink-3">Based on last 12 months</span>
            </div>

            <div className="card p-4">
              <span className="text-xs text-ink-2 block">Operating margin</span>
              <span className="text-xl font-bold text-blue-400 mt-1 block">
                {fund?.operatingMargin}%
              </span>
              <span className="text-[10px] text-ink-3">Net margin: {fund?.netProfitMargin}%</span>
            </div>

            <div className="card p-4">
              <span className="text-xs text-ink-2 block">Company size (market value)</span>
              <span className="text-lg font-bold text-ink mt-1 block">
                ₹{fund?.marketCapCr?.toLocaleString('en-IN')} Cr
              </span>
              <span className="text-[10px] text-ink-3">Total value of all shares</span>
            </div>

            <div className="card p-4">
              <span className="text-xs text-ink-2 block">Dividend yield</span>
              <span className="text-lg font-bold text-ink mt-1 block">
                {fund?.dividendYield}%
              </span>
              <span className="text-[10px] text-ink-3">Cash paid to shareholders</span>
            </div>

            <div className="card p-4">
              <span className="text-xs text-ink-2 block">Profit growth (year on year)</span>
              <span className="text-lg font-bold text-emerald-400 mt-1 block">
                +{fund?.profitGrowthYoy}%
              </span>
              <span className="text-[10px] text-ink-3">Revenue growth: +{fund?.revenueGrowthYoy}%</span>
            </div>

            <div className="card p-4">
              <span className="text-xs text-ink-2 block">Free cash flow</span>
              <span className="text-lg font-bold text-ink mt-1 block">
                ₹{fund?.freeCashFlowCr?.toLocaleString('en-IN')} Cr
              </span>
              <span className="text-[10px] text-ink-3">Demo figure</span>
            </div>
          </div>

          {/* Historical Price Action Candles */}
          <div className="card p-5 space-y-3">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Recent daily prices (demo fixtures)
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-white/[0.08] text-ink-2 font-sans">
                    <th className="pb-2">Date</th>
                    <th className="pb-2">Open (₹)</th>
                    <th className="pb-2">High (₹)</th>
                    <th className="pb-2">Low (₹)</th>
                    <th className="pb-2">Close (₹)</th>
                    <th className="pb-2">Volume</th>
                    <th className="pb-2">VWAP (₹)</th>
                    <th className="pb-2">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {candles.slice(0, 8).map((c: any, i: number) => (
                    <tr key={i} className="hover:bg-white/[0.03]">
                      <td className="py-2 text-ink-2 font-sans">{c.timestamp}</td>
                      <td className="py-2 text-ink-2">₹{c.open.toFixed(2)}</td>
                      <td className="py-2 text-ink-2">₹{c.high.toFixed(2)}</td>
                      <td className="py-2 text-ink-2">₹{c.low.toFixed(2)}</td>
                      <td className="py-2 font-bold text-white">₹{c.close.toFixed(2)}</td>
                      <td className="py-2 text-ink-2">{c.volume.toLocaleString('en-IN')}</td>
                      <td className="py-2 text-ink-2">₹{c.vwap ? c.vwap.toFixed(2) : '-'}</td>
                      <td className="py-2 text-[10px] text-emerald-400 font-sans">{c.provider}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Corporate News & Announcements */}
          <div className="card p-5 space-y-3">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-400" />
              Sample news items (demo fixtures)
            </h3>
            {news.length === 0 ? (
              <p className="text-xs text-ink-3 py-3">No news recorded for this symbol.</p>
            ) : (
              <div className="space-y-2">
                {news.map((n: any) => (
                  <div key={n.id} className="rounded-lg border border-white/[0.08] bg-black/30 p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-white">{n.headline}</h4>
                      <span className="text-[10px] text-ink-3">{n.published_at}</span>
                    </div>
                    <p className="text-xs text-ink-2">{n.summary}</p>
                    <div className="flex items-center justify-between text-[11px] text-ink-2 pt-1">
                      <span>Source: <strong className="text-ink-2">{n.source}</strong></span>
                      <span className="text-emerald-400 font-semibold">{n.sentiment_label}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
