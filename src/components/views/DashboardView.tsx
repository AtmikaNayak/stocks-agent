'use client';
import React from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Briefcase,
  Check,
  CircleDollarSign,
  GraduationCap,
  Lightbulb,
  PlusCircle,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  formatINR,
  formatPct,
  greeting,
  toNumber,
  todayLongIST,
  toneClass,
  toneFor,
  titleCase,
} from '@/lib/format';
import { Button, Card, CardHeader, EmptyState, Notice, Pill, Stat } from '@/components/ui';

interface Props {
  data: {
    portfolios: any[];
    positions: any[];
    quotes: any[];
    observations: any[];
    proposals: any[];
    settings: any;
  };
  activePortfolioType: 'REAL' | 'VIRTUAL';
  onSelectView: (view: any) => void;
  onOpenOrderModal: (asset?: any) => void;
  onOpenProposalModal: () => void;
  /** Jump to research for a specific company (falls back to opening research). */
  onSelectAsset?: (symbol: string) => void;
  experienceMode: 'BEGINNER' | 'ADVANCED';
}

/** Turns agent jargon into ordinary sentences. */
const OBSERVATION_TITLES: Record<string, string> = {
  VALUATION_DISCOUNT: 'Looks cheaper than usual',
  VALUATION_PREMIUM: 'Looks pricier than usual',
  QUALITY_COMPOUNDER: 'A steady, profitable business',
  MOMENTUM_BREAKOUT: 'Price trend is turning up',
  MOMENTUM_WEAKNESS: 'Price trend is weakening',
  DEBT_REDUCTION: 'Borrowings are coming down',
  RISING_DEBT: 'Borrowings are rising',
  EARNINGS_GROWTH: 'Profits are growing',
  MARGIN_PRESSURE: 'Profit margins are under pressure',
};

function observationTitle(type?: string): string {
  if (!type) return 'Something worth knowing';
  return OBSERVATION_TITLES[type] ?? titleCase(type);
}

const SAFETY_RULES = [
  {
    title: 'No single share above 15% of your money',
    detail: 'This keeps one bad call from sinking the whole portfolio.',
  },
  {
    title: 'At least 20% always stays in cash',
    detail: 'A cash cushion means you never have to sell at a bad moment.',
  },
  {
    title: 'Trading pauses at a ₹1,500 daily loss',
    detail: 'A hard stop gives you time to think instead of chasing losses.',
  },
];

const TERMS = [
  {
    term: 'Average buy price',
    meaning: 'The typical price you paid for one share, after all your buys are blended together.',
  },
  {
    term: 'Unrealised profit',
    meaning: 'The gain or loss on shares you still own. It becomes real only when you sell.',
  },
  {
    term: 'Cash available',
    meaning: 'Money in your practice account that is not yet invested in shares.',
  },
];

