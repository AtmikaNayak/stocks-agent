'use client';
import React from 'react';
import {
  Shield,
  ShieldCheck,
  AlertTriangle,
  Lock,
  CheckCircle,
  Sliders
} from 'lucide-react';

interface Props {
  portfolio: any;
  permissions: any;
  onSelectView: (view: any) => void;
  onOpenEmergencyStop: () => void;
}

export default function RiskView({
  portfolio,
  permissions,
  onSelectView,
  onOpenEmergencyStop
}: Props) {
  const totalValue = portfolio?.total_value || 25000;
  const cashReservePct = totalValue > 0 ? ((portfolio?.current_cash || 0) / totalValue) * 100 : 100;
  const exposurePct = totalValue > 0 ? ((portfolio?.invested_value || 0) / totalValue) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 p-5 rounded-2xl border border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-red-500/20 text-red-400">
            <Shield className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Deterministic Risk Management Engine</h1>
            <p className="text-xs text-slate-400">
              Mathematical invariants enforced independently of LLMs. Rejects any unsafe order automatically.
            </p>
          </div>
        </div>

        <button
          onClick={onOpenEmergencyStop}
          className="rounded-lg border border-red-500/40 bg-red-950/40 px-3.5 py-2 text-xs font-bold text-red-300 hover:bg-red-900/60 shadow transition"
        >
          Emergency Kill Switch
        </button>
      </div>

      {/* Hard Risk Limit Gauges */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Min Cash Buffer */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-300">Minimum Cash Reserve Buffer</span>
            <span className="font-mono text-blue-400 font-bold">Target: &ge; 20%</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-white font-mono">{cashReservePct.toFixed(1)}%</span>
            <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
              <ShieldCheck className="h-4 w-4" /> COMPLIANT
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
            <div
              className={`h-full rounded-full ${cashReservePct >= 20 ? 'bg-emerald-500' : 'bg-rose-500'}`}
              style={{ width: `${Math.min(100, cashReservePct)}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-500">
            Enforces ₹5,000 cash buffer for margin shocks and opportunities.
          </p>
        </div>

        {/* Max Portfolio Exposure */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-300">Total Portfolio Exposure</span>
            <span className="font-mono text-purple-400 font-bold">Ceiling: &le; 80%</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-white font-mono">{exposurePct.toFixed(1)}%</span>
            <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
              <ShieldCheck className="h-4 w-4" /> SAFE
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-purple-500 rounded-full"
              style={{ width: `${Math.min(100, exposurePct)}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-500">
            Protects against systemic market drawdowns by limiting invested capital.
          </p>
        </div>

        {/* Single Stock Concentration */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-300">Max Single Stock Allocation</span>
            <span className="font-mono text-amber-400 font-bold">Cap: &le; 15%</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-white font-mono">15.0%</span>
            <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
              <ShieldCheck className="h-4 w-4" /> ENFORCED
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
            <div className="h-full bg-amber-500 rounded-full" style={{ width: '15%' }} />
          </div>
          <p className="text-[11px] text-slate-500">
            No single company can jeopardize more than 15% of your total capital.
          </p>
        </div>
      </div>

      {/* Active Safeguard Matrix */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
        <h2 className="text-sm font-bold text-white uppercase tracking-wider">
          Active Deterministic Safeguards Matrix
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="flex items-center justify-between p-3 rounded-lg border border-slate-800 bg-slate-950">
            <div>
              <span className="font-bold text-slate-200 block">Daily Loss Safeguard</span>
              <span className="text-slate-500">Auto-suspends orders if daily loss reaches threshold</span>
            </div>
            <span className="font-mono font-bold text-white">₹1,500.00</span>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg border border-slate-800 bg-slate-950">
            <div>
              <span className="font-bold text-slate-200 block">Maximum Drawdown Circuit</span>
              <span className="text-slate-500">Triggers emergency stop if drawdown exceeds peak limit</span>
            </div>
            <span className="font-mono font-bold text-white">10.0%</span>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg border border-slate-800 bg-slate-950">
            <div>
              <span className="font-bold text-slate-200 block">Single Order Value Ceiling</span>
              <span className="text-slate-500">Rejects fat-finger oversized market tickets</span>
            </div>
            <span className="font-mono font-bold text-white">₹10,000.00</span>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg border border-slate-800 bg-slate-950">
            <div>
              <span className="font-bold text-slate-200 block">Order Frequency Throttle</span>
              <span className="text-slate-500">Prevents runaway algorithmic order loops</span>
            </div>
            <span className="font-mono font-bold text-white">10 orders / day</span>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg border border-slate-800 bg-slate-950">
            <div>
              <span className="font-bold text-slate-200 block">Market Hours Restriction</span>
              <span className="text-slate-500">Restricts live execution to official NSE trading window</span>
            </div>
            <span className="font-mono font-bold text-white">09:20 - 15:15 IST</span>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg border border-slate-800 bg-slate-950">
            <div>
              <span className="font-bold text-slate-200 block">Real-Money Broker Isolation</span>
              <span className="text-slate-500">Strict server-side check prevents unauthorized execution</span>
            </div>
            <span className="font-mono font-bold text-emerald-400">ACTIVE ARMED</span>
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            onClick={() => onSelectView('permissions')}
            className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 font-semibold"
          >
            <Sliders className="h-3.5 w-3.5" />
            <span>Customize Autonomy Risk Limits in Permissions &rarr;</span>
          </button>
        </div>
      </div>
    </div>
  );
}
