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
      <div className="relative w-full max-w-xl max-h-[90vh] flex flex-col rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-slate-400 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2 mb-2 text-purple-400">
          <Sparkles className="h-5 w-5" />
          <h2 className="text-lg font-bold text-white">Ask AI Strategist for Proposal</h2>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          The Strategist Agent evaluates verified fundamentals, balance sheet durability, price trend, and runs deterministic risk checks.
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
              <label className="block text-xs font-semibold text-slate-400 mb-1">Target Asset</label>
              <select
                value={assetId}
                onChange={(e) => setAssetId(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
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
                <label className="block text-xs font-semibold text-slate-400 mb-1">Action</label>
                <select
                  value={side}
                  onChange={(e) => setSide(e.target.value as any)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                >
                  <option value="BUY">BUY Allocation</option>
                  <option value="SELL">SELL / Exit</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Horizon</label>
                <select
                  value={horizon}
                  onChange={(e) => setHorizon(e.target.value as any)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                >
                  <option value="LONG_TERM">Long-Term Wealth</option>
                  <option value="SHORT_TERM">Short-Term Swing</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={loading}
                className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-5 py-2 text-xs font-semibold text-white hover:bg-purple-500 shadow"
              >
                {loading ? 'Analyzing Market & Risk...' : 'Generate Structured Proposal'}
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
              <p className="text-xs text-slate-300 leading-relaxed mb-3">{proposalResult.rationale}</p>

              <div className="grid grid-cols-3 gap-2 text-xs border-t border-purple-500/20 pt-2 text-slate-400">
                <div>
                  Quote: <strong className="text-white">₹{proposalResult.proposedPrice}</strong>
                </div>
                <div>
                  Total: <strong className="text-white">₹{proposalResult.totalValue.toLocaleString('en-IN')}</strong>
                </div>
                <div>
                  Statutory Costs: <strong className="text-amber-400">₹{proposalResult.expectedCharges.toFixed(2)}</strong>
                </div>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <div className="rounded border border-emerald-500/20 bg-emerald-950/20 p-2.5">
                <span className="font-semibold text-emerald-400">Supporting Evidence:</span>
                <p className="text-slate-300 mt-1">{proposalResult.supportingEvidence}</p>
              </div>

              <div className="rounded border border-amber-500/20 bg-amber-950/20 p-2.5">
                <span className="font-semibold text-amber-400">Contrary Evidence / Downside:</span>
                <p className="text-slate-300 mt-1">{proposalResult.contraryEvidence}</p>
              </div>

              <div className="rounded border border-slate-800 bg-slate-950 p-2.5">
                <span className="font-semibold text-slate-300">Deterministic Risk Assessment:</span>
                <div className="mt-1 flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-emerald-400" />
                  <span className="text-emerald-300">
                    Passed all risk checks (Position weight: {proposalResult.riskAssessment.calculatedPositionPct}%, Cash remaining: ₹{proposalResult.riskAssessment.cashRemainingAfter})
                  </span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => handleExecuteProposal(false)}
                disabled={executing}
                className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800"
              >
                Decline Proposal
              </button>
              <button
                type="button"
                onClick={() => handleExecuteProposal(true)}
                disabled={executing}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-5 py-2 text-xs font-semibold text-white hover:bg-emerald-500 shadow"
              >
                {executing ? 'Executing...' : 'Approve & Execute Order'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
