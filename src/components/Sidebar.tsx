'use client';
import React, { useEffect, useState } from 'react';
import { ChevronDown, Lock, ShieldCheck, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatINR } from '@/lib/format';
import { ADVANCED_NAV, PRIMARY_NAV, type NavItem, type ViewType } from '@/lib/navigation';

export type { ViewType };

interface Props {
  currentView: ViewType;
  onSelectView: (view: ViewType) => void;
  activePortfolioType: 'REAL' | 'VIRTUAL';
  experienceMode: 'BEGINNER' | 'ADVANCED';
  /** Current practice-portfolio value, shown in the sidebar context card. */
  practiceValue?: number;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

function NavButton({
  item,
  active,
  showHint,
  onSelect,
}: {
  item: NavItem;
  active: boolean;
  showHint: boolean;
  onSelect: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      onClick={onSelect}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors',
        active
          ? 'bg-[rgba(91,140,255,0.13)] text-ink'
          : 'text-ink-2 hover:bg-white/[0.045] hover:text-ink'
      )}
    >
      <span
        className={cn(
          'absolute left-0 top-1/2 h-5 w-[2.5px] -translate-y-1/2 rounded-full transition-opacity',
          active ? 'bg-brand opacity-100' : 'opacity-0'
        )}
      />
      <Icon
        className={cn(
          'h-[17px] w-[17px] shrink-0 transition-colors',
          active ? 'text-brand' : 'text-ink-3 group-hover:text-ink-2'
        )}
        strokeWidth={1.9}
      />
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-[13px] leading-5', active ? 'font-semibold' : 'font-medium')}>
          {item.label}
        </span>
        {showHint && (
          <span className="mt-0.5 block truncate text-[10.5px] leading-4 text-ink-3">{item.hint}</span>
        )}
      </span>
    </button>
  );
}

export default function Sidebar({
  currentView,
  onSelectView,
  activePortfolioType,
  experienceMode,
  practiceValue,
  mobileOpen = false,
  onCloseMobile,
}: Props) {
  const isAdvancedView = ADVANCED_NAV.some((group) => group.items.some((i) => i.id === currentView));
  const [toolsOpen, setToolsOpen] = useState(isAdvancedView || experienceMode === 'ADVANCED');

  // Keep the advanced group open when the user lands on an advanced page,
  // or switches the whole app to the detailed view.
  useEffect(() => {
    if (isAdvancedView || experienceMode === 'ADVANCED') setToolsOpen(true);
  }, [isAdvancedView, experienceMode]);

  const handleSelect = (view: ViewType) => {
    onSelectView(view);
    onCloseMobile?.();
  };

  return (
    <>
      {/* Dim the page behind the mobile drawer */}
      <div
        onClick={onCloseMobile}
        className={cn(
          'fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity lg:hidden',
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
        aria-hidden="true"
      />

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[266px] shrink-0 flex-col border-r border-white/[0.07] bg-[#080c15]/95 backdrop-blur-xl transition-transform duration-300 lg:sticky lg:top-0 lg:z-20 lg:h-screen lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Brand */}
        <div className="flex items-center gap-3 px-4 pb-4 pt-5">
          <div className="brand-glyph flex h-9 w-9 items-center justify-center rounded-[13px]">
            <Sparkles className="h-[18px] w-[18px] text-white" strokeWidth={2.2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="display text-[16px] leading-none text-ink">InvestPilot</p>
            <p className="mt-1 text-[10.5px] font-medium tracking-wide text-ink-3">Practice investing · India</p>
          </div>
          <button
            onClick={onCloseMobile}
            className="rounded-lg p-1.5 text-ink-3 hover:bg-white/[0.06] hover:text-ink lg:hidden"
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* What am I looking at? — one clear context card */}
        <div className="mx-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-3">You are viewing</span>
            <span
              className={cn(
                'rounded-full px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider',
                activePortfolioType === 'VIRTUAL'
                  ? 'bg-[rgba(91,140,255,0.16)] text-[#bcd0ff]'
                  : 'bg-[rgba(240,183,117,0.16)] text-[#f3cb9b]'
              )}
            >
              {activePortfolioType === 'VIRTUAL' ? 'Practice' : 'Real'}
            </span>
          </div>
          <p className="mt-1.5 text-[12px] font-semibold text-ink">
            {activePortfolioType === 'VIRTUAL' ? 'Practice portfolio' : 'Real account (read-only)'}
          </p>
          <p className="num mt-0.5 text-[11px] text-ink-3">
            {activePortfolioType === 'VIRTUAL'
              ? practiceValue !== undefined
                ? `${formatINR(practiceValue)} simulated`
                : '₹25,000 simulated'
              : 'No broker connected'}
          </p>
        </div>

        {/* Everyday navigation */}
        <nav className="mt-4 flex-1 overflow-y-auto px-2.5 pb-4">
          <p className="px-2.5 pb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-3">Everyday</p>
          <div className="space-y-0.5">
            {PRIMARY_NAV.map((item) => (
              <NavButton
                key={item.id}
                item={item}
                active={currentView === item.id}
                showHint={true}
                onSelect={() => handleSelect(item.id)}
              />
            ))}
          </div>

          {/* Advanced tools, collapsed by default for beginners */}
          <button
            onClick={() => setToolsOpen((open) => !open)}
            aria-expanded={toolsOpen}
            className="mt-4 flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-3 transition-colors hover:text-ink-2"
          >
            <span>More tools</span>
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', toolsOpen && 'rotate-180')} />
          </button>

          <div
            className={cn(
              'grid transition-all duration-300',
              toolsOpen ? 'mt-1 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
            )}
          >
            <div className="min-h-0 overflow-hidden" inert={!toolsOpen}>
              {ADVANCED_NAV.map((group) => (
                <div key={group.group} className="mb-3">
                  <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold text-ink-3/70">{group.group}</p>
                  <div className="space-y-0.5">
                    {group.items.map((item) => (
                      <NavButton
                        key={item.id}
                        item={item}
                        active={currentView === item.id}
                        showHint={false}
                        onSelect={() => handleSelect(item.id)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </nav>

        {/* Footer: honest safety status, not a fake compliance badge */}
        <div className="border-t border-white/[0.06] px-4 py-3">
          <div className="flex items-center gap-2 text-[11px] text-ink-3">
            <Lock className="h-3.5 w-3.5 text-ink-3" />
            <span>Real-money trading is off</span>
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[10.5px] text-ink-3/80">
            <span className="inline-flex items-center gap-1">
              <ShieldCheck className="h-3 w-3 text-emerald-400/80" /> Safety limits always on
            </span>
            <span className="rounded border border-white/[0.08] px-1 py-0.5 font-mono">v2.0</span>
          </div>
        </div>
      </aside>
    </>
  );
}
