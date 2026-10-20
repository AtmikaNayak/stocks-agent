'use client';
import React from 'react';
import {
  LayoutDashboard,
  GraduationCap,
  Briefcase,
  LineChart,
  Layers,
  Search,
  Compass,
  Bot,
  ListOrdered,
  BookOpen,
  PieChart,
  History,
  Shield,
  FileText,
  Bell,
  Plug,
  Sliders,
  Terminal,
  Settings,
  Activity
} from 'lucide-react';

export type ViewType =
  | 'dashboard'
  | 'onboarding'
  | 'workspace'
  | 'real-portfolio'
  | 'virtual-portfolio'
  | 'market'
  | 'research'
  | 'strategies'
  | 'agents'
  | 'orders'
  | 'decisions'
  | 'analytics'
  | 'backtesting'
  | 'risk'
  | 'reports'
  | 'notifications'
  | 'broker'
  | 'permissions'
  | 'settings'
  | 'system-health';

interface Props {
  currentView: ViewType;
  onSelectView: (view: ViewType) => void;
  activePortfolioType: 'REAL' | 'VIRTUAL';
  experienceMode: 'BEGINNER' | 'ADVANCED';
}

export default function Sidebar({
  currentView,
  onSelectView,
  activePortfolioType,
  experienceMode
}: Props) {
  const sections = [
    {
      group: 'PORTFOLIOS & CORE',
      items: [
        { id: 'dashboard' as ViewType, label: 'Dashboard', icon: LayoutDashboard },
        { id: 'onboarding' as ViewType, label: 'Beginner Onboarding', icon: GraduationCap },
        { id: 'virtual-portfolio' as ViewType, label: 'Virtual Portfolio (₹25k)', icon: Layers },
        { id: 'real-portfolio' as ViewType, label: 'Real Demat Portfolio', icon: Briefcase },
        { id: 'analytics' as ViewType, label: 'Performance Analytics', icon: PieChart },
      ]
    },
    {
      group: 'MARKET & ASSETS',
      items: [
        { id: 'market' as ViewType, label: 'Market Overview', icon: LineChart },
        { id: 'research' as ViewType, label: 'Asset Research', icon: Search },
        { id: 'workspace' as ViewType, label: 'Advanced Workspace', icon: Terminal },
      ]
    },
    {
      group: 'AI & STRATEGY',
      items: [
        { id: 'agents' as ViewType, label: 'Agent Control Centre', icon: Bot },
        { id: 'strategies' as ViewType, label: 'Strategy Builder', icon: Compass },
        { id: 'backtesting' as ViewType, label: 'Backtesting Engine', icon: History },
        { id: 'decisions' as ViewType, label: 'Decision Journal', icon: BookOpen },
      ]
    },
    {
      group: 'OPERATIONS & RISK',
      items: [
        { id: 'orders' as ViewType, label: 'Orders & Executions', icon: ListOrdered },
        { id: 'risk' as ViewType, label: 'Risk Safeguards', icon: Shield },
        { id: 'reports' as ViewType, label: 'Reports & Audit', icon: FileText },
        { id: 'notifications' as ViewType, label: 'Notifications', icon: Bell },
      ]
    },
    {
      group: 'GOVERNANCE & BROKER',
      items: [
        { id: 'broker' as ViewType, label: 'Broker Integration', icon: Plug },
        { id: 'permissions' as ViewType, label: 'Autonomy Controls', icon: Sliders },
        { id: 'system-health' as ViewType, label: 'System Health & Worker', icon: Activity },
        { id: 'settings' as ViewType, label: 'Settings', icon: Settings },
      ]
    }
  ];

  return (
    <aside className="w-64 shrink-0 border-r border-slate-800 bg-slate-900/90 flex flex-col h-screen overflow-y-auto">
      {/* Brand Header */}
      <div className="p-4 border-b border-slate-800 flex items-center gap-3">
        <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/20">
          IP
        </div>
        <div>
          <h1 className="font-bold text-sm tracking-wide text-white flex items-center gap-1.5">
            InvestPilot AI <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1 py-0.5 rounded font-mono">2.0</span>
          </h1>
          <p className="text-[11px] text-slate-400">Autonomous Wealth Engine</p>
        </div>
      </div>

      {/* Active Environment Indicator Pill */}
      <div className="px-4 py-2.5 bg-slate-950/60 border-b border-slate-800/80">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-slate-400">Active View Context:</span>
          <span
            className={`font-semibold px-2 py-0.5 rounded text-[10px] uppercase tracking-wider ${
              activePortfolioType === 'VIRTUAL'
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
            }`}
          >
            {activePortfolioType === 'VIRTUAL' ? 'Virtual ₹25K' : 'Live Demat'}
          </span>
        </div>
      </div>

      {/* Navigation Groups */}
      <div className="flex-1 py-3 px-2 space-y-4">
        {sections.map((section, sIdx) => (
          <div key={sIdx}>
            <h2 className="px-3 text-[10px] font-bold tracking-wider text-slate-500 uppercase mb-1">
              {section.group}
            </h2>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = currentView === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onSelectView(item.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-sm font-semibold'
                        : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                    }`}
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Footer Info */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/40 text-[11px] text-slate-400">
        <div className="flex items-center justify-between">
          <span>Mode:</span>
          <span className="font-semibold text-slate-300">{experienceMode}</span>
        </div>
        <div className="flex items-center justify-between mt-1">
          <span>SEBI Compliance:</span>
          <span className="text-emerald-400 font-medium">Active Safe</span>
        </div>
      </div>
    </aside>
  );
}
