'use client';
import React, { useState } from 'react';
import {
  Sliders,
  ShieldCheck,
  AlertTriangle,
  Lock,
  CheckCircle2,
  Bot
} from 'lucide-react';

interface Props {
  currentControlMode: string;
  onUpdateMode: (mode: string) => Promise<void>;
}

export default function PermissionsView({ currentControlMode, onUpdateMode }: Props) {
  const [mode, setMode] = useState(currentControlMode || 'COPILOT');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const controlModes = [
    {
      id: 'MANUAL',
      name: 'Watch only',
      desc: 'You research, decide and place every order yourself. The AI only shares information.',
      level: 'You decide'
    },
    {
      id: 'COPILOT',
      name: 'AI suggests, you decide (recommended)',
      desc: 'The AI researches and explains an idea. You review it and choose whether to place the order.',
      level: 'You decide'
    },
    {
      id: 'SUPERVISED',
      name: 'AI helps with rebalancing',
      desc: 'The AI keeps an eye on the portfolio and proposes small adjustments. You still confirm orders when a limit is close.',
      level: 'Some help'
    },
    {
      id: 'AUTONOMOUS_PAPER',
      name: 'Fully automated (practice money only)',
      desc: 'The AI manages the ₹25,000 practice portfolio within the safety rules. Your real account is never touched.',
      level: 'Practice only'
    },
    {
      id: 'AUTHORISED_LIVE',
      name: 'Live automation (not available)',
      desc: 'Would allow real orders. This build has no broker connection, so the server rejects this choice.',
      level: 'Unavailable'
    }
  ];

  const handleSave = async (newMode: string) => {
    setLoading(true);
    setSuccess(false);
    setError(null);
    try {
      await onUpdateMode(newMode);
      setMode(newMode);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setSuccess(false);
      setError(err?.message || 'That setting could not be saved.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-500/20 text-blue-400">
            <Sliders className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Automation controls</h1>
            <p className="text-xs text-ink-2">
              Decide how much the AI may do on its own. Practice trading can be automated; real-money automation stays locked.
            </p>
          </div>
        </div>

        {success && (
          <span className="text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-3 py-1 rounded-lg font-semibold flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" /> Saved
          </span>
        )}
        {error && (
          <span className="max-w-xs text-xs bg-rose-500/10 text-rose-300 border border-rose-500/30 px-3 py-1 rounded-lg font-medium flex items-center gap-1">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {error}
          </span>
        )}
      </div>

      {/* Control Modes Radio Cards */}
      <div className="space-y-3">
        {controlModes.map((m) => {
          const isSelected = mode === m.id;
          return (
            <div
              key={m.id}
              onClick={() => handleSave(m.id)}
              className={`rounded-xl border p-4 cursor-pointer transition ${
                isSelected
                  ? 'border-blue-500 bg-blue-950/20 shadow-md'
                  : 'border-white/[0.08] bg-[#0f1420]/80 hover:bg-white/[0.04]'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <div
                    className={`h-4 w-4 rounded-full border flex items-center justify-center ${
                      isSelected ? 'border-blue-500 bg-blue-600' : 'border-white/[0.18]'
                    }`}
                  >
                    {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                  </div>
                  <h3 className="font-bold text-sm text-white">{m.name}</h3>
                </div>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded font-mono font-semibold ${
                    m.id === 'AUTHORISED_LIVE'
                      ? 'bg-amber-500/20 text-amber-300'
                      : isSelected
                      ? 'bg-blue-500/20 text-blue-300'
                      : 'bg-white/[0.06] text-ink-2'
                  }`}
                >
                  {m.level}
                </span>
              </div>
              <p className="text-xs text-ink-2 pl-6 leading-relaxed">{m.desc}</p>
            </div>
          );
        })}
      </div>

      {/* Mode 5 Strict Notice */}
      <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 text-xs space-y-2">
        <div className="flex items-center gap-2 text-amber-400 font-bold">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Why live automation cannot be switched on</span>
        </div>
        <p className="text-ink-2 leading-relaxed">
          Real-money automation needs a working broker connection, confirmed fills and account reconciliation. None of that exists in this build, so the server refuses the request instead of quietly pretending to save it. Until then, every practice order stays inside the fixed safety limits.
        </p>
      </div>
    </div>
  );
}
