'use client';
import React, { useState, useEffect } from 'react';
import {
  Plug,
  CheckCircle2,
  Lock,
  Power,
} from 'lucide-react';

interface Props {
  onRefresh: () => void;
}

export default function BrokerView({ onRefresh }: Props) {
  const [connections, setConnections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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
            <h1 className="text-lg font-bold text-white">Broker Integration Status (Unavailable)</h1>
            <p className="text-xs text-slate-400">
              No live broker adapter is implemented. Do not enter broker credentials in this demo build.
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

      <div className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-6 space-y-4">
        <div className="flex items-start gap-3">
          <Lock className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          <div>
            <h2 className="font-bold text-amber-200">Live broker connection disabled in this build</h2>
            <p className="mt-2 text-xs leading-relaxed text-amber-100/80">
              This version does not implement verified Zerodha, Angel One, or Upstox authentication, order submission, broker-confirmed fills, or account-balance reconciliation.
              Do not enter broker API keys, API secrets, PINs, or TOTP codes here. No credentials are needed for virtual trading.
            </p>
          </div>
        </div>
        {activeConnection ? (
          <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-4 space-y-3">
            <p className="text-xs font-semibold text-slate-200">An old broker connection record exists in the local database, but it is not proof of an authenticated session.</p>
            <p className="text-xs text-slate-400">Stored record: {activeConnection.broker_name} · {activeConnection.client_id} · status {activeConnection.status}</p>
            <button
              onClick={handleDisconnect}
              disabled={actionLoading}
              className="flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-950/40 hover:bg-rose-900/60 px-4 py-2 text-xs font-semibold text-rose-200 transition disabled:opacity-50"
            >
              <Power className="h-3.5 w-3.5" />
              <span>{actionLoading ? 'Clearing record...' : 'Clear saved connection record'}</span>
            </button>
          </div>
        ) : (
          <p className="text-xs text-slate-300">Status: no verified broker session. Real-money execution stays blocked; use the virtual simulator.</p>
        )}
        {loading && <p className="text-xs text-slate-500">Checking saved connection records…</p>}
      </div>
    </div>
  );
}
