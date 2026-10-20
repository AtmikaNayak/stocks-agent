'use client';
import React from 'react';
import { AlertTriangle, PauseCircle, ShieldCheck, Sliders, Wallet, PieChart, Target } from 'lucide-react';
import { Button, Card, CardHeader, Notice, PageHeader, Progress } from '@/components/ui';

interface Props {
  portfolio: any;
  permissions: any;
  onSelectView: (view: any) => void;
  onOpenEmergencyStop: () => void;
}

const RULES = [
  {
    title: 'Daily loss limit',
    detail: 'New orders pause for the day once you are down this much.',
    value: '₹1,500',
  },
  {
    title: 'Worst-case drawdown',
    detail: 'If the portfolio falls this far from its high point, trading stops.',
    value: '10%',
  },
  {
    title: 'Biggest single order',
    detail: 'A single order above this amount is rejected as a typo risk.',
    value: '₹10,000',
  },
  {
    title: 'Orders per day',
    detail: 'A cap that prevents runaway automated trading loops.',
    value: '10 orders',
  },
  {
    title: 'Trading hours',
    detail: 'Practice orders follow the NSE session. Real trading is off entirely.',
    value: '09:20–15:15 IST',
  },
  {
    title: 'Real-money lock',
    detail: 'A server-side check blocks any real order — there is no broker adapter.',
    value: 'On',
  },
];

export default function RiskView({ portfolio, permissions, onSelectView, onOpenEmergencyStop }: Props) {
  const totalValue = portfolio?.total_value || 25000;
  const cashReservePct = totalValue > 0 ? ((portfolio?.current_cash || 0) / totalValue) * 100 : 100;
  const exposurePct = totalValue > 0 ? ((portfolio?.invested_value || 0) / totalValue) * 100 : 0;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Guardrails"
        title="Safety & limits"
        subtitle="Fixed rules that apply to every order — yours or the AI’s. They are plain arithmetic, so they cannot be talked around."
        icon={<ShieldCheck className="h-5 w-5" />}
        actions={
          <Button variant="danger" icon={<PauseCircle className="h-4 w-4" />} onClick={onOpenEmergencyStop}>
            Pause everything
          </Button>
        }
      />

      <Notice tone="success" title="These rules are not suggestions">
        The risk engine is separate from the AI. A suggestion that breaks any limit below is rejected before it can
        become an order, and the reason is written into your decision journal.
      </Notice>

      {/* Three live gauges */}
      <div className="grid gap-3 md:grid-cols-3">
        <Card className="p-5">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2 text-[12.5px] font-semibold text-ink">
              <Wallet className="h-4 w-4 text-brand" />
              Cash you always keep
            </div>
            <span className="num text-[11px] font-semibold text-ink-3">target ≥ 20%</span>
          </div>
          <p className="num mt-2 text-[28px] font-semibold leading-none text-ink">{cashReservePct.toFixed(1)}%</p>
          <Progress className="mt-3" value={cashReservePct} tone={cashReservePct >= 20 ? 'up' : 'down'} label="Cash cushion" />
          <p className="mt-2.5 text-[11px] leading-relaxed text-ink-3">
            A cushion means you never have to sell at a bad moment for a small emergency.
          </p>
        </Card>

        <Card className="p-5">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2 text-[12.5px] font-semibold text-ink">
              <PieChart className="h-4 w-4 text-brand" />
              Money put to work
            </div>
            <span className="num text-[11px] font-semibold text-ink-3">ceiling ≤ 80%</span>
          </div>
          <p className="num mt-2 text-[28px] font-semibold leading-none text-ink">{exposurePct.toFixed(1)}%</p>
          <Progress className="mt-3" value={exposurePct} tone={exposurePct <= 80 ? 'up' : 'down'} label="Invested share" />
          <p className="mt-2.5 text-[11px] leading-relaxed text-ink-3">
            Limiting how much is invested softens the blow when the whole market falls.
          </p>
        </Card>

        <Card className="p-5">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2 text-[12.5px] font-semibold text-ink">
              <Target className="h-4 w-4 text-brand" />
              Most in one company
            </div>
            <span className="num text-[11px] font-semibold text-ink-3">cap ≤ 15%</span>
          </div>
          <p className="num mt-2 text-[28px] font-semibold leading-none text-ink">15.0%</p>
          <Progress className="mt-3" value={15} tone="gold" label="Single-share cap" />
          <p className="mt-2.5 text-[11px] leading-relaxed text-ink-3">
            No single share can put more than 15% of your money at risk, however convincing the story sounds.
          </p>
        </Card>
      </div>

      {/* Rules */}
      <Card className="p-5">
        <CardHeader
          icon={<AlertTriangle className="h-4 w-4" />}
          title="Every rule, in one place"
          subtitle="Values are enforced by the app, not by the AI model."
        />
        <div className="mt-4 grid gap-2.5 md:grid-cols-2">
          {RULES.map((rule) => (
            <div
              key={rule.title}
              className="flex items-start justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-3"
            >
              <div className="min-w-0">
                <p className="text-[12.5px] font-semibold text-ink">{rule.title}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-ink-3">{rule.detail}</p>
              </div>
              <span className="num shrink-0 rounded-lg border border-white/[0.08] bg-black/20 px-2 py-1 text-[11px] font-semibold text-ink-2">
                {rule.value}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-3">
          <p className="text-[11px] text-ink-3">
            Current automation level: <span className="font-semibold text-ink-2">{permissions?.[0]?.control_mode ?? 'Copilot'}</span>
          </p>
          <Button
            variant="ghost"
            size="sm"
            icon={<Sliders className="h-3.5 w-3.5" />}
            onClick={() => onSelectView('permissions')}
          >
            Automation controls
          </Button>
        </div>
      </Card>
    </div>
  );
}