export default function DashboardView({
  data,
  activePortfolioType,
  onSelectView,
  onOpenOrderModal,
  onOpenProposalModal,
  onSelectAsset,
  experienceMode,
}: Props) {
  const isPractice = activePortfolioType === 'VIRTUAL';

  const currentPortfolio =
    data.portfolios.find((p) => p.type === activePortfolioType) ||
    data.portfolios[0] || {
      total_value: 25000,
      current_cash: 25000,
      invested_value: 0,
      initial_capital: 25000,
      realised_pnl: 0,
      unrealised_pnl: 0,
    };

  const virtualPort = data.portfolios.find((p) => p.type === 'VIRTUAL');
  const realPort = data.portfolios.find((p) => p.type === 'REAL');

  const totalValue = toNumber(currentPortfolio.total_value);
  const cash = toNumber(currentPortfolio.current_cash);
  const invested = toNumber(currentPortfolio.invested_value);
  const initialCapital = toNumber(currentPortfolio.initial_capital);
  const totalReturn = totalValue - initialCapital;
  const returnPct = initialCapital > 0 ? (totalReturn / initialCapital) * 100 : 0;

  const currentPositions = data.positions.filter((p) => p.portfolio_type === activePortfolioType);
  const pendingProposals = data.proposals.filter((p) => p.status === 'PENDING');
  const observations = data.observations.slice(0, 3);
  const topQuotes = data.quotes.slice(0, 4);

  const investedPct = totalValue > 0 ? Math.min(100, (invested / totalValue) * 100) : 0;
  const profitTone = toneFor(totalReturn);

  const steps = [
    {
      title: 'Learn the basics',
      detail: 'A two-minute tour of how investing works and what this app does.',
      cta: 'Start the tour',
      action: () => onSelectView('onboarding'),
      done: false,
      icon: GraduationCap,
    },
    {
      title: 'Ask the AI for an idea',
      detail: 'See a suggestion with the reasoning spelled out — no jargon.',
      cta: 'Get an idea',
      action: onOpenProposalModal,
      done: data.proposals.length > 0,
      icon: Sparkles,
    },
    {
      title: 'Make your first practice trade',
      detail: 'Buy one share of a company you know. Nothing is at risk.',
      cta: 'Practise a trade',
      action: () => onOpenOrderModal(),
      done: currentPositions.length > 0,
      icon: PlusCircle,
    },
  ];

  return (
    <div className="space-y-5">
      {/* Honest data note, stated once and calmly */}
      <Notice tone="demo">
        <span className="font-semibold text-ink-2">Demo build.</span>{' '}
        Prices, company figures and news are illustrative fixtures — not live NSE data. Use them to learn the
        mechanics, not to make real investment decisions.
      </Notice>

      {/* Hero */}
      <section className="card overflow-hidden">
        <div className="relative grid gap-6 p-5 sm:p-7 lg:grid-cols-[1.45fr_1fr] lg:items-center">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Pill tone={isPractice ? 'brand' : 'gold'} dot>
                {isPractice ? 'Practice portfolio' : 'Real account · read-only'}
              </Pill>
              <span className="text-[11.5px] text-ink-3">{todayLongIST()}</span>
            </div>

            <h1 className="display text-[27px] leading-[1.15] text-ink sm:text-[32px]">
              {greeting()}, investor.
            </h1>
            <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-ink-2">
              {isPractice ? (
                <>
                  You are practising with <span className="font-semibold text-ink">₹25,000 of pretend money</span>.
                  Explore, make mistakes and see the real charges — without risking a rupee.
                </>
              ) : (
                <>
                  These are stored records from your real-account ledger. No broker is connected in this build, so
                  nothing here can place a real order.
                </>
              )}
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Button variant="primary" size="lg" icon={<PlusCircle className="h-4 w-4" />} onClick={() => onOpenOrderModal()}>
                Practise a trade
              </Button>
              <Button variant="ai" size="lg" icon={<Sparkles className="h-4 w-4" />} onClick={onOpenProposalModal}>
                Get an AI idea
              </Button>
              <Button variant="ghost" size="lg" onClick={() => onSelectView('onboarding')}>
                How this works
              </Button>
            </div>
          </div>

          {/* Money mix — one glanceable picture */}
          <div className="flex items-center gap-5 rounded-2xl border border-white/[0.07] bg-black/20 p-4">
            <MoneyRing investedPct={investedPct} />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-center justify-between gap-2 text-[11.5px]">
                <span className="inline-flex items-center gap-1.5 text-ink-2">
                  <span className="h-2 w-2 rounded-full bg-[#5b8cff]" /> In shares
                </span>
                <span className="num font-semibold text-ink">{formatINR(invested)}</span>
              </div>
              <div className="flex items-center justify-between gap-2 text-[11.5px]">
                <span className="inline-flex items-center gap-1.5 text-ink-2">
                  <span className="h-2 w-2 rounded-full bg-white/20" /> In cash
                </span>
                <span className="num font-semibold text-ink">{formatINR(cash)}</span>
              </div>
              <p className="border-t border-white/[0.06] pt-2 text-[10.5px] leading-relaxed text-ink-3">
                {isPractice
                  ? 'Practice money only. Nothing leaves your bank account.'
                  : 'Stored ledger values, not a live broker balance.'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Key numbers */}
      <section aria-label="Your money at a glance">
        <div className="mb-2 flex items-end justify-between">
          <h2 className="text-[13px] font-semibold text-ink">Your money at a glance</h2>
          <button
            onClick={() => onSelectView(isPractice ? 'virtual-portfolio' : 'real-portfolio')}
            className="inline-flex items-center gap-1 text-[11.5px] font-medium text-ink-3 transition-colors hover:text-ink"
          >
            Full portfolio <ArrowUpRight className="h-3 w-3" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            label="Total value"
            value={formatINR(totalValue)}
            hint={isPractice ? 'Starting amount: ₹25,000' : 'Stored value'}
            icon={<Wallet className="h-4 w-4" />}
            emphasis
          />
          <Stat
            label="Cash available"
            value={formatINR(cash)}
            hint={`${totalValue > 0 ? ((cash / totalValue) * 100).toFixed(0) : 0}% of your total`}
            icon={<CircleDollarSign className="h-4 w-4" />}
          />
          <Stat
            label="Money in shares"
            value={formatINR(invested)}
            hint={`${investedPct.toFixed(0)}% of your total`}
            icon={<Briefcase className="h-4 w-4" />}
          />
          <Stat
            label={isPractice ? 'Profit / loss so far' : 'Stored profit / loss'}
            value={formatINR(totalReturn, { sign: true })}
            deltaPct={initialCapital > 0 ? returnPct : null}
            hint={initialCapital > 0 ? 'since you started' : undefined}
            icon={profitTone === 'down' ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
            emphasis
            className={cn(
              totalReturn !== 0 && 'border-b-2',
              totalReturn > 0 && 'border-b-emerald-400/40',
              totalReturn < 0 && 'border-b-rose-400/40'
            )}
          />
        </div>
      </section>

      {/* Holdings + next steps */}
      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <CardHeader
            eyebrow="Portfolio"
            title="What you own"
            subtitle="Each row is a company whose shares you hold in this portfolio."
            action={
              <Button variant="ghost" size="sm" onClick={() => onOpenOrderModal()} icon={<PlusCircle className="h-3.5 w-3.5" />}>
                Add
              </Button>
            }
          />

          <div className="mt-4">
            {currentPositions.length === 0 ? (
              <EmptyState
                icon={<Briefcase className="h-5 w-5" />}
                title="You don't own any shares yet"
                description="That is completely fine. Start with one share of a company you already understand, then look at the charges and the profit or loss it shows."
                action={
                  <>
                    <Button variant="primary" size="sm" onClick={() => onOpenOrderModal()}>
                      Practise a trade
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => onSelectView('market')}>
                      Browse companies
                    </Button>
                  </>
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/[0.07] text-[10.5px] uppercase tracking-wider text-ink-3">
                      <th className="pb-2 font-semibold">Company</th>
                      <th className="pb-2 font-semibold" title="Number of shares you hold">Shares</th>
                      <th className="hidden pb-2 font-semibold sm:table-cell" title="Average price paid per share">
                        Avg. price
                      </th>
                      <th className="pb-2 font-semibold" title="Latest practice price per share">Now</th>
                      <th className="hidden pb-2 font-semibold md:table-cell">Value</th>
                      <th className="pb-2 text-right font-semibold">Profit / loss</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.05]">
                    {currentPositions.map((pos) => {
                      const pnl = toNumber(pos.unrealised_pnl);
                      const tone = toneFor(pnl);
                      return (
                        <tr key={pos.id} className="transition-colors hover:bg-white/[0.02]">
                          <td className="py-2.5 pr-2">
                            <span className="block font-semibold text-ink">{pos.symbol}</span>
                            <span className="block max-w-[150px] truncate text-[10.5px] text-ink-3">{pos.name}</span>
                          </td>
                          <td className="num py-2.5 text-ink-2">{pos.quantity}</td>
                          <td className="num hidden py-2.5 text-ink-2 sm:table-cell">
                            {formatINR(pos.average_buy_price, { decimals: 2 })}
                          </td>
                          <td className="num py-2.5 font-medium text-ink">
                            {formatINR(pos.current_price, { decimals: 2 })}
                          </td>
                          <td className="num hidden py-2.5 text-ink-2 md:table-cell">
                            {formatINR(pos.current_market_value)}
                          </td>
                          <td className="py-2.5 text-right">
                            <span className={cn('num block font-semibold', toneClass(tone))}>
                              {formatINR(pnl, { sign: true })}
                            </span>
                            <span className="num block text-[10.5px] text-ink-3">
                              {formatPct(toNumber(pos.unrealised_pnl_pct))}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Card>

        {/* Next steps */}
        <Card className="p-5">
          <CardHeader
            eyebrow="Guided"
            title="Your next steps"
            subtitle="Three short steps. Do them in any order."
          />
          <ol className="mt-4 space-y-2.5">
            {steps.map((step, index) => {
              const Icon = step.icon;
              return (
                <li
                  key={step.title}
                  className={cn(
                    'rounded-xl border p-3 transition-colors',
                    step.done
                      ? 'border-emerald-400/20 bg-emerald-400/[0.05]'
                      : 'border-white/[0.07] bg-white/[0.025] hover:border-white/[0.12]'
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    <span
                      className={cn(
                        'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold',
                        step.done
                          ? 'border-emerald-400/30 bg-emerald-400/15 text-emerald-300'
                          : 'border-white/[0.1] bg-white/[0.04] text-ink-3'
                      )}
                    >
                      {step.done ? <Check className="h-3.5 w-3.5" /> : index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink">
                        <Icon className="h-3.5 w-3.5 text-ink-3" />
                        {step.title}
                      </p>
                      <p className="mt-1 text-[11px] leading-relaxed text-ink-3">{step.detail}</p>
                      {!step.done && (
                        <button
                          onClick={step.action}
                          className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-[#9db9ff] transition-colors hover:text-[#c3d5ff]"
                        >
                          {step.cta} <ArrowRight className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>
      </section>

      {/* AI ideas + safety */}
      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <CardHeader
            icon={<Lightbulb className="h-4 w-4" />}
            title="Ideas from your AI assistant"
            subtitle="Observations drawn from the demo dataset, explained in plain words."
            action={
              <Button variant="ghost" size="sm" onClick={() => onSelectView('agents')}>
                All observations
              </Button>
            }
          />

          {pendingProposals.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[rgba(167,139,250,0.28)] bg-[rgba(124,107,255,0.1)] px-3.5 py-2.5">
              <div className="flex items-center gap-2 text-[12px] text-[#d4c9ff]">
                <Sparkles className="h-4 w-4" />
                <span>
                  <span className="font-semibold">
                    {pendingProposals.length} {pendingProposals.length === 1 ? 'idea is' : 'ideas are'} waiting
                  </span>{' '}
                  for your review.
                </span>
              </div>
              <Button variant="ai" size="sm" onClick={() => onSelectView('decisions')}>
                Review
              </Button>
            </div>
          )}

          <div className="mt-4 space-y-2.5">
            {observations.length === 0 ? (
              <EmptyState
                icon={<Sparkles className="h-5 w-5" />}
                title="No ideas yet"
                description="Ask the AI strategist for a proposal and the reasoning will appear here."
                action={
                  <Button variant="ai" size="sm" onClick={onOpenProposalModal}>
                    Get an AI idea
                  </Button>
                }
              />
            ) : (
              observations.map((obs) => (
                <article
                  key={obs.id}
                  className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[12.5px] font-semibold text-ink">{obs.symbol}</span>
                      <span className="max-w-[180px] truncate text-[10.5px] text-ink-3">{obs.name}</span>
                    </div>
                    <Pill tone={obs.priority === 'HIGH' ? 'gold' : 'brand'}>{observationTitle(obs.observation_type)}</Pill>
                  </div>
                  {obs.facts && (
                    <p className="mt-2 text-[11.5px] leading-relaxed text-ink-2">
                      <span className="font-semibold text-ink-3">What we noticed: </span>
                      {obs.facts}
                    </p>
                  )}
                  {obs.interpretation && (
                    <p className="mt-1 text-[11.5px] leading-relaxed text-ink-3">
                      <span className="font-semibold">Why it matters: </span>
                      {obs.interpretation}
                    </p>
                  )}
                </article>
              ))
            )}
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <CardHeader
              icon={<ShieldCheck className="h-4 w-4" />}
              title="Your safety net"
              subtitle="Hard rules the app cannot break, even if the AI is wrong."
            />
            <ul className="mt-4 space-y-3">
              {SAFETY_RULES.map((rule) => (
                <li key={rule.title} className="flex gap-2.5">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  <div>
                    <p className="text-[12px] font-medium leading-snug text-ink">{rule.title}</p>
                    <p className="mt-0.5 text-[10.5px] leading-relaxed text-ink-3">{rule.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
            <Button variant="ghost" size="sm" className="mt-3 px-0" onClick={() => onSelectView('risk')}>
              See all safeguards <ArrowUpRight className="h-3 w-3" />
            </Button>
          </Card>

          <Card className="p-5">
            <CardHeader icon={<BookOpen className="h-4 w-4" />} title="A term, in plain English" />
            <div className="mt-3 space-y-3">
              {TERMS.map((term) => (
                <div key={term.term}>
                  <p className="text-[12px] font-semibold text-ink">{term.term}</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-ink-3">{term.meaning}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </section>

      {/* Market snapshot */}
      {topQuotes.length > 0 && (
        <Card className="p-5">
          <CardHeader
            eyebrow="Demo prices"
            title="A few companies to explore"
            subtitle="Practice prices from the demo dataset. Tap one to read more about the business."
            action={
              <Button variant="ghost" size="sm" onClick={() => onSelectView('market')}>
                Explore shares
              </Button>
            }
          />
          <div className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {topQuotes.map((quote) => {
              const tone = toneFor(quote.changePct);
              return (
                <button
                  key={quote.symbol}
                  onClick={() => (onSelectAsset ? onSelectAsset(quote.symbol) : onSelectView('research'))}
                  className="group rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-left transition-colors hover:border-white/[0.14] hover:bg-white/[0.04]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12.5px] font-semibold text-ink">{quote.symbol}</span>
                    <span className={cn('num text-[11px] font-semibold', toneClass(tone))}>
                      {formatPct(quote.changePct)}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[10.5px] text-ink-3">{quote.name}</p>
                  <p className="num mt-2 text-[15px] font-semibold text-ink">{formatINR(quote.price, { decimals: 2 })}</p>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {/* Advanced-only context */}
      {experienceMode === 'ADVANCED' && (
        <Card className="p-5">
          <CardHeader
            eyebrow="Detailed view"
            title="Real-account ledger (not broker-synced)"
            subtitle="Stored values only. Broker authentication, live order routing and fill reconciliation are not implemented."
            action={
              <Button variant="secondary" size="sm" onClick={() => onSelectView('real-portfolio')}>
                Open real account
              </Button>
            }
          />
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <MiniValue label="Stored value" value={formatINR(realPort?.total_value)} />
            <MiniValue label="Stored cash" value={formatINR(realPort?.current_cash)} />
            <MiniValue label="Autonomous trading" value="Disabled" tone="down" />
          </div>
        </Card>
      )}

      {/* Learning nudge */}
      <section className="card flex flex-col items-start justify-between gap-4 p-5 sm:flex-row sm:items-center">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[rgba(240,183,117,0.25)] bg-[rgba(240,183,117,0.1)] text-gold">
            <GraduationCap className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[13px] font-semibold text-ink">New to all this? Start with the two-minute tour.</p>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-3">
              No jargon. It covers how prices work, what the charges are, and why the AI is not allowed to
              gamble your money.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="gold" size="md" onClick={() => onSelectView('onboarding')}>
            Learn the basics
          </Button>
        </div>
      </section>
    </div>
  );
}

function MiniValue({ label, value, tone }: { label: string; value: string; tone?: 'down' }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-3">
      <p className="text-[10.5px] text-ink-3">{label}</p>
      <p className={cn('num mt-1 text-[15px] font-semibold', tone === 'down' ? 'text-rose-300' : 'text-ink')}>
        {value}
      </p>
    </div>
  );
}

function MoneyRing({ investedPct }: { investedPct: number }) {
  const size = 84;
  const stroke = 9;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, investedPct));
  const filled = (clamped / 100) * circumference;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.09)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#5b8cff"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference - filled}`}
          style={{ transition: 'stroke-dasharray 600ms ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="num text-[16px] font-semibold leading-none text-ink">{clamped.toFixed(0)}%</span>
        <span className="mt-0.5 text-[9px] uppercase tracking-wider text-ink-3">invested</span>
      </div>
    </div>
  );
}
