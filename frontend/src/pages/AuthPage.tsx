import type { FormEvent } from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiPost } from '../api/client';
import { TurnstileWidget } from '../components/TurnstileWidget';
import { useAsyncState } from '../hooks/useAsyncState';

type LoginMethod = 'password' | 'magic';

const turnstileSiteKey = import.meta.env.VITE_CF_TURNSTILE_SITE_KEY ?? '';

export function AuthPage({ onAuthenticated }: { onAuthenticated: () => Promise<void> }) {
  const navigate = useNavigate();
  const [method, setMethod] = useState<LoginMethod>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState(new URLSearchParams(window.location.search).get('magicToken') ?? '');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileResetSignal, setTurnstileResetSignal] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const { loading, error, run } = useAsyncState();

  const resetTurnstile = () => setTurnstileResetSignal((value) => value + 1);

  const submitPassword = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);

    const result = await run(() =>
      apiPost<{ ok: boolean; destination: string }>('/api/auth/password-login', {
        email,
        password,
        'cf-turnstile-response': turnstileToken
      })
    );

    if (!result?.ok) {
      resetTurnstile();
      return;
    }

    await onAuthenticated();
    navigate(result.destination, { replace: true });
  };

  const requestMagic = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);

    const result = await run(() =>
      apiPost<{ ok: boolean }>('/api/auth/magic-request', {
        email,
        'cf-turnstile-response': turnstileToken
      })
    );

    if (result?.ok) {
      setMessage('Magic link sent to your inbox.');
      resetTurnstile();
    }
  };

  const verifyMagic = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);

    const result = await run(() =>
      apiPost<{ ok: boolean; destination: string }>('/api/auth/magic-verify', {
        token
      })
    );

    if (!result?.ok) {
      return;
    }

    await onAuthenticated();
    navigate(result.destination, { replace: true });
  };

  return (
    <main className="mx-auto max-w-2xl rounded-3xl border-2 border-rose-200 bg-white p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Login</h1>
      <p className="mt-1 text-sm text-slate-600">Login with email and password, or email 2FA magic link.</p>

      <div className="mt-4 grid gap-3">
        <label className="grid gap-1 text-sm">
          Method
          <select className="rounded-xl border border-slate-200 px-3 py-2" value={method} onChange={(event) => setMethod(event.target.value as LoginMethod)}>
            <option value="password">Password</option>
            <option value="magic">2FA via magic link</option>
          </select>
        </label>
      </div>

      <form className="mt-4 grid gap-3" onSubmit={method === 'password' ? submitPassword : requestMagic}>
        <label className="grid gap-1 text-sm">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2"
          />
        </label>

        {method === 'password' && (
          <label className="grid gap-1 text-sm">
            Password
            <input
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2"
            />
          </label>
        )}

        <TurnstileWidget siteKey={turnstileSiteKey} resetSignal={turnstileResetSignal} onTokenChange={setTurnstileToken} />

        <button type="submit" className="rounded-2xl bg-rose-500 px-4 py-2 font-medium text-white" disabled={loading || !turnstileToken}>
          {method === 'password' ? 'Login with Password' : 'Send Magic Link'}
        </button>
      </form>

      {method === 'magic' && (
        <form className="mt-4 grid gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-4" onSubmit={verifyMagic}>
          <label className="grid gap-1 text-sm">
            Magic Token
            <input value={token} onChange={(event) => setToken(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2" required />
          </label>
          <button type="submit" className="rounded-2xl border border-rose-300 px-4 py-2">
            Verify Magic Token
          </button>
        </form>
      )}

      {loading && <p className="mt-3 text-sm text-slate-500">Submitting…</p>}
      {error && <p className="mt-3 whitespace-pre-line break-words text-sm text-red-600">{error}</p>}
      {message && <p className="mt-3 text-sm text-emerald-700">{message}</p>}
    </main>
  );
}
