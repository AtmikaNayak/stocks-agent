import React from 'react';
import { cn } from '@/lib/utils';

export function Progress({
  value,
  tone = 'brand',
  className,
  label,
}: {
  value: number;
  /** 0–100 */
  tone?: 'brand' | 'up' | 'down' | 'gold';
  className?: string;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const fill = {
    brand: 'bg-[#5b8cff]',
    up: 'bg-emerald-400',
    down: 'bg-rose-400',
    gold: 'bg-[#f0b775]',
  }[tone];

  return (
    <div
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]', className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className={cn('h-full rounded-full transition-[width] duration-500', fill)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default Progress;
