'use client';
import React from 'react';
import {
  ShieldAlert,
  HelpCircle,
  PlusCircle,
  Sparkles,
  Menu,
  Lock,
  Info,
  LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui';

interface Props {
  userName?: string;
  onSignOut?: () => void;
  activePortfolioType: 'REAL' | 'VIRTUAL';
  onTogglePortfolioType: (type: 'REAL' | 'VIRTUAL') => void;
  experienceMode: 'BEGINNER' | 'ADVANCED';
  onToggleExperienceMode: (mode: 'BEGINNER' | 'ADVANCED') => void;
  emergencyStopEnabled: boolean;
  onOpenEmergencyStop: () => void;
  onOpenOrderModal: () => void;
  onOpenProposalModal: () => void;
  onOpenGlossaryModal: () => void;
  onOpenMobileNav?: () => void;
  marketSession: {
    isOpen: boolean;
    session: string;
    currentTimeIST: string;
  };
}

export default function Navbar({
  userName,
  onSignOut,
  activePortfolioType,
  onTogglePortfolioType,
  experienceMode,
  onToggleExperienceMode,
  emergencyStopEnabled,
  onOpenEmergencyStop,
  onOpenOrderModal,
  onOpenProposalModal,
  onOpenGlossaryModal,
  onOpenMobileNav,
  marketSession,
}: Props) {
  const isPractice = activePortfolioType === 'VIRTUAL';

  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#070a12]/85 backdrop-blur-xl">
      {/*
        One honest status line. The previous build claimed "verified NSE market data",
        which is not true — every price here comes from seeded demo fixtures.
      */}
      {isPractice ? (
        <div className="flex items-center justify-center gap-2 border-b border-white/[0.05] bg-white/[0.025] px-4 py-1.5 text-center text-[11px] text-ink-3">
          <Info className="h-3.5 w-3.5 shrink-0 text-[#8fb0ff]" />
          <span>
            <span className="font-semibold text-[#bcd0ff]">Practice mode.</span>{' '}
            <span className="hidden sm:inline">Simulated money and demo prices — no real orders can be placed.</span>
            <span className="sm:hidden">Simulated money, demo prices.</span>
          </span>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-2 border-b border-[rgba(240,183,117,0.22)] bg-[rgba(240,183,117,0.08)] px-4 py-1.5 text-center text-[11px] text-[#f2d5b3]">
          <Lock className="h-3.5 w-3.5 shrink-0 text-[#f0b775]" />
          <span>
            <span className="font-semibold">Real account — read-only.</span>{' '}
            <span className="hidden sm:inline">
              No broker is connected in this build, so figures are stored records and ordering is disabled.
            </span>
            <span className="sm:hidden">Broker connection and ordering are disabled.</span>
          </span>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 px-3 py-2.5 sm:px-5">
        {/* Left: which purse am I looking at? */}
        <div className="flex min-w-0 items-center gap-2">
          <button
            onClick={onOpenMobileNav}
            className="rounded-lg border border-white/[0.08] p-2 text-ink-2 hover:bg-white/[0.06] hover:text-ink lg:hidden"
            aria-label="Open navigation"
          >
            <Menu className="h-4 w-4" />
          </button>

          <div className="segmented" role="tablist" aria-label="Choose account">
            <button
              role="tab"
              aria-selected={isPractice}
              data-active={isPractice}
              onClick={() => onTogglePortfolioType('VIRTUAL')}
              className="segmented-item"
            >
              <span className="sm:hidden">Practice</span>
              <span className="hidden sm:inline">Practice money</span>
            </button>
            <button
              role="tab"
              aria-selected={!isPractice}
              data-active={!isPractice}
              onClick={() => onTogglePortfolioType('REAL')}
              className="segmented-item"
            >
              <span className="sm:hidden">Real</span>
              <span className="hidden sm:inline">Real account</span>
            </button>
          </div>

          <div className="hidden items-center gap-2 rounded-xl border border-white/[0.07] bg-black/20 px-2.5 py-1.5 text-[11px] text-ink-3 xl:flex">
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                marketSession.isOpen ? 'bg-emerald-400' : 'bg-rose-400'
              )}
            />
            <span className="text-ink-2">NSE {marketSession.session.replace('_', ' ').toLowerCase()}</span>
            <span className="text-ink-3/60">·</span>
            <span className="num">{marketSession.currentTimeIST}</span>
          </div>
        </div>

        {/* Right: actions, ordered by how often a beginner needs them */}
        <div className="flex items-center gap-2">
          <div className="segmented hidden sm:inline-flex" aria-label="Detail level">
            <button
              data-active={experienceMode === 'BEGINNER'}
              onClick={() => onToggleExperienceMode('BEGINNER')}
              className="segmented-item"
              title="Plain language and guided steps"
            >
              Simple
            </button>
            <button
              data-active={experienceMode === 'ADVANCED'}
              onClick={() => onToggleExperienceMode('ADVANCED')}
              className="segmented-item"
              title="Show advanced metrics and tools"
            >
              Detailed
            </button>
          </div>

          <button
            onClick={onOpenGlossaryModal}
            className="rounded-xl border border-white/[0.08] p-2 text-ink-2 transition-colors hover:bg-white/[0.06] hover:text-ink"
            title="Plain-English glossary"
            aria-label="Open plain-English glossary"
          >
            <HelpCircle className="h-[17px] w-[17px]" />
          </button>

          <Button
            variant="ai"
            size="md"
            className="hidden md:inline-flex"
            icon={<Sparkles className="h-3.5 w-3.5" />}
            onClick={onOpenProposalModal}
          >
            Get an AI idea
          </Button>

          <Button
            variant="primary"
            size="md"
            icon={<PlusCircle className="h-4 w-4" />}
            onClick={onOpenOrderModal}
          >
            <span className="hidden sm:inline">Practise a trade</span>
            <span className="sm:hidden">Trade</span>
          </Button>

          {onSignOut && (
            <button
              onClick={onSignOut}
              className="flex items-center gap-1.5 rounded-xl border border-white/[0.08] px-2.5 py-2 text-[12px] font-medium text-ink-2 transition-colors hover:bg-white/[0.06] hover:text-ink"
              title={userName ? `Signed in as ${userName} — sign out` : 'Sign out'}
              aria-label="Sign out"
            >
              <LogOut className="h-[17px] w-[17px]" />
              <span className="hidden xl:inline">Sign out</span>
            </button>
          )}

          <button
            onClick={onOpenEmergencyStop}
            className={cn(
              'flex items-center gap-1.5 rounded-xl border px-2.5 py-2 text-[12px] font-semibold transition-colors',
              emergencyStopEnabled
                ? 'border-rose-400/50 bg-rose-500/25 text-rose-100'
                : 'border-rose-400/20 bg-rose-500/[0.07] text-rose-300 hover:bg-rose-500/15'
            )}
            title="Emergency stop — pause all automated activity"
          >
            <ShieldAlert className="h-[17px] w-[17px]" />
            <span className="hidden lg:inline">{emergencyStopEnabled ? 'Halted' : 'Stop all'}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
