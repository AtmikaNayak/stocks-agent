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

/** Closes on Escape and prevents the page behind the dialog from scrolling. */
function useDialogBehaviour(isOpen: boolean, onClose: () => void) {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);
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
  const [price, setPrice] = useState<number>(preselectedAsset?.price || assets[0]?.price || 0);
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

  useDialogBehaviour(isOpen, onClose);

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
    setError(null);
    if (portfolio.type === 'REAL') {
      setError('Real-money orders are disabled in this build. Use the virtual simulator.');
      return;
    }
    setLoading(true);

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portfolioId: portfolio.id,
          assetId,
          side,
          quantity,
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-modal-title"
        className="relative w-full max-w-lg rounded-xl border border-white/[0.12] bg-[#0f1420] p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the practice-trade dialog"
          className="absolute right-4 top-4 text-ink-2 hover:text-white"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>

        <div className="mb-4">
          <div className="flex items-center gap-2">
            <span
              className={`rounded px-2 py-0.5 text-xs font-semibold ${
                portfolio.type === 'VIRTUAL'
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
              }`}
            >
              {portfolio.type === 'VIRTUAL' ? 'Practice' : 'Read-only'}
            </span>
            <h2 id="order-modal-title" className="text-lg font-bold text-white">
              Practise a trade
            </h2>
          </div>
          <p className="text-xs text-ink-2 mt-1">
            Using <strong className="text-ink">{portfolio.name}</strong> · cash available ₹{portfolio.current_cash.toLocaleString('en-IN')}
          </p>
        </div>

        {portfolio.type === 'REAL' && (
          <div className="mb-4 rounded-lg border border-rose-500/40 bg-rose-950/30 p-3 text-xs text-rose-200">
            This is a read-only view of your real account. Real-money orders are switched off in this build — no broker is connected.
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-950/40 p-3 text-xs text-red-200"
          >
            <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <strong>This order was blocked:</strong> {error}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Side & Holding type Toggle */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-ink-2 mb-1">Buy or sell</label>
              <div className="flex rounded-lg border border-white/[0.12] p-1 bg-black/30">
                <button
                  type="button"
                  onClick={() => setSide('BUY')}
                  className={`flex-1 rounded py-1.5 text-xs font-semibold transition ${
                    side === 'BUY' ? 'bg-emerald-600 text-white shadow' : 'text-ink-2 hover:text-white'
                  }`}
                >
                  BUY
                </button>
                <button
                  type="button"
                  onClick={() => setSide('SELL')}
                  className={`flex-1 rounded py-1.5 text-xs font-semibold transition ${
                    side === 'SELL' ? 'bg-red-600 text-white shadow' : 'text-ink-2 hover:text-white'
                  }`}
                >
                  SELL
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-2 mb-1">Holding type</label>
              <div className="flex rounded-lg border border-white/[0.12] p-1 bg-black/30">
                <button
                  type="button"
                  onClick={() => setProductType('CNC')}
                  className={`flex-1 rounded py-1.5 text-xs font-semibold transition ${
                    productType === 'CNC' ? 'bg-blue-600 text-white shadow' : 'text-ink-2 hover:text-white'
                  }`}
                >
                  Keep (delivery)
                </button>
                <button
                  type="button"
                  onClick={() => setProductType('MIS')}
                  className={`flex-1 rounded py-1.5 text-xs font-semibold transition ${
                    productType === 'MIS' ? 'bg-blue-600 text-white shadow' : 'text-ink-2 hover:text-white'
                  }`}
                >
                  Same-day (intraday)
                </button>
              </div>
            </div>
          </div>

          {/* Asset Selection */}
          <div>
            <label className="block text-xs font-semibold text-ink-2 mb-1">Which company</label>
            <select
              value={assetId}
              onChange={(e) => {
                setAssetId(e.target.value);
                const found = assets.find((a) => a.id === e.target.value);
                if (found?.price) setPrice(found.price);
              }}
              className="w-full rounded-lg border border-white/[0.12] bg-black/30 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
            >
              {assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.symbol} - {a.name} {a.price ? `(₹${a.price})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Quantity & reference quote: this simulator does not support user-specified limit fills. */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-ink-2 mb-1">How many shares</label>
              <input
                type="number"
                min="1"
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-full rounded-lg border border-white/[0.12] bg-black/30 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-2 mb-1">Price per share (demo)</label>
              <div className="w-full rounded-lg border border-white/[0.12] bg-[#0f1420] px-3 py-2 text-sm text-ink">
                {price > 0 ? price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'Quote unavailable'}
              </div>
              <p className="mt-1 text-[10px] text-ink-3">Estimate only — the simulator fills at the stored demo price.</p>
            </div>
          </div>

          {/* What this trade costs */}
          <div className="rounded-lg border border-white/[0.08] bg-black/30 p-3 text-xs space-y-1.5">
            <div className="flex justify-between text-ink-2 font-medium pb-1 border-b border-white/[0.08]">
              <span>Order Value:</span>
              <span className="text-white font-semibold">₹{charges.turnover.toLocaleString('en-IN')}</span>
            </div>
            <div className="flex justify-between text-ink-2">
              <span>Brokerage:</span>
              <span>₹{charges.brokerage.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-ink-2">
              <span>STT (Securities Transaction Tax):</span>
              <span>₹{charges.stt.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-ink-2">
              <span>Exchange Turnover & SEBI Fees:</span>
              <span>₹{(charges.exchangeTurnoverCharges + charges.sebiTurnoverCharges).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-ink-2">
              <span>Stamp Duty & GST (18%):</span>
              <span>₹{(charges.stampDuty + charges.gst).toFixed(2)}</span>
            </div>
            <div className="flex justify-between pt-1 border-t border-white/[0.08] text-ink-2 font-semibold">
              <span>Total charges:</span>
              <span className="text-amber-400">₹{charges.totalCharges.toFixed(2)}</span>
            </div>
            <div className="flex justify-between pt-1 text-sm font-bold">
              <span className="text-ink">
                {side === 'BUY' ? 'Total Cash Required:' : 'Estimated Cash Credit:'}
              </span>
              <span className={side === 'BUY' ? 'text-blue-400' : 'text-emerald-400'}>
                ₹{charges.netAmount.toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-ink-2">
            <ShieldCheck className="h-4 w-4 text-blue-400 shrink-0" />
            <span>Fixed safety rules apply: at most 15% in one share, and 20% always kept as cash.</span>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-white/[0.12] px-4 py-2 text-xs font-medium text-ink-2 hover:bg-white/[0.06]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || portfolio.type === 'REAL'}
              className={`rounded-lg px-5 py-2 text-xs font-semibold text-white shadow transition ${
                side === 'BUY'
                  ? 'bg-emerald-600 hover:bg-emerald-500'
                  : 'bg-red-600 hover:bg-red-500'
              }`}
            >
              {loading ? 'Checking the safety rules…' : `Confirm practice ${side.toLowerCase()}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
