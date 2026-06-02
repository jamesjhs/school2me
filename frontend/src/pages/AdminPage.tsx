import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { apiGet, apiPost, apiPut } from '../api/client';

interface SmtpSettings {
  host: string;
  port: number;
  user: string;
  pass: string;
}

export function AdminPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);
  const [smtp, setSmtp] = useState<SmtpSettings>({ host: '', port: 587, user: '', pass: '' });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        await apiGet('/api/admin/auth/me');
        if (mounted) setLoggedIn(true);
      } catch {
        if (mounted) setLoggedIn(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!loggedIn) return;

    const loadSmtp = async () => {
      try {
        const payload = await apiGet<SmtpSettings>('/api/admin/settings/smtp');
        setSmtp(payload);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load SMTP');
      }
    };

    loadSmtp();
  }, [loggedIn]);

  const submitLogin = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    try {
      await apiPost('/api/admin/auth/login', { email, password });
      setLoggedIn(true);
      setMessage('Admin session started.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  };

  const saveSmtp = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    try {
      await apiPut('/api/admin/settings/smtp', smtp);
      setMessage('SMTP settings updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save SMTP');
    }
  };

  return (
    <main className="grid gap-4">
      <section className="rounded-3xl border-2 border-rose-200 bg-white p-5">
        <h1 className="text-2xl font-semibold tracking-tight">Admin Panel</h1>
        <p className="mt-1 text-sm text-slate-600">Separate secure route for operational settings.</p>

        {!loggedIn ? (
          <form className="mt-4 grid gap-2" onSubmit={submitLogin}>
            <input className="rounded-xl border border-slate-200 px-3 py-2" placeholder="Admin email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            <input className="rounded-xl border border-slate-200 px-3 py-2" placeholder="Password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            <button className="rounded-2xl bg-rose-500 px-4 py-2 font-medium text-white" type="submit">
              Login
            </button>
          </form>
        ) : (
          <form className="mt-4 grid gap-2" onSubmit={saveSmtp}>
            <input className="rounded-xl border border-slate-200 px-3 py-2" placeholder="SMTP host" value={smtp.host} onChange={(event) => setSmtp((prev) => ({ ...prev, host: event.target.value }))} required />
            <input className="rounded-xl border border-slate-200 px-3 py-2" placeholder="SMTP port" type="number" value={smtp.port} onChange={(event) => setSmtp((prev) => ({ ...prev, port: Number(event.target.value) }))} required />
            <input className="rounded-xl border border-slate-200 px-3 py-2" placeholder="SMTP user" value={smtp.user} onChange={(event) => setSmtp((prev) => ({ ...prev, user: event.target.value }))} required />
            <input className="rounded-xl border border-slate-200 px-3 py-2" placeholder="SMTP pass" type="password" value={smtp.pass} onChange={(event) => setSmtp((prev) => ({ ...prev, pass: event.target.value }))} required />
            <button className="rounded-2xl bg-rose-500 px-4 py-2 font-medium text-white" type="submit">
              Save SMTP
            </button>
          </form>
        )}

        {message && <p className="mt-3 text-sm text-emerald-700">{message}</p>}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </section>
    </main>
  );
}
