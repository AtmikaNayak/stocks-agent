import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  Bell,
  Bot,
  Briefcase,
  Compass,
  FileText,
  GraduationCap,
  History,
  LayoutDashboard,
  LineChart,
  ListOrdered,
  PieChart,
  Plug,
  Search,
  Settings,
  ShieldCheck,
  Sliders,
  Terminal,
  Wallet,
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

export interface NavItem {
  id: ViewType;
  label: string;
  /** One plain-language line shown under the label in expanded navigation. */
  hint: string;
  icon: LucideIcon;
}

/**
 * The everyday navigation stays short and uses ordinary words.
 * "Portfolio" becomes "money", "decisions" becomes "ideas", and so on.
 */
export const PRIMARY_NAV: NavItem[] = [
  { id: 'dashboard', label: 'Home', hint: 'Your money at a glance', icon: LayoutDashboard },
  { id: 'onboarding', label: 'Learn the basics', hint: 'A two-minute guided tour', icon: GraduationCap },
  { id: 'virtual-portfolio', label: 'Practice portfolio', hint: '₹25,000 of pretend money', icon: Wallet },
  { id: 'market', label: 'Explore shares', hint: 'Practice prices for Indian companies', icon: LineChart },
  { id: 'decisions', label: 'Ideas & decisions', hint: 'What the AI suggests, and why', icon: Compass },
  { id: 'risk', label: 'Safety & limits', hint: 'The rules that protect you', icon: ShieldCheck },
];

export const ADVANCED_NAV: { group: string; items: NavItem[] }[] = [
  {
    group: 'Research & AI',
    items: [
      { id: 'research', label: 'Company research', hint: 'Fundamentals and price history', icon: Search },
      { id: 'agents', label: 'AI assistants', hint: 'What the agents spotted', icon: Bot },
      { id: 'reports', label: 'Reports & explanations', hint: 'Ask why a decision was made', icon: FileText },
    ],
  },
  {
    group: 'Trading & records',
    items: [
      { id: 'orders', label: 'Orders & receipts', hint: 'Every simulated trade', icon: ListOrdered },
      { id: 'analytics', label: 'Performance', hint: 'How the portfolio has done', icon: PieChart },
      { id: 'strategies', label: 'Strategies', hint: 'Rules the AI follows', icon: Compass },
      { id: 'backtesting', label: 'Backtesting', hint: 'Replay an idea on old prices', icon: History },
      { id: 'workspace', label: 'Advanced workspace', hint: 'Deep-dive trading desk', icon: Terminal },
    ],
  },
  {
    group: 'Account & system',
    items: [
      { id: 'real-portfolio', label: 'Real account', hint: 'Read-only; trading disabled', icon: Briefcase },
      { id: 'broker', label: 'Broker connection', hint: 'Not available in this build', icon: Plug },
      { id: 'permissions', label: 'Automation controls', hint: 'How much the AI may do', icon: Sliders },
      { id: 'notifications', label: 'Updates', hint: 'Alerts and reminders', icon: Bell },
      { id: 'system-health', label: 'System status', hint: 'Data and background jobs', icon: Activity },
      { id: 'settings', label: 'Settings', hint: 'Preferences and experience mode', icon: Settings },
    ],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = [
  ...PRIMARY_NAV,
  ...ADVANCED_NAV.flatMap((group) => group.items),
];

export function labelForView(view: ViewType): string {
  return ALL_NAV_ITEMS.find((item) => item.id === view)?.label ?? 'Home';
}
