import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'InvestPilot — Practise investing in Indian shares',
  description:
    'A calm, guided way to learn investing: practise with ₹25,000 of simulated money, see plain-English explanations, and stay inside hard safety limits. Demo data only — real-money trading is disabled.',
};

export const viewport: Viewport = {
  themeColor: '#070a12',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-canvas font-sans text-ink antialiased selection:bg-brand/30 selection:text-white">
        {children}
      </body>
    </html>
  );
}
