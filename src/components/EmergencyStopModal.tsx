'use client';
import React, { useState } from 'react';
import { AlertTriangle, ShieldAlert, X } from 'lucide-react';

interface Props {
  isOpen: boolean;
  isTriggered: boolean;
  onClose: () => void;
  onConfirm: (enable: boolean, reason: string) => Promise<void>;
}

export default function EmergencyStopModal({ isOpen, isTriggered, onClose, onConfirm }: Props) {
  const [reason, setReason] = useState(
    isTriggered ? '' : 'Volatile market conditions or manual safety intervention'
  );
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleAction = async () => {
    setLoading(true);
    try {
      await onConfirm(!isTriggered, reason);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-xl border border-red-500/40 bg-slate-900 p-6 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-slate-400 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3 text-red-400 mb-4">
          <ShieldAlert className="h-8 w-8 shrink-0 text-red-500" />
          <h2 className="text-xl font-bold tracking-tight">
            {isTriggered ? 'Disengage Emergency Stop' : 'Trigger Emergency Kill-Switch'}
          </h2>
        </div>

        <div className="space-y-4 text-sm text-slate-300">
          {isTriggered ? (
            <p>
              Emergency stop is currently <strong className="text-red-400">ACTIVE</strong>. Disengaging will permit the AI Copilot and execution agents to resume processing eligible order submissions.
            </p>
          ) : (
            <div className="rounded-lg border border-red-500/30 bg-red-950/40 p-3 text-red-200">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
                <p>
                  <strong>Immediate Action:</strong> Halts all pending automated and copilot orders across Real and Virtual portfolios. No new trades can be submitted until explicitly cleared. Existing filled positions remain preserved.
                </p>
              </div>
            </div>
          )}

          {!isTriggered && (
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                Halt Reason / Notes
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2.5 text-xs text-white focus:border-red-500 focus:outline-none"
                rows={2}
                placeholder="Specify reason for audit logs..."
              />
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={onClose}
              disabled={loading}
              className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              onClick={handleAction}
              disabled={loading}
              className={`rounded-lg px-4 py-2 text-xs font-semibold text-white shadow transition ${
                isTriggered
                  ? 'bg-emerald-600 hover:bg-emerald-500'
                  : 'bg-red-600 hover:bg-red-500'
              }`}
            >
              {loading ? 'Processing...' : isTriggered ? 'Resume System Trading' : 'HALT ALL TRADING'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
