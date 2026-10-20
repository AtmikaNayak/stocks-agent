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
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-white/[0.06] text-ink-2">
            <Settings className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Settings</h1>
            <p className="text-xs text-ink-2">
              Choose how much detail you see, and review your regional and cost assumptions.
            </p>
          </div>
        </div>
      </div>

      <div className="card p-6 space-y-6 text-xs">
        {/* User Profile */}
        <div className="space-y-3">
          <h3 className="font-bold text-sm text-white flex items-center gap-2">
            <User className="h-4 w-4 text-blue-400" />
            Investor Profile
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-ink-2 mb-1">Full Name</label>
              <input
                type="text"
                disabled
                value="Rajesh K. Verma"
                className="w-full rounded-lg border border-white/[0.08] bg-black/30 p-2 text-ink-2"
              />
            </div>
            <div>
              <label className="block text-ink-2 mb-1">Account Email</label>
              <input
                type="text"
                disabled
                value="investor@investpilot.ai"
                className="w-full rounded-lg border border-white/[0.08] bg-black/30 p-2 text-ink-2"
              />
            </div>
          </div>
        </div>

        {/* Experience Mode Toggle */}
        <div className="border-t border-white/[0.08] pt-5 space-y-3">
          <h3 className="font-bold text-sm text-white">How much detail to show</h3>
          <div className="grid grid-cols-2 gap-3">
            <div
              onClick={() => onToggleExperienceMode('BEGINNER')}
              className={`p-3 rounded-lg border cursor-pointer transition ${
                experienceMode === 'BEGINNER'
                  ? 'border-indigo-500 bg-indigo-950/20 text-white font-bold'
                  : 'border-white/[0.08] bg-black/30 text-ink-2'
              }`}
            >
              <span className="block font-bold">Simple view</span>
              <span className="text-[11px] text-ink-2">Plain language, guided steps and the glossary</span>
            </div>
            <div
              onClick={() => onToggleExperienceMode('ADVANCED')}
              className={`p-3 rounded-lg border cursor-pointer transition ${
                experienceMode === 'ADVANCED'
                  ? 'border-indigo-500 bg-indigo-950/20 text-white font-bold'
                  : 'border-white/[0.08] bg-black/30 text-ink-2'
              }`}
            >
              <span className="block font-bold">Detailed view</span>
              <span className="text-[11px] text-ink-2">More metrics, charts and the full toolset</span>
            </div>
          </div>
        </div>

        {/* Currency & Regulation */}
        <div className="border-t border-white/[0.08] pt-5 space-y-2">
          <h3 className="font-bold text-sm text-white">Regulatory Jurisdictions</h3>
          <p className="text-ink-2 leading-relaxed">
            Market scope: <strong>India (NSE / BSE)</strong> | Base currency: <strong>Indian Rupee (INR ₹)</strong> | Cost assumptions: <strong>illustrative estimates, not broker-confirmed charges</strong>
          </p>
        </div>
      </div>
    </div>
  );
}
