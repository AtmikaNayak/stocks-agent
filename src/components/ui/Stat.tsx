import React from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatPct, toneClass, toneFor } from '@/lib/format';

export function Stat({
  label,
  value,
  hint,
  deltaPct,
  icon,
  className,
  emphasis,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  deltaPct?: number | null;
  icon?: React.ReactNode;
  className?: string;
  emphasis?: boolean;
}) {
  const tone = toneFor(deltaPct ?? 0);
  const DeltaIcon = tone === 'up' ? ArrowUpRight : tone === 'down' ? ArrowDownRight : Minus;

  return (
    <div className={cn('card px-4 py-3.5', className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11.5px] font-medium text-ink-3">{label}</p>
        {icon && <span className="text-ink-3">{icon}</span>}
      </div>
      <p
        className={cn(
          'num mt-1.5 font-semibold tracking-tight text-ink',
          emphasis ? 'text-[26px] leading-none' : 'text-[22px] leading-none'
        )}
      >
        {value}
      </p>
      <div className="mt-2 flex items-center gap-1.5 text-[11.5px]">
        {typeof deltaPct === 'number' && (
          <span className={cn('inline-flex items-center gap-0.5 font-semibold', toneClass(tone))}>
            <DeltaIcon className="h-3 w-3" />
            {formatPct(deltaPct)}
          </span>
        )}
        {hint && <span className="text-ink-3">{hint}</span>}
      </div>
    </div>
  );
}

export default Stat;
