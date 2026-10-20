import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'InvestPilot AI 2.0 | Autonomous Personal Investment Platform',
  description: 'Evidence-based autonomous investing, paper trading, risk safeguards, and explainable AI for Indian equities.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-slate-950 text-slate-100 min-h-screen antialiased selection:bg-blue-600 selection:text-white">
        {children}
      </body>
    </html>
  );
}
