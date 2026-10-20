import React from 'react';
import { cn } from '@/lib/utils';

export function PageHeader({
  title,
  subtitle,
  eyebrow,
  icon,
  actions,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  eyebrow?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('page-header', className)}>
      <div className="flex min-w-0 items-start gap-3.5">
        {icon && (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.045] text-brand">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          {eyebrow && <p className="eyebrow mb-1.5">{eyebrow}</p>}
          <h1 className="display text-[21px] leading-tight text-ink sm:text-[23px]">{title}</h1>
          {subtitle && (
            <p className="mt-1.5 max-w-2xl text-[12.5px] leading-relaxed text-ink-2">{subtitle}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div>}
    </header>
  );
}

export default PageHeader;
