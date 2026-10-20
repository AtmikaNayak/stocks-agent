'use client';
import React, { useState } from 'react';
import { Settings, User, Bell, Shield, CheckCircle2 } from 'lucide-react';

interface Props {
  experienceMode: 'BEGINNER' | 'ADVANCED';
  onToggleExperienceMode: (m: 'BEGINNER' | 'ADVANCED') => void;
}

export default function SettingsView({ experienceMode, onToggleExperienceMode }: Props) {
  const [saved, setSaved] = useState(false);

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between bg-slate-900 p-5 rounded-2xl border border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-slate-800 text-slate-300">
            <Settings className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Platform Settings & User Preferences</h1>
            <p className="text-xs text-slate-400">
              Manage interface experience, default risk thresholds, and notification delivery.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 space-y-6 text-xs">
        {/* User Profile */}
        <div className="space-y-3">
          <h3 className="font-bold text-sm text-white flex items-center gap-2">
            <User className="h-4 w-4 text-blue-400" />
            Investor Profile
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-400 mb-1">Full Name</label>
              <input
                type="text"
                disabled
                value="Rajesh K. Verma"
                className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2 text-slate-300"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Account Email</label>
              <input
                type="text"
                disabled
                value="investor@investpilot.ai"
                className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2 text-slate-300"
              />
            </div>
          </div>
        </div>

        {/* Experience Mode Toggle */}
        <div className="border-t border-slate-800 pt-5 space-y-3">
          <h3 className="font-bold text-sm text-white">Interface Experience Mode</h3>
          <div className="grid grid-cols-2 gap-3">
            <div
              onClick={() => onToggleExperienceMode('BEGINNER')}
              className={`p-3 rounded-lg border cursor-pointer transition ${
                experienceMode === 'BEGINNER'
                  ? 'border-indigo-500 bg-indigo-950/20 text-white font-bold'
                  : 'border-slate-800 bg-slate-950 text-slate-400'
              }`}
            >
              <span className="block font-bold">Beginner Mode</span>
              <span className="text-[11px] text-slate-400">Guided explanations, glossary, visual indicators</span>
            </div>
            <div
              onClick={() => onToggleExperienceMode('ADVANCED')}
              className={`p-3 rounded-lg border cursor-pointer transition ${
                experienceMode === 'ADVANCED'
                  ? 'border-indigo-500 bg-indigo-950/20 text-white font-bold'
                  : 'border-slate-800 bg-slate-950 text-slate-400'
              }`}
            >
              <span className="block font-bold">Advanced Workspace</span>
              <span className="text-[11px] text-slate-400">Full quant metrics, order books, technical depth</span>
            </div>
          </div>
        </div>

        {/* Currency & Regulation */}
        <div className="border-t border-slate-800 pt-5 space-y-2">
          <h3 className="font-bold text-sm text-white">Regulatory Jurisdictions</h3>
          <p className="text-slate-400 leading-relaxed">
            Market: <strong>India (NSE / BSE)</strong> | Base Currency: <strong>Indian Rupee (INR ₹)</strong> | Statutory Tax: <strong>SEBI / Income Tax Department STT Compliant</strong>
          </p>
        </div>
      </div>
    </div>
  );
}
