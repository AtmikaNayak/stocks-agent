'use client';
import React, { useState } from 'react';
import {
  GraduationCap,
  CheckCircle2,
  Shield,
  Layers,
  Sparkles,
  ArrowRight,
  TrendingUp,
  AlertTriangle,
  BookOpen
} from 'lucide-react';

interface Props {
  onSelectView: (view: any) => void;
  onOpenOrderModal: () => void;
  onOpenProposalModal: () => void;
}

export default function OnboardingView({ onSelectView, onOpenOrderModal, onOpenProposalModal }: Props) {
  const [step, setStep] = useState(1);

  const steps = [
    {
      num: 1,
      title: 'Welcome to InvestPilot AI 2.0',
      subtitle: 'What this app is for'
    },
    {
      num: 2,
      title: 'Two Isolated Environments',
      subtitle: 'Why practice money and real money are kept apart'
    },
    {
      num: 3,
      title: 'Deterministic Risk Safeguards',
      subtitle: 'The rules that protect you'
    },
    {
      num: 4,
      title: 'Make your first practice investment',
      subtitle: 'Simulate with ₹25,000 Virtual Capital'
    }
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="rounded-2xl border border-white/[0.08] bg-[#0f1420] p-6 shadow-xl">
        <div className="flex items-center gap-3 mb-2 text-indigo-400">
          <GraduationCap className="h-7 w-7" />
          <h1 className="text-xl font-bold text-white tracking-tight">Learn the basics</h1>
        </div>
        <p className="text-xs text-ink-2">
          A two-minute tour of how investing works, what the charges are, and why this app never risks real money.
        </p>

        {/* Step Indicator */}
        <div className="flex items-center justify-between border-y border-white/[0.08] py-4 my-6">
          {steps.map((s) => (
            <button
              key={s.num}
              onClick={() => setStep(s.num)}
              className={`flex items-center gap-2 text-xs font-semibold transition ${
                step === s.num
                  ? 'text-indigo-400 font-bold'
                  : step > s.num
                  ? 'text-emerald-400'
                  : 'text-ink-3 hover:text-ink-2'
              }`}
            >
              <div
                className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold ${
                  step === s.num
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                    : step > s.num
                    ? 'bg-emerald-600 text-white'
                    : 'bg-white/[0.06] text-ink-2'
                }`}
              >
                {step > s.num ? <CheckCircle2 className="h-4 w-4" /> : s.num}
              </div>
              <span className="hidden sm:inline">{s.title}</span>
            </button>
          ))}
        </div>

        {/* Step 1: Core Concepts */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-base font-bold text-white">Rule #1: Investing vs Speculation</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="rounded-xl border border-white/[0.08] bg-black/30 p-4 space-y-2">
                <span className="font-bold text-blue-400 block text-sm">Savings (Bank FD)</span>
                <p className="text-ink-2">
                  Risk-free capital preservation yielding ~6.5% - 7% per annum. Safe for immediate emergencies, but struggles to beat real inflation over a decade.
                </p>
              </div>

              <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 space-y-2">
                <span className="font-bold text-emerald-400 block text-sm">Investing (What We Do)</span>
                <p className="text-ink-2">
                  Buying shares of profitable Indian companies (TCS, Reliance, HDFC Bank) with high ROCE (&gt;18%) and low debt to compound wealth over 3-10 years.
                </p>
              </div>

              <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-4 space-y-2">
                <span className="font-bold text-rose-400 block text-sm">Speculation / Gambles</span>
                <p className="text-ink-2">
                  Trading random tips without checking the business. SEBI studies have repeatedly found that most retail intraday traders lose money. InvestPilot will not do this.
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <button
                onClick={() => setStep(2)}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-5 py-2 text-xs font-semibold text-white transition"
              >
                <span>Continue: Two Isolated Environments</span> <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Two Environments */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-base font-bold text-white">Your two accounts: practice money and real money</h2>
            <p className="text-xs text-ink-2 leading-relaxed">
              InvestPilot AI strictly separates real money from simulator money at the database and application levels.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="rounded-xl border border-blue-500/30 bg-blue-950/20 p-4 space-y-2">
                <div className="flex items-center gap-2 text-blue-400 font-bold">
                  <Layers className="h-5 w-5" />
                  <span>Practice account (starts with ₹25,000)</span>
                </div>
                <p className="text-ink-2">
                  Your safe practice ground. It uses sample prices from the demo dataset and applies realistic Indian charges (STT, exchange fees, GST, stamp duty), so you can see how costs add up without risking anything.
                </p>
              </div>

              <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 space-y-2">
                <div className="flex items-center gap-2 text-amber-400 font-bold">
                  <Shield className="h-5 w-5" />
                  <span>Real account (read-only)</span>
                </div>
                <p className="text-ink-2">
                  Meant to mirror your actual broker holdings. This build has no broker adapter, so the view is read-only and no real order can be placed.
                </p>
              </div>
            </div>

            <div className="flex justify-between pt-4">
              <button
                onClick={() => setStep(1)}
                className="rounded-lg border border-white/[0.12] px-4 py-2 text-xs font-medium text-ink-2 hover:text-white"
              >
                Back
              </button>
              <button
                onClick={() => setStep(3)}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-5 py-2 text-xs font-semibold text-white transition"
              >
                <span>Continue: Risk Safeguards</span> <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Hard Risk Controls */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-base font-bold text-white">Deterministic Hard Risk Engine</h2>
            <p className="text-xs text-ink-2 leading-relaxed">
              Calculations are hard-coded in mathematical software, never left to LLM guesswork. The risk engine has the absolute power to reject any trade recommendation.
            </p>

            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between p-3 rounded-lg border border-white/[0.08] bg-black/30">
                <span className="font-semibold text-ink">1. Maximum Single Stock Cap (15%)</span>
                <span className="text-ink-2">Prevents over-concentration in any one stock.</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border border-white/[0.08] bg-black/30">
                <span className="font-semibold text-ink">2. Minimum Cash Reserve Buffer (20%)</span>
                <span className="text-ink-2">Always keeps ₹5,000 liquid buffer for opportunities.</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border border-white/[0.08] bg-black/30">
                <span className="font-semibold text-ink">3. Daily Loss Limit (₹1,500)</span>
                <span className="text-ink-2">Suspends daily trading automatically if losses accumulate.</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border border-red-500/30 bg-red-950/20">
                <span className="font-semibold text-red-300">4. Instant Emergency Kill-Switch</span>
                <span className="text-red-400">One-click halt button stops all trading instantly.</span>
              </div>
            </div>

            <div className="flex justify-between pt-4">
              <button
                onClick={() => setStep(2)}
                className="rounded-lg border border-white/[0.12] px-4 py-2 text-xs font-medium text-ink-2 hover:text-white"
              >
                Back
              </button>
              <button
                onClick={() => setStep(4)}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-5 py-2 text-xs font-semibold text-white transition"
              >
                <span>Continue: First Simulation</span> <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Ready to practice */}
        {step === 4 && (
          <div className="space-y-5 text-center py-4">
            <div className="h-16 w-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-10 w-10" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">You Are Ready to Practice!</h2>
              <p className="text-xs text-ink-2 max-w-md mx-auto mt-1">
                Your virtual wallet is primed with ₹25,000. Try generating an AI proposal or place your first paper delivery trade.
              </p>
            </div>

            <div className="flex justify-center gap-4 pt-2">
              <button
                onClick={onOpenProposalModal}
                className="flex items-center gap-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 px-5 py-2.5 text-xs font-semibold text-white shadow-lg transition"
              >
                <Sparkles className="h-4 w-4" />
                <span>Generate First AI Proposal</span>
              </button>
              <button
                onClick={() => onSelectView('virtual-portfolio')}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 px-5 py-2.5 text-xs font-semibold text-white shadow-lg transition"
              >
                <Layers className="h-4 w-4" />
                <span>Go to Virtual Portfolio</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
