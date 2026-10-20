'use client';
import React from 'react';
import { BookOpen, X, HelpCircle } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const GLOSSARY_ITEMS = [
  {
    term: 'Investing vs Trading',
    definition: 'Investing means purchasing stakes in resilient businesses to compound wealth over years (long-term). Trading involves short-term buying and selling based on technical trends or news catalysts.'
  },
  {
    term: 'ROCE (Return on Capital Employed)',
    definition: 'Measures how efficiently a company generates profits from its total capital. Above 18% in Indian markets indicates exceptional capital efficiency.'
  },
  {
    term: 'P/E Ratio (Price-to-Earnings)',
    definition: 'How much investors pay for every ₹1 of company profit. Lower P/E may indicate undervaluation, while higher P/E reflects premium growth expectations.'
  },
  {
    term: 'Debt-to-Equity (D/E)',
    definition: 'Compares total debt against shareholder equity. A ratio below 0.5 means the business is conservatively financed with negligible bankruptcy risk.'
  },
  {
    term: 'STT (Securities Transaction Tax)',
    definition: 'Mandatory Indian statutory tax levied by the Central Government on equity purchases and sales (0.1% on equity delivery).'
  },
  {
    term: 'Drawdown',
    definition: 'The percentage decline in your portfolio value from its highest peak. A max drawdown of 10% means the portfolio has never fallen more than 10% from its high water mark.'
  },
  {
    term: 'Slippage',
    definition: 'The slight price difference between the quoted price on your screen and the actual fill price on the exchange due to microsecond market movement and order book depth.'
  },
  {
    term: 'CNC vs MIS',
    definition: 'CNC (Cash & Carry) is for delivery shares you own outright without leverage. MIS (Margin Intraday Square-off) must be squared off before 15:20 IST on the same day.'
  }
];

export default function GlossaryModal({ isOpen, onClose }: Props) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-slate-400 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3 text-blue-400 mb-2">
          <BookOpen className="h-6 w-6 shrink-0" />
          <h2 className="text-lg font-bold text-white">Beginner Financial Glossary & Concepts</h2>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          Plain-language explanations of essential Indian financial concepts and risk terminology.
        </p>

        <div className="overflow-y-auto pr-2 space-y-3 flex-1">
          {GLOSSARY_ITEMS.map((item, idx) => (
            <div key={idx} className="rounded-lg border border-slate-800 bg-slate-950 p-3.5">
              <div className="flex items-center gap-2 mb-1">
                <HelpCircle className="h-4 w-4 text-blue-400 shrink-0" />
                <h3 className="text-sm font-semibold text-slate-200">{item.term}</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed pl-6">{item.definition}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 flex justify-end border-t border-slate-800 pt-3">
          <button
            onClick={onClose}
            className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500"
          >
            Got It
          </button>
        </div>
      </div>
    </div>
  );
}
