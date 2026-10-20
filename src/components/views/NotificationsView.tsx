'use client';
import React, { useState, useEffect } from 'react';
import { Bell, CheckCircle2, AlertTriangle, Layers, Info } from 'lucide-react';

export default function NotificationsView() {
  const [notifications, setNotifications] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((d) => setNotifications(d.notifications || []));
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-500/20 text-blue-400">
            <Bell className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Updates</h1>
            <p className="text-xs text-ink-2">
              Order confirmations, new AI ideas and safety warnings in one place.
            </p>
          </div>
        </div>
      </div>

      <div className="card p-5 space-y-3">
        {notifications.length === 0 ? (
          <p className="py-8 text-center text-xs text-ink-3">No unread notifications.</p>
        ) : (
          notifications.map((n) => (
            <div key={n.id} className="rounded-lg border border-white/[0.08] bg-black/30 p-3.5 space-y-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  {n.title}
                </span>
                <span className="text-[10px] text-ink-3">{n.created_at}</span>
              </div>
              <p className="text-ink-2 pl-5.5">{n.message}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
