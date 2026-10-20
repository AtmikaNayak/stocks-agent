'use client';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GLOSSARY } from '@/lib/glossary';
import { Pill } from '@/components/ui';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const CATEGORIES = ['All', 'Basics', 'Company health', 'Costs', 'Risk'] as const;

const CATEGORY_TONE = {
  Basics: 'brand',
  'Company health': 'up',
  Costs: 'violet',
  Risk: 'gold',
} as const;

export default function GlossaryModal({ isOpen, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('All');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(timer);
    };
  }, [isOpen, onClose]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return GLOSSARY.filter((entry) => {
      const inCategory = category === 'All' || entry.category === category;
      if (!inCategory) return false;
      if (!q) return true;
      return (
        entry.term.toLowerCase().includes(q) ||
        entry.oneLiner.toLowerCase().includes(q) ||
        entry.whyItMatters.toLowerCase().includes(q) ||
        (entry.alsoKnownAs?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [query, category]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="glossary-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-white/[0.08] bg-[#0c111c] shadow-2xl sm:max-h-[86vh] sm:rounded-3xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-white/[0.07] px-5 pb-4 pt-5 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[rgba(240,183,117,0.25)] bg-[rgba(240,183,117,0.1)] text-gold">
                <BookOpen className="h-5 w-5" />
              </span>
              <div>
                <p className="eyebrow mb-1">Plain English</p>
                <h2 id="glossary-title" className="display text-lg leading-tight text-ink">
                  Every term, explained simply
                </h2>
                <p className="mt-1 text-[11.5px] text-ink-3">
                  No finance degree required. Search for a word you saw on screen.
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-ink-3 transition-colors hover:bg-white/[0.06] hover:text-ink"
              aria-label="Close glossary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="relative mt-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Try “P/E”, “STT” or “drawdown”"
              className="input-field pl-9"
              aria-label="Search financial terms"
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {CATEGORIES.map((item) => (
              <button
                key={item}
                onClick={() => setCategory(item)}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                  category === item
                    ? 'border-[rgba(91,140,255,0.35)] bg-[rgba(91,140,255,0.14)] text-[#c3d5ff]'
                    : 'border-white/[0.08] text-ink-3 hover:border-white/[0.16] hover:text-ink-2'
                )}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 space-y-2.5 overflow-y-auto px-5 py-4 sm:px-6">
          {results.length === 0 ? (
            <p className="py-10 text-center text-xs text-ink-3">
              Nothing matched “{query}”. Try a shorter word.
            </p>
          ) : (
            results.map((entry) => (
              <article
                key={entry.term}
                className="rounded-2xl border border-white/[0.07] bg-white/[0.025] px-4 py-3.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-[13px] font-semibold text-ink">
                    {entry.term}
                    {entry.alsoKnownAs && (
                      <span className="ml-1.5 text-[10.5px] font-normal text-ink-3">({entry.alsoKnownAs})</span>
                    )}
                  </h3>
                  <Pill tone={CATEGORY_TONE[entry.category]}>{entry.category}</Pill>
                </div>
                <p className="mt-1.5 text-[12px] leading-relaxed text-ink-2">{entry.oneLiner}</p>
                <p className="mt-1.5 text-[11px] leading-relaxed text-ink-3">
                  <span className="font-semibold text-ink-3">Why it matters: </span>
                  {entry.whyItMatters}
                </p>
              </article>
            ))
          )}
        </div>

        <div className="flex items-center justify-between border-t border-white/[0.07] px-5 py-3 sm:px-6">
          <p className="text-[10.5px] text-ink-3">{results.length} terms shown</p>
          <button
            onClick={onClose}
            className="rounded-xl bg-[#5b8cff] px-4 py-2 text-[12px] font-semibold text-[#05101f] transition-colors hover:bg-[#7ea6ff]"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
