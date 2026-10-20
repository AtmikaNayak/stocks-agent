import React from 'react';
import { cn } from '@/lib/utils';

type Tone = 'neutral' | 'brand' | 'up' | 'down' | 'gold' | 'violet';

const TONES: Record<Tone, string> = {
  neutral: 'border-white/10 bg-white/[0.05] text-ink-2',
  brand: 'border-[rgba(91,140,255,0.28)] bg-[rgba(91,140,255,0.12)] text-[#bcd0ff]',
  up: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300',
  down: 'border-rose-400/25 bg-rose-400/10 text-rose-300',
  gold: 'border-[rgba(240,183,117,0.28)] bg-[rgba(240,183,117,0.11)] text-[#f3cb9b]',
  violet: 'border-violet-400/25 bg-violet-400/10 text-violet-300',
};

export function Pill({
  tone = 'neutral',
  className,
  children,
  dot,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none',
        TONES[tone],
        className
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export default Pill;
