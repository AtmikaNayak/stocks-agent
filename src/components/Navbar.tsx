'use client';
import React from 'react';
import {
  ShieldAlert,
  HelpCircle,
  PlusCircle,
  Sparkles,
  Clock,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';

interface Props {
  activePortfolioType: 'REAL' | 'VIRTUAL';
  onTogglePortfolioType: (type: 'REAL' | 'VIRTUAL') => void;
  experienceMode: 'BEGINNER' | 'ADVANCED';
  onToggleExperienceMode: (mode: 'BEGINNER' | 'ADVANCED') => void;
  emergencyStopEnabled: boolean;
  onOpenEmergencyStop: () => void;
  onOpenOrderModal: () => void;
  onOpenProposalModal: () => void;
  onOpenGlossaryModal: () => void;
  marketSession: {
    isOpen: boolean;
    session: string;
    currentTimeIST: string;
  };
}

export default function Navbar({
  activePortfolioType,
  onTogglePortfolioType,
  experienceMode,
  onToggleExperienceMode,
  emergencyStopEnabled,
  onOpenEmergencyStop,
  onOpenOrderModal,
  onOpenProposalModal,
  onOpenGlossaryModal,
  marketSession
}: Props) {
  return (
    <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-30">
      {/* High-visibility Environment Warning Banner for Real Demat */}
      {activePortfolioType === 'REAL' ? (
        <div className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-1.5 flex items-center justify-between text-xs text-amber-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
            <span>
              <strong>REAL-MONEY ENVIRONMENT ACTIVE:</strong> Orders submitted here route to your official Demat broker. Real capital is at risk. Automated execution requires explicit multi-factor authorization.
            </span>
          </div>
          <span className="font-mono text-[11px] bg-amber-500/20 px-2 py-0.5 rounded text-amber-300 font-semibold">
            STRICT ISOLATION
          </span>
        </div>
      ) : (
        <div className="bg-blue-500/10 border-b border-blue-500/20 px-4 py-1 flex items-center justify-between text-[11px] text-blue-300">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-blue-400 shrink-0" />
            <span>
              <strong>VIRTUAL SANDBOX ACTIVE:</strong> Initial capital ₹25,000. Uses verified NSE market data and statutory Indian charges simulation.
            </span>
          </div>
          <span className="text-[10px] text-blue-400">Zero Real Capital Risk</span>
        </div>
      )}

      <div className="px-6 py-2.5 flex items-center justify-between gap-4">
        {/* Left: Environment Switcher Tabs */}
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-slate-700 bg-slate-950 p-1 text-xs font-semibold">
            <button
              onClick={() => onTogglePortfolioType('VIRTUAL')}
              className={`px-3 py-1 rounded transition ${
                activePortfolioType === 'VIRTUAL'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Virtual Simulator (₹25k)
            </button>
            <button
              onClick={() => onTogglePortfolioType('REAL')}
              className={`px-3 py-1 rounded transition ${
                activePortfolioType === 'REAL'
                  ? 'bg-amber-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Real Demat Account
            </button>
          </div>

          {/* NSE Market Hours indicator */}
          <div className="hidden lg:flex items-center gap-1.5 text-xs text-slate-400 border border-slate-800 rounded-lg px-2.5 py-1 bg-slate-950/60">
            <Clock className="h-3.5 w-3.5 text-slate-400" />
            <span className="font-mono text-[11px] text-slate-300">{marketSession.currentTimeIST}</span>
            <span
              className={`h-2 w-2 rounded-full ml-1 ${
                marketSession.isOpen ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
              }`}
            />
            <span className="text-[11px] font-medium text-slate-300">
              NSE {marketSession.session}
            </span>
          </div>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-2.5">
          {/* Beginner vs Advanced Mode Toggle */}
          <div className="flex rounded-lg border border-slate-700 bg-slate-950 p-0.5 text-xs font-medium">
            <button
              onClick={() => onToggleExperienceMode('BEGINNER')}
              className={`px-2.5 py-1 rounded transition text-xs ${
                experienceMode === 'BEGINNER'
                  ? 'bg-indigo-600 text-white font-semibold shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Beginner
            </button>
            <button
              onClick={() => onToggleExperienceMode('ADVANCED')}
              className={`px-2.5 py-1 rounded transition text-xs ${
                experienceMode === 'ADVANCED'
                  ? 'bg-slate-700 text-white font-semibold shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Advanced
            </button>
          </div>

          {/* Glossary Modal Button for Beginners */}
          {experienceMode === 'BEGINNER' && (
            <button
              onClick={onOpenGlossaryModal}
              className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition"
              title="Financial Terms Glossary"
            >
              <HelpCircle className="h-3.5 w-3.5 text-blue-400" />
              <span className="hidden sm:inline">Glossary</span>
            </button>
          )}

          {/* Ask AI Copilot */}
          <button
            onClick={onOpenProposalModal}
            className="flex items-center gap-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">AI Proposal</span>
          </button>

          {/* Place Order */}
          <button
            onClick={onOpenOrderModal}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition"
          >
            <PlusCircle className="h-3.5 w-3.5" />
            <span>New Order</span>
          </button>

          {/* Emergency Stop Kill Switch Button */}
          <button
            onClick={onOpenEmergencyStop}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition shadow ${
              emergencyStopEnabled
                ? 'bg-red-600 text-white animate-pulse'
                : 'border border-red-500/40 bg-red-950/40 text-red-300 hover:bg-red-900/60'
            }`}
            title="Emergency Stop Kill Switch"
          >
            <ShieldAlert className="h-3.5 w-3.5 text-red-400" />
            <span className="hidden md:inline">
              {emergencyStopEnabled ? 'HALTED' : 'KILL SWITCH'}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
