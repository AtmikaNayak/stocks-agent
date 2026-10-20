'use client';
import React, { useState, useEffect } from 'react';
import {
  ListOrdered,
  Receipt,
  CheckCircle,
  Clock,
  Layers,
  ArrowRight,
  ShieldCheck
} from 'lucide-react';

interface Props {
  activePortfolioType: 'REAL' | 'VIRTUAL';
}

export default function OrdersView({ activePortfolioType }: Props) {
  const [data, setData] = useState<{ orders: any[]; executions: any[] }>({ orders: [], executions: [] });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'orders' | 'executions'>('executions');

  useEffect(() => {
    fetch('/api/orders')
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      });
  }, []);

  const filteredOrders = data.orders.filter((o) => o.portfolio_type === activePortfolioType);
  const filteredExecutions = data.executions.filter((e) => e.portfolio_type === activePortfolioType);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-500/20 text-blue-400">
            <ListOrdered className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Orders & charges</h1>
            <p className="text-xs text-ink-2">
              Every simulated order and fill, with the Indian charges (STT, exchange fees, GST, stamp duty) itemised.
            </p>
          </div>
        </div>

        <div className="flex rounded-lg border border-white/[0.12] bg-black/30 p-1 text-xs font-semibold">
          <button
            onClick={() => setTab('executions')}
            className={`px-3 py-1 rounded transition ${
              tab === 'executions' ? 'bg-blue-600 text-white' : 'text-ink-2 hover:text-white'
            }`}
          >
            Fills & Charges ({filteredExecutions.length})
          </button>
          <button
            onClick={() => setTab('orders')}
            className={`px-3 py-1 rounded transition ${
              tab === 'orders' ? 'bg-blue-600 text-white' : 'text-ink-2 hover:text-white'
            }`}
          >
            Submitted Orders ({filteredOrders.length})
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center text-xs text-ink-2">Loading order records...</div>
      ) : tab === 'executions' ? (
        /* Executions Table with Charges Breakdown */
        <div className="card p-5">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-4">
            Simulated fills with a full charge breakdown
          </h2>

          {filteredExecutions.length === 0 ? (
            <p className="py-8 text-center text-xs text-ink-3">No executions recorded in this portfolio context.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-white/[0.08] text-[11px] uppercase tracking-wider text-ink-2 font-sans">
                    <th className="pb-2">Time</th>
                    <th className="pb-2">Instrument</th>
                    <th className="pb-2">Side</th>
                    <th className="pb-2">Qty</th>
                    <th className="pb-2">Fill Price (₹)</th>
                    <th className="pb-2">Gross (₹)</th>
                    <th className="pb-2">Brokerage</th>
                    <th className="pb-2">STT Tax</th>
                    <th className="pb-2">Exchange+SEBI</th>
                    <th className="pb-2">GST (18%)</th>
                    <th className="pb-2">Total Fees</th>
                    <th className="pb-2 font-bold text-white">Net Total (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {filteredExecutions.map((e) => (
                    <tr key={e.id} className="hover:bg-white/[0.03]">
                      <td className="py-2.5 text-ink-3 text-[11px]">{e.executed_at}</td>
                      <td className="py-2.5 font-bold text-white font-sans">{e.symbol}</td>
                      <td className="py-2.5 font-sans">
                        <span
                          className={`font-semibold px-2 py-0.5 rounded text-[10px] ${
                            e.side === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                          }`}
                        >
                          {e.side}
                        </span>
                      </td>
                      <td className="py-2.5 text-ink">{e.quantity}</td>
                      <td className="py-2.5 text-white font-semibold">₹{e.fill_price.toFixed(2)}</td>
                      <td className="py-2.5 text-ink-2">₹{e.gross_amount.toFixed(2)}</td>
                      <td className="py-2.5 text-ink-2">₹{e.brokerage.toFixed(2)}</td>
                      <td className="py-2.5 text-amber-400">₹{e.stt_charges.toFixed(2)}</td>
                      <td className="py-2.5 text-ink-2">
                        ₹{(e.exchange_turnover_charges + e.sebi_charges).toFixed(2)}
                      </td>
                      <td className="py-2.5 text-ink-2">₹{e.gst.toFixed(2)}</td>
                      <td className="py-2.5 text-amber-300 font-semibold">₹{e.total_charges.toFixed(2)}</td>
                      <td className="py-2.5 font-bold text-white">₹{e.net_amount.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* Orders Table */
        <div className="card p-5">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-4">Submitted Orders</h2>
          {filteredOrders.length === 0 ? (
            <p className="py-8 text-center text-xs text-ink-3">No orders placed yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-white/[0.08] text-[11px] uppercase tracking-wider text-ink-2 font-sans">
                    <th className="pb-2">Time</th>
                    <th className="pb-2">Symbol</th>
                    <th className="pb-2">Side</th>
                    <th className="pb-2">Mode</th>
                    <th className="pb-2">Product</th>
                    <th className="pb-2">Qty</th>
                    <th className="pb-2">Price (₹)</th>
                    <th className="pb-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {filteredOrders.map((o) => (
                    <tr key={o.id} className="hover:bg-white/[0.03]">
                      <td className="py-2 text-ink-3 text-[11px]">{o.submitted_at}</td>
                      <td className="py-2 font-bold text-white font-sans">{o.symbol}</td>
                      <td className="py-2 font-sans font-semibold">
                        <span className={o.side === 'BUY' ? 'text-emerald-400' : 'text-rose-400'}>{o.side}</span>
                      </td>
                      <td className="py-2 font-sans text-ink-2 text-[11px]">{o.order_mode}</td>
                      <td className="py-2 font-sans text-ink-2">{o.product_type}</td>
                      <td className="py-2 text-ink">{o.quantity}</td>
                      <td className="py-2 text-white">₹{o.price.toFixed(2)}</td>
                      <td className="py-2 font-sans">
                        <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded font-semibold">
                          {o.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
