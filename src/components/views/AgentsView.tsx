'use client';
import React, { useState } from 'react';
import {
  Bot,
  Sparkles,
  ShieldCheck,
  BookOpen,
  Play,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ArrowRight
} from 'lucide-react';

interface Props {
  agentsData: {
    runs: any[];
    observations: any[];
    theses: any[];
  };
  onRefresh: () => void;
  onOpenProposalModal: () => void;
}

export default function AgentsView({
  agentsData,
  onRefresh,
  onOpenProposalModal
}: Props) {
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);

  const handleTriggerScan = async () => {
    setScanning(true);
    setScanMessage(null);
    try {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'scan' })
      });
      const data = await res.json();
      if (res.ok) {
        setScanMessage(data.scanResult?.summary || 'Scan completed successfully.');
        onRefresh();
      }
    } finally {
      setScanning(false);
    }
  };

  const agents = [
    {
      name: 'Agent 1: Market Intelligence',
      role: 'Schedules market data scans, monitors volatility breakouts, fundamentals, and flags valuation opportunities.',
      status: 'ONLINE',
      permissions: 'Read-only market feeds. Cannot submit orders.'
    },
    {
      name: 'Agent 2: Investment Strategist',
      role: 'Formulates structured long/short proposals, weighs valuation vs quality, evaluates invalidation criteria.',
      status: 'ONLINE',
      permissions: 'Generates proposal structures. Requires user approval.'
    },
    {
      name: 'Agent 3: Portfolio & Execution',
      role: 'Enforces hard mathematical limits (15% pos, 20% cash), calculates STT & slippage, maintains double-entry ledger.',
      status: 'ONLINE',
      permissions: 'Can place practice orders inside the risk rules; real account untouched.'
    },
    {
      name: 'Agent 4: Explainability & Learning',
      role: 'Logs pre-execution audit rationales, provides grounded conversational Q&A, audits thesis outcomes.',
      status: 'ONLINE',
      permissions: 'Audit and explainability ledger persistence.'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-500/20 text-blue-400">
            <Bot className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Your AI assistants</h1>
            <p className="text-xs text-ink-2">
              Four assistants with separate jobs: spot things, suggest ideas, explain them, and place only what the risk rules allow.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleTriggerScan}
            disabled={scanning}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 px-3.5 py-2 text-xs font-semibold text-white shadow transition"
          >
            <Play className="h-3.5 w-3.5" />
            <span>{scanning ? 'Scanning NSE...' : 'Run Market Intelligence Scan'}</span>
          </button>
          <button
            onClick={onOpenProposalModal}
            className="flex items-center gap-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 px-3.5 py-2 text-xs font-semibold text-white shadow transition"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Ask Strategist</span>
          </button>
        </div>
      </div>

      {scanMessage && (
        <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-950/20 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>{scanMessage}</span>
        </div>
      )}

      {/* 4 Agent Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {agents.map((ag, i) => (
          <div key={i} className="card p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-white">{ag.name}</span>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-mono font-semibold">
                {ag.status}
              </span>
            </div>
            <p className="text-[11px] text-ink-2 leading-relaxed">{ag.role}</p>
            <div className="pt-2 border-t border-white/[0.06] text-[10px] text-ink-3">
              Scope: {ag.permissions}
            </div>
          </div>
        ))}
      </div>

      {/* Observations: Facts vs Interpretation */}
      <div className="card p-5 space-y-4">
        <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <span>Market Intelligence Observations</span>
          <span className="text-xs text-ink-2 font-normal">
            (Separating empirical facts from model interpretations)
          </span>
        </h2>

        <div className="space-y-3">
          {agentsData.observations.map((obs) => (
            <div key={obs.id} className="rounded-lg border border-white/[0.08] bg-black/30 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-white">{obs.symbol}</span>
                  <span className="text-xs text-ink-2">{obs.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                      obs.priority === 'HIGH'
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-blue-500/20 text-blue-300'
                    }`}
                  >
                    {obs.observation_type}
                  </span>
                  <span className="text-[10px] text-ink-3">{obs.observed_at}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-1">
                <div className="rounded card p-2.5">
                  <span className="font-semibold text-ink-2 block mb-1">Empirical Facts:</span>
                  <p className="text-ink-2 leading-relaxed">{obs.facts}</p>
                </div>
                <div className="rounded border border-blue-500/20 bg-blue-950/20 p-2.5">
                  <span className="font-semibold text-blue-300 block mb-1">Model Interpretation:</span>
                  <p className="text-ink-2 leading-relaxed">{obs.interpretation}</p>
                </div>
              </div>

              {(obs.catalysts || obs.risks) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] text-ink-2 pt-1">
                  <div>
                    <strong className="text-emerald-400">Catalyst:</strong> {obs.catalysts || 'None identified'}
                  </div>
                  <div>
                    <strong className="text-amber-400">Primary Risk:</strong> {obs.risks || 'Standard market beta'}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Active Investment Theses */}
      <div className="card p-5 space-y-3">
        <h2 className="text-sm font-bold text-white uppercase tracking-wider">
          Active Investment Theses Under Continuous Monitoring
        </h2>
        {agentsData.theses.length === 0 ? (
          <p className="text-xs text-ink-3 py-4">No active theses. Generate a BUY proposal to establish a tracked thesis.</p>
        ) : (
          <div className="space-y-3">
            {agentsData.theses.map((th) => (
              <div key={th.id} className="rounded-lg border border-white/[0.08] bg-black/30 p-4 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-sm">{th.symbol} ({th.horizon})</span>
                  <span className="text-[10px] px-2 py-0.5 rounded font-semibold bg-emerald-500/20 text-emerald-400">
                    {th.status}
                  </span>
                </div>
                <p className="text-ink-2">{th.core_thesis}</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-white/[0.08] text-ink-2">
                  <div>Target Price: <strong className="text-white">₹{th.target_price}</strong></div>
                  <div>Stop Loss: <strong className="text-rose-400">₹{th.stop_loss_price}</strong></div>
                  <div>Horizon: <strong className="text-ink-2">{th.time_horizon_days} days</strong></div>
                  <div>Invalidation: <span className="text-ink-2 truncate block">{th.invalidation_criteria}</span></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
