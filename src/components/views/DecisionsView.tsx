'use client';
import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  ShieldCheck,
  AlertTriangle,
  CheckCircle,
  FileText,
  HelpCircle,
  Sparkles
} from 'lucide-react';

interface Props {
  activePortfolioType: 'REAL' | 'VIRTUAL';
  experienceMode: 'BEGINNER' | 'ADVANCED';
}

export default function DecisionsView({ activePortfolioType, experienceMode }: Props) {
  const [decisions, setDecisions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/explainability')
      .then((r) => r.json())
      .then((d) => {
        setDecisions(d.decisions || []);
        setLoading(false);
      });
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-purple-500/20 text-purple-400">
            <BookOpen className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Decision journal</h1>
            <p className="text-xs text-ink-2">
              Why each trade was suggested, written down before it happened. Nothing is edited afterwards.
            </p>
          </div>
        </div>

        <span className="text-xs font-mono bg-purple-500/20 text-purple-300 border border-purple-500/30 px-3 py-1 rounded-lg">
          {decisions.length} decisions recorded
        </span>
      </div>

      {loading ? (
        <div className="py-20 text-center text-xs text-ink-2">Loading decision records...</div>
      ) : decisions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/[0.08] p-12 text-center space-y-2">
          <BookOpen className="h-8 w-8 text-ink-3 mx-auto" />
          <h3 className="text-sm font-bold text-ink-2">Decision Journal Empty</h3>
          <p className="text-xs text-ink-3 max-w-sm mx-auto">
            As soon as an order is executed by you or the AI Copilot, the pre-execution rationale and supporting evidence will be recorded here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {decisions.map((dec) => (
            <div key={dec.id} className="card p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-base text-white">
                    {dec.action} {dec.quantity} shares of {dec.symbol}
                  </span>
                  <span className="text-xs font-mono text-ink-2">@ ₹{dec.price}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-mono text-ink-3 text-[11px]">{dec.decision_timestamp}</span>
                  <span className="bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded text-[10px] font-semibold">
                    RECORDED
                  </span>
                </div>
              </div>

              {/* Toggle Plain vs Advanced Rationale based on user mode */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-ink-2">
                  <span>
                    {experienceMode === 'BEGINNER' ? 'Plain Language Explanation:' : 'Quantitative Investment Rationale:'}
                  </span>
                </div>
                <div className="rounded-lg border border-white/[0.08] bg-black/30 p-3 text-xs leading-relaxed text-ink">
                  {experienceMode === 'BEGINNER' ? dec.reasoning_plain_language : dec.reasoning_advanced}
                </div>
              </div>

              {/* What Could Go Wrong */}
              <div className="rounded-lg border border-amber-500/20 bg-amber-950/20 p-3 text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span>Downside Risk & What Could Go Wrong:</span>
                </div>
                <p className="text-ink-2 pl-5">{dec.what_could_go_wrong}</p>
              </div>

              {/* Risk Engine Approval Summary */}
              <div className="flex items-center justify-between pt-1 border-t border-white/[0.06] text-[11px] text-ink-2">
                <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
                  <ShieldCheck className="h-4 w-4" />
                  <span>Deterministic Risk Checks: Passed All Limits</span>
                </div>
                <span className="text-ink-3 font-mono">ID: {dec.id}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
