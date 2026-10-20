'use client';
import React, { useState } from 'react';
import { X, Sparkles, CheckCircle, AlertTriangle, ArrowRight } from 'lucide-react';

interface Props {
  isOpen: boolean;
  portfolio: { id: string; name: string; type: string };
  assets: { id: string; symbol: string; name: string }[];
  onClose: () => void;
  onSuccess: () => void;
}

export default function ProposalModal({
  isOpen,
  portfolio,
  assets,
  onClose,
  onSuccess
}: Props) {
  const [assetId, setAssetId] = useState(assets[0]?.id || '');
  const [horizon, setHorizon] = useState<'LONG_TERM' | 'SHORT_TERM'>('LONG_TERM');
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [loading, setLoading] = useState(false);
  const [proposalResult, setProposalResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setProposalResult(null);

    try {
      const res = await fetch('/api/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate',
          portfolioId: portfolio.id,
          assetId,
          side,
          horizon
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate proposal');
      setProposalResult(data.proposal);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExecuteProposal = async (approve: boolean) => {
    if (!proposalResult) return;
    setExecuting(true);
    try {
      const res = await fetch('/api/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'respond',
          proposalId: proposalResult.proposalId,
          decision: approve ? 'APPROVE' : 'REJECT'
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to execute proposal');
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-xl max-h-[90vh] flex flex-col rounded-xl border border-white/[0.12] bg-[#0f1420] p-6 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-ink-2 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2 mb-2 text-purple-400">
          <Sparkles className="h-5 w-5" />
          <h2 className="text-lg font-bold text-white">Ask the AI for an idea</h2>
        </div>
        <p className="text-xs text-ink-2 mb-4">
          The strategist reads the sample company data, checks the price trend, and applies fixed risk rules before suggesting anything.
        </p>

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-950/40 p-3 text-xs text-red-200">
            <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
            <div>{error}</div>
          </div>
        )}

        {!proposalResult ? (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-ink-2 mb-1">Company</label>
              <select
                value={assetId}
                onChange={(e) => setAssetId(e.target.value)}
                className="w-full rounded-lg border border-white/[0.12] bg-black/30 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
              >
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.symbol} - {a.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-ink-2 mb-1">What should it do?</label>
                <select
                  value={side}
                  onChange={(e) => setSide(e.target.value as any)}
                  className="w-full rounded-lg border border-white/[0.12] bg-black/30 px-3 py-2 text-sm text-white"
                >
                  <option value="BUY">Buy — own a slice</option>
                  <option value="SELL">Sell — step out</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-2 mb-1">How long for?</label>
                <select
                  value={horizon}
                  onChange={(e) => setHorizon(e.target.value as any)}
                  className="w-full rounded-lg border border-white/[0.12] bg-black/30 px-3 py-2 text-sm text-white"
                >
                  <option value="LONG_TERM">Years (long term)</option>
                  <option value="SHORT_TERM">Weeks (short term)</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-white/[0.08]">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-white/[0.12] px-4 py-2 text-xs font-medium text-ink-2 hover:bg-white/[0.06]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={loading}
                className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-5 py-2 text-xs font-semibold text-white hover:bg-purple-500 shadow"
              >
                {loading ? 'Thinking it through…' : 'Get an idea'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto pr-1 space-y-4">
            <div className="rounded-lg border border-purple-500/30 bg-purple-950/20 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-white text-base">
                  {proposalResult.action} {proposalResult.quantity} shares of {proposalResult.assetSymbol}
                </span>
                <span className="text-xs px-2 py-0.5 rounded font-semibold bg-purple-500/30 text-purple-300">
                  {proposalResult.horizon}
                </span>
              </div>
              <p className="text-xs text-ink-2 leading-relaxed mb-3">{proposalResult.rationale}</p>

              <div className="grid grid-cols-3 gap-2 text-xs border-t border-purple-500/20 pt-2 text-ink-2">
                <div>
                  Price: <strong className="text-white">₹{proposalResult.proposedPrice}</strong>
                </div>
                <div>
                  Total: <strong className="text-white">₹{proposalResult.totalValue.toLocaleString('en-IN')}</strong>
                </div>
                <div>
                  Estimated charges: <strong className="text-amber-400">₹{proposalResult.expectedCharges.toFixed(2)}</strong>
                </div>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <div className="rounded border border-emerald-500/20 bg-emerald-950/20 p-2.5">
                <span className="font-semibold text-emerald-400">Why this could work:</span>
                <p className="text-ink-2 mt-1">{proposalResult.supportingEvidence}</p>
              </div>

              <div className="rounded border border-amber-500/20 bg-amber-950/20 p-2.5">
                <span className="font-semibold text-amber-400">What could go wrong:</span>
                <p className="text-ink-2 mt-1">{proposalResult.contraryEvidence}</p>
              </div>

              <div className="rounded border border-white/[0.08] bg-black/30 p-2.5">
                <span className="font-semibold text-ink-2">Safety check:</span>
                <div className="mt-1 flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-emerald-400" />
                  <span className="text-emerald-300">
                    Passed every rule (this share would be {proposalResult.riskAssessment.calculatedPositionPct}%, Cash remaining: ₹{proposalResult.riskAssessment.cashRemainingAfter})
                  </span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-white/[0.08]">
              <button
                type="button"
                onClick={() => handleExecuteProposal(false)}
                disabled={executing}
                className="rounded-lg border border-white/[0.12] px-4 py-2 text-xs font-semibold text-ink-2 hover:bg-white/[0.06]"
              >
                No thanks
              </button>
              <button
                type="button"
                onClick={() => handleExecuteProposal(true)}
                disabled={executing}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-5 py-2 text-xs font-semibold text-white hover:bg-emerald-500 shadow"
              >
                {executing ? 'Placing…' : 'Approve — place this practice order'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
