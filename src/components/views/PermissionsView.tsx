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

  const controlModes = [
    {
      id: 'MANUAL',
      name: 'Mode 1: Manual',
      desc: 'You research, decide, and place orders. The AI acts only as an informative research advisor with risk data.',
      level: 'ZERO AUTOMATION'
    },
    {
      id: 'COPILOT',
      name: 'Mode 2: AI Copilot (Default Recommended)',
      desc: 'The AI researches and generates structured investment proposals. You manually review, approve, or reject each order.',
      level: 'ASSISTED'
    },
    {
      id: 'SUPERVISED',
      name: 'Mode 3: Supervised Automation',
      desc: 'AI monitors continuously and can manage rebalancing tasks within narrow permissions. Orders require confirmation if risk thresholds are near.',
      level: 'MODERATE'
    },
    {
      id: 'AUTONOMOUS_PAPER',
      name: 'Mode 4: Autonomous Paper Trading',
      desc: 'The AI manages the virtual ₹25,000 portfolio autonomously within risk limits. Real Demat remains 100% untouched.',
      level: 'VIRTUAL FULL'
    },
    {
      id: 'AUTHORISED_LIVE',
      name: 'Mode 5: Authorised Live Automation',
      desc: 'AI may submit eligible live orders ONLY after explicit user activation, successful broker integration, and compliance checks.',
      level: 'LIVE CAUTION'
    }
  ];

  const handleSave = async (newMode: string) => {
    setLoading(true);
    setSuccess(false);
    try {
      await onUpdateMode(newMode);
      setMode(newMode);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 p-5 rounded-2xl border border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-500/20 text-blue-400">
            <Sliders className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Autonomy Controls & Permissions</h1>
            <p className="text-xs text-slate-400">
              Configure precisely how much autonomy the AI is granted across your virtual and real portfolios.
            </p>
          </div>
        </div>

        {success && (
          <span className="text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-3 py-1 rounded-lg font-semibold flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" /> Updated Successfully
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
                  : 'border-slate-800 bg-slate-900/60 hover:bg-slate-800/40'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <div
                    className={`h-4 w-4 rounded-full border flex items-center justify-center ${
                      isSelected ? 'border-blue-500 bg-blue-600' : 'border-slate-600'
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
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {m.level}
                </span>
              </div>
              <p className="text-xs text-slate-400 pl-6 leading-relaxed">{m.desc}</p>
            </div>
          );
        })}
      </div>

      {/* Mode 5 Strict Notice */}
      <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 text-xs space-y-2">
        <div className="flex items-center gap-2 text-amber-400 font-bold">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Regulatory Notice on Mode 5 (Authorised Live Automation)</span>
        </div>
        <p className="text-slate-300 leading-relaxed">
          Mode 5 can never be activated implicitly. Selecting it enforces server-side validation ensuring: (1) Official broker API authenticated, (2) SEBI statutory compliance signed, (3) Daily loss circuit limits configured, and (4) Emergency stop disengaged.
        </p>
      </div>
    </div>
  );
}
