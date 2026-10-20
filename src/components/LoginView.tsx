'use client';
import React, { useState } from 'react';
import { Lock, ShieldCheck, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui';

interface Props {
  onSignedIn: (user: { id: string; email: string; name: string }) => void;
}

/**
 * Minimal sign-in screen. The server verifies the password and issues an
 * HTTP-only session cookie; nothing about the session is stored in the browser.
 */
export default function LoginView({ onSignedIn }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(payload?.error ?? 'Sign-in failed. Please try again.');
        return;
      }
      setPassword('');
      onSignedIn(payload.user);
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#070a12] px-4 py-10">
      <div className="w-full max-w-md space-y-5">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-blue-500/15 p-2.5 text-blue-300">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">InvestPilot AI 2.0</h1>
            <p className="text-xs text-ink-2">Sign in to your own portfolios and records.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-4 p-6">
          <div>
            <label htmlFor="login-email" className="mb-1 block text-xs text-ink-2">
              Email
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field w-full"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="login-password" className="mb-1 block text-xs text-ink-2">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field w-full"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <Button type="submit" variant="primary" size="md" className="w-full" disabled={submitting}>
            <Lock className="mr-1.5 h-3.5 w-3.5" />
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>

          <p className="text-[11px] leading-relaxed text-ink-3">
            Credentials are provisioned by the operator with{' '}
            <code className="rounded bg-white/[0.06] px-1 py-0.5 text-ink-2">npm run auth:set-password</code>.
            There is no default account, and this build is a simulation tool only.
          </p>
        </form>
      </div>
    </div>
  );
}
