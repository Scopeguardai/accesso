'use client';

import { useState, type FormEvent } from 'react';
import FossefallLogo from '@/components/workspace/FossefallLogo';
import '@/components/workspace/workspace.css';
import './landing.css';

export default function LoginForm({ next }: { next: string }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function signIn(e: FormEvent) {
    e.preventDefault();
    if (!password) {
      setError('Type the team password.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Signing in did not work. Try again.');
      window.location.assign(next);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="ws lp lp-login">
      <form className="lp-login-card" onSubmit={signIn} noValidate>
        <span className="lp-logo">
          <FossefallLogo variant="full" />
        </span>
        <h1>Sign in to Voila</h1>
        <p className="lp-sub">Presentations in your clients&rsquo; brands, written and designed by an agent.</p>
        <label className="lp-field">
          <span>Team password</span>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError('');
            }}
            aria-invalid={error ? true : undefined}
          />
        </label>
        {error && (
          <p className="lp-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn-ink lp-wide" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="lp-hint">Ask whoever looks after Voila for the password.</p>
      </form>
    </main>
  );
}
