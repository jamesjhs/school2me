import type { FormEvent } from 'react';
import { useMemo, useState } from 'react';
import { apiPost } from '../api/client';
import { useAsyncState } from '../hooks/useAsyncState';

type AuthMode = 'magic' | 'email2fa' | 'joinShare' | 'joinLink';

const turnstileSiteKey = import.meta.env.VITE_CF_TURNSTILE_SITE_KEY ?? '';

export function AuthPage() {
  const [mode, setMode] = useState<AuthMode>('magic');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState(new URLSearchParams(window.location.search).get('magicToken') ?? '');
  const [code, setCode] = useState('');
  const [shareName, setShareName] = useState('');
  const [sharePassword, setSharePassword] = useState('');
  const [shareLinkToken, setShareLinkToken] = useState('');
  const [turnstileResponse, setTurnstileResponse] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const { loading, error, run } = useAsyncState();

  const title = useMemo(() => {
    switch (mode) {
      case 'magic':
        return 'Magic Link Login';
      case 'email2fa':
        return 'Email 2FA Login';
      case 'joinShare':
        return 'Join Family via Share Name';
      default:
        return 'Join Family via Share Link';
    }
  }, [mode]);

  const requestMagic = async (event: FormEvent) => {
    event.preventDefault();
    const result = await run(() => apiPost<{ ok: boolean }>('/api/auth/magic-request', {
      email,
      'cf-turnstile-response': turnstileResponse
    }));

    if (result?.ok) {
      setMessage('Magic link sent to your inbox.');
    }
  };

  const verifyMagic = async (event: FormEvent) => {
    event.preventDefault();
    const result = await run(() => apiPost<{ ok: boolean }>('/api/auth/magic-verify', { token }));
    if (result?.ok) {
      setMessage('Logged in via magic link.');
    }
  };

  const request2fa = async (event: FormEvent) => {
    event.preventDefault();
    const result = await run(() => apiPost<{ ok: boolean }>('/api/auth/email-2fa/request', {
      email,
      'cf-turnstile-response': turnstileResponse
    }));

    if (result?.ok) {
      setMessage('2FA code sent to email.');
    }
  };

  const verify2fa = async (event: FormEvent) => {
    event.preventDefault();
    const result = await run(() => apiPost<{ ok: boolean }>('/api/auth/email-2fa/verify', { email, code }));
    if (result?.ok) {
      setMessage('Logged in via email 2FA.');
    }
  };

  const submitJoinShare = async (event: FormEvent) => {
    event.preventDefault();
    const result = await run(() => apiPost<{ ok: boolean }>('/api/auth/join-share', {
      email,
      shareName,
      sharePassword,
      'cf-turnstile-response': turnstileResponse
    }));

    if (result?.ok) {
      setMessage('Joined family successfully.');
    }
  };

  const submitJoinLink = async (event: FormEvent) => {
    event.preventDefault();
    const result = await run(() => apiPost<{ ok: boolean }>('/api/auth/join-link', {
      email,
      token: shareLinkToken,
      'cf-turnstile-response': turnstileResponse
    }));

    if (result?.ok) {
      setMessage('Joined family via link token.');
    }
  };

  return (
    <main className="grid gap-4 md:grid-cols-[240px_1fr]">
      <aside className="rounded-3xl border-2 border-rose-200 bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">Auth Modes</h2>
        <div className="flex flex-col gap-2">
          {([
            ['magic', 'Magic Link'],
            ['email2fa', 'Email 2FA'],
            ['joinShare', 'Join (Share Name + Password)'],
            ['joinLink', 'Join (Share Link/QR Token)']
          ] as Array<[AuthMode, string]>).map(([id, label]) => (
            <button
              key={id}
              className={`rounded-2xl border px-3 py-2 text-left ${mode === id ? 'border-rose-400 bg-rose-50' : 'border-slate-200 bg-white'}`}
              onClick={() => setMode(id)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      </aside>

      <section className="rounded-3xl border-2 border-rose-200 bg-white p-5">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-slate-600">Mobile-first passwordless access with bot protection.</p>

        <div className="mt-4 rounded-2xl border border-dashed border-rose-300 bg-rose-50 p-3 text-sm">
          <div className="font-medium">Cloudflare Turnstile Container</div>
          <div className="text-slate-600">Site key: {turnstileSiteKey || '(set VITE_CF_TURNSTILE_SITE_KEY)'}</div>
          <input
            placeholder="Paste cf-turnstile-response token"
            className="mt-2 w-full rounded-xl border border-rose-200 px-3 py-2"
            value={turnstileResponse}
            onChange={(event) => setTurnstileResponse(event.target.value)}
          />
        </div>

        <form className="mt-4 grid gap-3" onSubmit={mode === 'magic' ? requestMagic : mode === 'email2fa' ? request2fa : mode === 'joinShare' ? submitJoinShare : submitJoinLink}>
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

          {mode === 'magic' && (
            <>
              <button type="submit" className="rounded-2xl bg-rose-500 px-4 py-2 font-medium text-white">
                Request Magic Link
              </button>
              <label className="grid gap-1 text-sm">
                Magic Token
                <input
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  className="rounded-xl border border-slate-200 px-3 py-2"
                />
              </label>
              <button type="button" className="rounded-2xl border border-rose-300 px-4 py-2" onClick={verifyMagic}>
                Verify Magic Token
              </button>
            </>
          )}

          {mode === 'email2fa' && (
            <>
              <button type="submit" className="rounded-2xl bg-rose-500 px-4 py-2 font-medium text-white">
                Request Email Code
              </button>
              <label className="grid gap-1 text-sm">
                2FA Code
                <input
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  className="rounded-xl border border-slate-200 px-3 py-2"
                />
              </label>
              <button type="button" className="rounded-2xl border border-rose-300 px-4 py-2" onClick={verify2fa}>
                Verify Code
              </button>
            </>
          )}

          {mode === 'joinShare' && (
            <>
              <label className="grid gap-1 text-sm">
                Share Name
                <input
                  value={shareName}
                  onChange={(event) => setShareName(event.target.value)}
                  className="rounded-xl border border-slate-200 px-3 py-2"
                />
              </label>
              <label className="grid gap-1 text-sm">
                Share Password
                <input
                  type="password"
                  value={sharePassword}
                  onChange={(event) => setSharePassword(event.target.value)}
                  className="rounded-xl border border-slate-200 px-3 py-2"
                />
              </label>
              <button type="submit" className="rounded-2xl bg-rose-500 px-4 py-2 font-medium text-white">
                Join Family
              </button>
            </>
          )}

          {mode === 'joinLink' && (
            <>
              <label className="grid gap-1 text-sm">
                Share Link Token (from link/QR)
                <input
                  value={shareLinkToken}
                  onChange={(event) => setShareLinkToken(event.target.value)}
                  className="rounded-xl border border-slate-200 px-3 py-2"
                />
              </label>
              <button type="submit" className="rounded-2xl bg-rose-500 px-4 py-2 font-medium text-white">
                Join via Link Token
              </button>
            </>
          )}

          {loading && <p className="text-sm text-slate-500">Submitting…</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {message && <p className="text-sm text-emerald-700">{message}</p>}
        </form>
      </section>
    </main>
  );
}
