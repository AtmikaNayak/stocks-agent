'use client';
import React, { useState, useEffect } from 'react';
import {
  FileText,
  MessageSquare,
  Sparkles,
  Send,
  HelpCircle,
  Download,
  Calendar,
  CheckCircle2
} from 'lucide-react';
import { todayLongIST } from '@/lib/format';

interface Props {
  activePortfolioType: 'REAL' | 'VIRTUAL';
}

export default function ReportsView({ activePortfolioType }: Props) {
  const [report, setReport] = useState<any | null>(null);
  const [question, setQuestion] = useState('');
  const [chatLog, setChatLog] = useState<{ q: string; aPlain: string; aAdv: string; sources: string[] }[]>([]);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    fetch('/api/explainability?type=report')
      .then((r) => r.json())
      .then((d) => setReport(d.report));
  }, []);

  const handleAsk = async (customQ?: string) => {
    const query = customQ || question;
    if (!query.trim()) return;

    setAsking(true);
    try {
      const res = await fetch('/api/explainability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: query })
      });
      const data = await res.json();
      if (res.ok) {
        setChatLog((prev) => [
          ...prev,
          {
            q: query,
            aPlain: data.answer.answerPlain,
            aAdv: data.answer.answerAdvanced,
            sources: data.answer.sources
          }
        ]);
        if (!customQ) setQuestion('');
      }
    } finally {
      setAsking(false);
    }
  };

  const sampleQuestions = [
    'Why did you make this decision?',
    'What could go wrong with our recent trade?',
    'What alternatives did you consider?',
    'Has the original investment thesis changed?'
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-500/20 text-blue-400">
            <FileText className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Reports, Explanations & Audit Assistant</h1>
            <p className="text-xs text-ink-2">
              Statements built from your recorded ledger, plus plain-English answers that cite the decisions they came from.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-ink-2 flex items-center gap-1 bg-black/30 px-3 py-1.5 rounded-lg border border-white/[0.08]">
            <Calendar className="h-3.5 w-3.5 text-ink-2" />
            <span>Date: {todayLongIST()}</span>
          </span>
        </div>
      </div>

      {/* Grounded Conversational Q&A Card */}
      <div className="rounded-xl border border-purple-500/30 bg-[#0f1420]/80 p-5 space-y-4">
        <div className="flex items-center gap-2 text-purple-400">
          <Sparkles className="h-5 w-5" />
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">
            Ask Explainability Agent (Grounded Q&A)
          </h2>
        </div>
        <p className="text-xs text-ink-2">
          Ask questions about any past trade, thesis, or risk evaluation. Answers are strictly grounded in stored database records with zero invented historical facts.
        </p>

        {/* Quick Sample Questions */}
        <div className="flex flex-wrap gap-2">
          {sampleQuestions.map((sq, i) => (
            <button
              key={i}
              onClick={() => handleAsk(sq)}
              className="rounded-full border border-white/[0.12] bg-white/[0.07] hover:bg-white/[0.10] px-3 py-1 text-xs text-ink-2 transition"
            >
              {sq}
            </button>
          ))}
        </div>

        {/* Chat History */}
        {chatLog.length > 0 && (
          <div className="space-y-3 pt-2 max-h-72 overflow-y-auto pr-1">
            {chatLog.map((chat, idx) => (
              <div key={idx} className="space-y-2 text-xs">
                <div className="rounded-lg bg-white/[0.07] p-2.5 text-ink font-medium">
                  <strong>You:</strong> {chat.q}
                </div>
                <div className="rounded-lg border border-purple-500/30 bg-purple-950/20 p-3 text-ink space-y-2">
                  <p className="leading-relaxed">{chat.aPlain}</p>
                  <div className="text-[11px] text-ink-2 border-t border-purple-500/20 pt-1.5">
                    <strong>Advanced Detail:</strong> {chat.aAdv}
                  </div>
                  <div className="text-[10px] text-ink-3">
                    Sources: {chat.sources.join(', ')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Question Input */}
        <div className="flex gap-2 pt-2">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
            placeholder="Ask why a decision was made, what could go wrong, or what alternatives were considered..."
            className="flex-1 rounded-lg border border-white/[0.12] bg-black/30 px-3 py-2 text-xs text-white focus:border-purple-500 focus:outline-none"
          />
          <button
            onClick={() => handleAsk()}
            disabled={asking || !question.trim()}
            className="rounded-lg bg-purple-600 hover:bg-purple-500 px-4 py-2 text-xs font-semibold text-white transition flex items-center gap-1.5"
          >
            <Send className="h-3.5 w-3.5" />
            <span>{asking ? 'Searching...' : 'Ask'}</span>
          </button>
        </div>
      </div>

      {/* Daily Portfolio Summary Report */}
      {report && (
        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Daily Portfolio Status Report (FY26-Q3)
            </h3>
            <span className="text-xs bg-white/[0.06] text-ink-2 px-2 py-0.5 rounded font-mono">
              EOD Snapshot
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="rounded-lg bg-black/30 p-3">
              <span className="text-ink-2 block">Reported NAV</span>
              <span className="text-base font-bold text-white font-mono">
                ₹{report.portfolio.total_value.toLocaleString('en-IN')}
              </span>
            </div>
            <div className="rounded-lg bg-black/30 p-3">
              <span className="text-ink-2 block">Cash Reserve</span>
              <span className="text-base font-bold text-blue-400 font-mono">
                {report.riskStatus.cashReservePct}%
              </span>
            </div>
            <div className="rounded-lg bg-black/30 p-3">
              <span className="text-ink-2 block">Risk Status</span>
              <span className="text-base font-bold text-emerald-400 font-mono">
                {report.riskStatus.status}
              </span>
            </div>
            <div className="rounded-lg bg-black/30 p-3">
              <span className="text-ink-2 block">Active Holdings</span>
              <span className="text-base font-bold text-white font-mono">
                {report.positions.length} stocks
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
