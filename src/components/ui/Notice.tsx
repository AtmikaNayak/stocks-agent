import React from 'react';
import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

type Tone = 'info' | 'demo' | 'warn' | 'danger' | 'success';

const TONES: Record<Tone, { wrap: string; icon: React.ReactNode }> = {
  info: {
    wrap: 'border-[rgba(91,140,255,0.26)] bg-[rgba(91,140,255,0.08)] text-[#c3d5ff]',
    icon: <Info className="h-4 w-4 text-[#8fb0ff]" />,
  },
  demo: {
    wrap: 'border-white/[0.09] bg-white/[0.035] text-ink-2',
    icon: <Info className="h-4 w-4 text-ink-3" />,
  },
  warn: {
    wrap: 'border-[rgba(240,183,117,0.3)] bg-[rgba(240,183,117,0.09)] text-[#f2d5b3]',
    icon: <AlertTriangle className="h-4 w-4 text-[#f0b775]" />,
  },
  danger: {
    wrap: 'border-rose-400/30 bg-rose-500/10 text-rose-100',
    icon: <ShieldAlert className="h-4 w-4 text-rose-300" />,
  },
  success: {
    wrap: 'border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-100',
    icon: <CheckCircle2 className="h-4 w-4 text-emerald-300" />,
  },
};

export function Notice({
  tone = 'info',
  title,
  children,
  action,
  className,
}: {
  tone?: Tone;
  title?: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const config = TONES[tone];
  return (
    <div className={cn('flex items-start gap-3 rounded-2xl border px-4 py-3', config.wrap, className)}>
      <span className="mt-0.5 shrink-0">{config.icon}</span>
      <div className="min-w-0 flex-1 text-xs leading-relaxed">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && 'mt-0.5', 'opacity-90')}>{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}

export default Notice;
