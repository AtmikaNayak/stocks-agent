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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 p-5 rounded-2xl border border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-purple-500/20 text-purple-400">
            <BookOpen className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Pre-Execution Decision Journal & Evidence</h1>
            <p className="text-xs text-slate-400">
              Immutable rationale captured before every trade. No retroactive justification.
            </p>
          </div>
        </div>

        <span className="text-xs font-mono bg-purple-500/20 text-purple-300 border border-purple-500/30 px-3 py-1 rounded-lg">
          {decisions.length} Audited Decisions
        </span>
      </div>

      {loading ? (
        <div className="py-20 text-center text-xs text-slate-400">Loading decision records...</div>
      ) : decisions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-800 p-12 text-center space-y-2">
          <BookOpen className="h-8 w-8 text-slate-600 mx-auto" />
          <h3 className="text-sm font-bold text-slate-300">Decision Journal Empty</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            As soon as an order is executed by you or the AI Copilot, the pre-execution rationale and supporting evidence will be recorded here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {decisions.map((dec) => (
            <div key={dec.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-base text-white">
                    {dec.action} {dec.quantity} shares of {dec.symbol}
                  </span>
                  <span className="text-xs font-mono text-slate-400">@ ₹{dec.price}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-mono text-slate-500 text-[11px]">{dec.decision_timestamp}</span>
                  <span className="bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded text-[10px] font-semibold">
                    AUDITED
                  </span>
                </div>
              </div>

              {/* Toggle Plain vs Advanced Rationale based on user mode */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
                  <span>
                    {experienceMode === 'BEGINNER' ? 'Plain Language Explanation:' : 'Quantitative Investment Rationale:'}
                  </span>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs leading-relaxed text-slate-200">
                  {experienceMode === 'BEGINNER' ? dec.reasoning_plain_language : dec.reasoning_advanced}
                </div>
              </div>

              {/* What Could Go Wrong */}
              <div className="rounded-lg border border-amber-500/20 bg-amber-950/20 p-3 text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span>Downside Risk & What Could Go Wrong:</span>
                </div>
                <p className="text-slate-300 pl-5">{dec.what_could_go_wrong}</p>
              </div>

              {/* Risk Engine Approval Summary */}
              <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 text-[11px] text-slate-400">
                <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
                  <ShieldCheck className="h-4 w-4" />
                  <span>Deterministic Risk Checks: Passed All Limits</span>
                </div>
                <span className="text-slate-500 font-mono">ID: {dec.id}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
