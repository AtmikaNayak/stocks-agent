import React from 'react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'ai' | 'danger' | 'gold';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-[#5b8cff] text-[#05101f] hover:bg-[#7ea6ff] shadow-[0_12px_26px_-14px_rgba(91,140,255,0.9)]',
  secondary:
    'border border-white/10 bg-white/[0.045] text-ink hover:bg-white/[0.085] hover:border-white/20',
  ghost: 'text-ink-2 hover:text-ink hover:bg-white/[0.06]',
  ai: 'border border-[rgba(167,139,250,0.32)] bg-[rgba(124,107,255,0.13)] text-[#d4c9ff] hover:bg-[rgba(124,107,255,0.22)]',
  danger:
    'border border-rose-400/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20',
  gold: 'border border-[rgba(240,183,117,0.35)] bg-[rgba(240,183,117,0.12)] text-[#f3cb9b] hover:bg-[rgba(240,183,117,0.2)]',
};

const SIZES: Record<Size, string> = {
  sm: 'px-2.5 py-1.5 text-[12px] rounded-lg gap-1.5',
  md: 'px-3.5 py-2 text-[13px] rounded-xl gap-2',
  lg: 'px-4 py-2.5 text-sm rounded-xl gap-2',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  iconRight,
  className,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center font-semibold transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...props}
    >
      {icon}
      {children}
      {iconRight}
    </button>
  );
}

export default Button;
