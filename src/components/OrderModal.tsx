'use client';
import React, { useState, useEffect } from 'react';
import { X, ShieldCheck, AlertCircle } from 'lucide-react';
import { calculateIndianCharges } from '@/lib/tax-calculator';

interface Props {
  isOpen: boolean;
  portfolio: { id: string; name: string; type: string; current_cash: number };
  assets: { id: string; symbol: string; name: string; price?: number }[];
  preselectedAsset?: { id: string; symbol: string; name: string; price?: number };
  onClose: () => void;
  onSuccess: () => void;
}

export default function OrderModal({
  isOpen,
  portfolio,
  assets,
  preselectedAsset,
  onClose,
  onSuccess
}: Props) {
  const [assetId, setAssetId] = useState(preselectedAsset?.id || assets[0]?.id || '');
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [productType, setProductType] = useState<'CNC' | 'MIS'>('CNC');
  const [quantity, setQuantity] = useState<number>(1);
  const [price, setPrice] = useState<number>(preselectedAsset?.price || 1000);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (preselectedAsset) {
      setAssetId(preselectedAsset.id);
      if (preselectedAsset.price) setPrice(preselectedAsset.price);
    } else if (assets.length > 0 && !assetId) {
      setAssetId(assets[0].id);
      if (assets[0].price) setPrice(assets[0].price);
    }
  }, [preselectedAsset, assets]);

  if (!isOpen) return null;

  const currentAsset = assets.find((a) => a.id === assetId);

  // Live recalculate charges
  const charges = calculateIndianCharges({
    side,
    quantity,
    price,
    productType,
    slippagePct: 0.05
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portfolioId: portfolio.id,
          assetId,
          side,
          quantity,
          price,
          productType,
          orderMode: 'MANUAL'
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Execution failed');
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-slate-400 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-4">
          <div className="flex items-center gap-2">
            <span
              className={`rounded px-2 py-0.5 text-xs font-semibold ${
                portfolio.type === 'VIRTUAL'
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              }`}
            >
              {portfolio.type === 'VIRTUAL' ? 'Virtual Simulator' : 'Live Demat'}
            </span>
            <h2 className="text-lg font-bold text-white">Place Order Ticket</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Target Portfolio: <strong className="text-slate-200">{portfolio.name}</strong> (Available Cash: ₹{portfolio.current_cash.toLocaleString('en-IN')})
          </p>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-950/40 p-3 text-xs text-red-200">
            <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
            <div>
              <strong>Risk / Order Rejection:</strong> {error}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Side & Product Toggle */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Order Side</label>
              <div className="flex rounded-lg border border-slate-700 p-1 bg-slate-950">
                <button
                  type="button"
                  onClick={() => setSide('BUY')}
                  className={`flex-1 rounded py-1.5 text-xs font-semibold transition ${
                    side === 'BUY' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  BUY
                </button>
                <button
                  type="button"
                  onClick={() => setSide('SELL')}
                  className={`flex-1 rounded py-1.5 text-xs font-semibold transition ${
                    side === 'SELL' ? 'bg-red-600 text-white shadow' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  SELL
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Product</label>
              <div className="flex rounded-lg border border-slate-700 p-1 bg-slate-950">
                <button
                  type="button"
                  onClick={() => setProductType('CNC')}
                  className={`flex-1 rounded py-1.5 text-xs font-semibold transition ${
                    productType === 'CNC' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  CNC (Delivery)
                </button>
                <button
                  type="button"
                  onClick={() => setProductType('MIS')}
                  className={`flex-1 rounded py-1.5 text-xs font-semibold transition ${
                    productType === 'MIS' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  MIS (Intraday)
                </button>
              </div>
            </div>
          </div>

          {/* Asset Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Instrument</label>
            <select
              value={assetId}
              onChange={(e) => {
                setAssetId(e.target.value);
                const found = assets.find((a) => a.id === e.target.value);
                if (found?.price) setPrice(found.price);
              }}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
            >
              {assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.symbol} - {a.name} {a.price ? `(₹${a.price})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Quantity & Price */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Quantity (Shares)</label>
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Limit Price (₹)</label>
              <input
                type="number"
                step="0.05"
                value={price}
                onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Statutory Charges Breakdown (SEBI / NSE Mandates) */}
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-xs space-y-1.5">
            <div className="flex justify-between text-slate-400 font-medium pb-1 border-b border-slate-800">
              <span>Order Value:</span>
              <span className="text-white font-semibold">₹{charges.turnover.toLocaleString('en-IN')}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Brokerage (Standard):</span>
              <span>₹{charges.brokerage.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>STT (Securities Transaction Tax):</span>
              <span>₹{charges.stt.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Exchange Turnover & SEBI Fees:</span>
              <span>₹{(charges.exchangeTurnoverCharges + charges.sebiTurnoverCharges).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Stamp Duty & GST (18%):</span>
              <span>₹{(charges.stampDuty + charges.gst).toFixed(2)}</span>
            </div>
            <div className="flex justify-between pt-1 border-t border-slate-800 text-slate-300 font-semibold">
              <span>Total Statutory Charges:</span>
              <span className="text-amber-400">₹{charges.totalCharges.toFixed(2)}</span>
            </div>
            <div className="flex justify-between pt-1 text-sm font-bold">
              <span className="text-slate-200">
                {side === 'BUY' ? 'Total Cash Required:' : 'Estimated Cash Credit:'}
              </span>
              <span className={side === 'BUY' ? 'text-blue-400' : 'text-emerald-400'}>
                ₹{charges.netAmount.toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <ShieldCheck className="h-4 w-4 text-blue-400 shrink-0" />
            <span>Deterministic risk safeguards active: Max 15% position, 20% cash buffer.</span>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className={`rounded-lg px-5 py-2 text-xs font-semibold text-white shadow transition ${
                side === 'BUY'
                  ? 'bg-emerald-600 hover:bg-emerald-500'
                  : 'bg-red-600 hover:bg-red-500'
              }`}
            >
              {loading ? 'Validating Risk & Placing...' : `Confirm ${side} Order`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
