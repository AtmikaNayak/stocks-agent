'use client';
import React, { useState, useEffect } from 'react';
import {
  Activity,
  Play,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Server,
  Layers
} from 'lucide-react';

export default function SystemHealthView() {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState<string | null>(null);

  const fetchHealth = () => {
    fetch('/api/system')
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  const handleTriggerJob = async (jobName: string) => {
    setTriggering(jobName);
    try {
      const res = await fetch('/api/system', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'trigger_job', jobName })
      });
      if (res.ok) fetchHealth();
    } finally {
      setTriggering(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400">
            <Activity className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">System status</h1>
            <p className="text-xs text-ink-2">
              Whether the background jobs ran, where the data came from, and an unchangeable log of what happened.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-950/20 px-3 py-1.5 text-emerald-300 font-semibold">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            Worker Engine: RUNNING
          </span>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center text-xs text-ink-2">Checking worker heartbeat...</div>
      ) : (
        <div className="space-y-6">
          {/* Scheduled Background Jobs Table */}
          <div className="card p-5 space-y-4">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              Background Scheduler Recurring Jobs
            </h2>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-white/[0.08] text-[11px] uppercase tracking-wider text-ink-2 font-sans">
                    <th className="pb-2">Job Name</th>
                    <th className="pb-2">Description</th>
                    <th className="pb-2">Interval</th>
                    <th className="pb-2">Last Run</th>
                    <th className="pb-2">Status</th>
                    <th className="pb-2 text-right font-sans">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {data?.jobs?.map((j: any) => (
                    <tr key={j.id} className="hover:bg-white/[0.03]">
                      <td className="py-2.5 font-bold text-white">{j.job_name}</td>
                      <td className="py-2.5 text-ink-2 font-sans text-xs max-w-xs truncate">{j.description}</td>
                      <td className="py-2.5 text-ink-2">{j.interval_seconds}s</td>
                      <td className="py-2.5 text-ink-3 text-[11px]">{j.last_run_at || 'Pending'}</td>
                      <td className="py-2.5">
                        <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded font-semibold font-sans">
                          {j.last_run_status || 'READY'}
                        </span>
                      </td>
                      <td className="py-2.5 text-right font-sans">
                        <button
                          onClick={() => handleTriggerJob(j.job_name)}
                          disabled={triggering === j.job_name}
                          className="rounded bg-white/[0.06] hover:bg-white/[0.10] px-2.5 py-1 text-[11px] text-ink transition"
                        >
                          {triggering === j.job_name ? 'Running...' : 'Run Now'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Market Data Freshness Provenance */}
          <div className="card p-5 space-y-4">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              Market Data Freshness Provenance
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
              {data?.dataFreshness?.map((df: any, idx: number) => (
                <div key={idx} className="rounded-lg border border-white/[0.08] bg-black/30 p-3.5 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white font-sans">{df.provider}</span>
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded font-semibold font-sans">
                      {df.freshness_status}
                    </span>
                  </div>
                  <div className="text-ink-2 text-xs">Recorded points: {df.count} candles</div>
                  <div className="text-[11px] text-ink-3">Last Synced: {df.last_retrieved}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Immutable Audit Trail */}
          <div className="card p-5 space-y-4">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              Immutable System & Order Audit Trail
            </h2>

            <div className="space-y-2 max-h-80 overflow-y-auto pr-1 text-xs">
              {data?.auditLogs?.map((log: any) => (
                <div key={log.id} className="rounded-lg border border-white/[0.08] bg-black/30 p-2.5 flex items-start justify-between gap-4">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white">{log.action_type}</span>
                      <span className="text-[10px] bg-white/[0.06] text-ink-2 px-1.5 py-0.5 rounded font-mono">
                        {log.actor}
                      </span>
                    </div>
                    <p className="text-ink-2 text-xs">{log.details}</p>
                  </div>
                  <span className="text-[10px] text-ink-3 shrink-0 font-mono">{log.created_at}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
