'use client';
import React, { useState, useEffect } from 'react';
import {
  Plug,
  ShieldCheck,
  AlertTriangle,
  Lock,
  CheckCircle2,
  ExternalLink,
  Power,
  RotateCcw
} from 'lucide-react';

interface Props {
  onRefresh: () => void;
}

export default function BrokerView({ onRefresh }: Props) {
  const [connections, setConnections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [selectedBroker, setSelectedBroker] = useState<'ZERODHA' | 'ANGEL_ONE' | 'UPSTOX'>('ZERODHA');
  const [clientId, setClientId] = useState('ZL7892');
  const [apiKey, setApiKey] = useState('kite_live_9281729381');
  const [apiSecret, setApiSecret] = useState('secret_prod_827391');
  const [complianceAck, setComplianceAck] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const fetchConnections = () => {
    fetch('/api/broker')
      .then((r) => r.json())
      .then((d) => {
        setConnections(d.connections || []);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchConnections();
  }, []);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!complianceAck) {
      alert('You must explicitly review and accept the SEBI statutory risk acknowledgment.');
      return;
    }

    setActionLoading(true);
    setStatusMessage(null);

    try {
      const res = await fetch('/api/broker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'connect',
          brokerName: selectedBroker,
          clientId,
          apiKey,
          apiSecret,
          complianceAcknowledged: true
        })
      });

      const data = await res.json();
      if (res.ok) {
        setStatusMessage(`Successfully linked official broker session for ${selectedBroker}.`);
        fetchConnections();
        onRefresh();
      } else {
        alert(data.error || 'Failed to authenticate broker');
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/broker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disconnect' })
      });
      if (res.ok) {
        setStatusMessage('Broker disconnected. Real-money trading safely disabled.');
        fetchConnections();
        onRefresh();
      }
    } finally {
      setActionLoading(false);
    }
  };

  const activeConnection = connections.find((c) => c.status === 'CONNECTED');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 p-5 rounded-2xl border border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400">
            <Plug className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Official Broker Integrations (Environment A)</h1>
            <p className="text-xs text-slate-400">
              Compliant API connections to SEBI-registered brokers. All secrets stored encrypted.
            </p>
          </div>
        </div>

        <span
          className={`text-xs px-3 py-1 rounded-lg font-mono font-semibold border ${
            activeConnection
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
              : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
          }`}
        >
          {activeConnection ? `ACTIVE: ${activeConnection.broker_name}` : 'DISCONNECTED'}
        </span>
      </div>

      {statusMessage && (
        <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-950/20 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Active Connection Card or Setup Form */}
      {activeConnection ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/10 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                ✓
              </div>
              <div>
                <h3 className="font-bold text-base text-white">
                  Connected to {activeConnection.broker_name}
                </h3>
                <span className="text-xs text-slate-400">
                  Client ID: <strong className="text-slate-200">{activeConnection.client_id}</strong> | API Key: {activeConnection.api_key_masked}
                </span>
              </div>
            </div>

            <button
              onClick={handleDisconnect}
              disabled={actionLoading}
              className="flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-950/40 hover:bg-rose-900/60 px-4 py-2 text-xs font-semibold text-rose-200 transition"
            >
              <Power className="h-3.5 w-3.5" />
              <span>Disconnect & Revoke</span>
            </button>
          </div>

          <div className="rounded-lg bg-slate-950/60 p-4 border border-slate-800 text-xs space-y-2">
            <div className="flex items-center gap-2 text-emerald-400 font-semibold">
              <ShieldCheck className="h-4 w-4" />
              <span>SEBI Regulatory Safeguards Active</span>
            </div>
            <p className="text-slate-400 leading-relaxed">
              Demat margin balance synchronized. Autonomous live execution remains guarded and requires supervised order approval unless explicitly switched to Authorised Live Automation.
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 space-y-5">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">
            Link Official Indian Demat Broker Gateway
          </h2>

          <form onSubmit={handleConnect} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {(['ZERODHA', 'ANGEL_ONE', 'UPSTOX'] as const).map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setSelectedBroker(b)}
                  className={`p-3 rounded-lg border text-left text-xs transition ${
                    selectedBroker === b
                      ? 'border-amber-500 bg-amber-500/10 text-white font-bold'
                      : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white'
                  }`}
                >
                  <span className="block font-bold">{b.replace('_', ' ')}</span>
                  <span className="text-[10px] text-slate-500">Official REST & WebSocket Gateway</span>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Broker Client ID</label>
                <input
                  type="text"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2.5 text-white focus:border-amber-500 focus:outline-none"
                  placeholder="e.g. ZL7892"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">API Key</label>
                <input
                  type="text"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2.5 text-white focus:border-amber-500 focus:outline-none"
                  placeholder="Official developer API key"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">API Secret / TOTP Key</label>
                <input
                  type="password"
                  value={apiSecret}
                  onChange={(e) => setApiSecret(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2.5 text-white focus:border-amber-500 focus:outline-none"
                  placeholder="Encrypted token secret"
                  required
                />
              </div>
            </div>

            {/* SEBI Compliance Checkbox Modal / Agreement */}
            <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-4 space-y-2">
              <div className="flex items-start gap-2 text-xs text-amber-200">
                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <strong>SEBI Statutory Risk & Algorithmic Disclosure:</strong>
                  <p className="text-[11px] text-slate-300 mt-1">
                    I acknowledge that equity investments are subject to market risks. InvestPilot AI 2.0 does not guarantee returns. Orders routed to this connected broker will execute with real capital. All live autonomous executions require explicit confirmation of risk boundaries.
                  </p>
                </div>
              </div>

              <label className="flex items-center gap-2 pt-2 text-xs font-semibold text-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={complianceAck}
                  onChange={(e) => setComplianceAck(e.target.checked)}
                  className="rounded border-slate-700 text-amber-600 focus:ring-0"
                />
                <span>I have read, understood, and accept the statutory compliance terms</span>
              </label>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={actionLoading || !complianceAck}
                className="flex items-center gap-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 px-6 py-2.5 text-xs font-semibold text-white shadow transition"
              >
                <span>{actionLoading ? 'Authenticating with Broker...' : 'Authenticate & Connect Broker'}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
