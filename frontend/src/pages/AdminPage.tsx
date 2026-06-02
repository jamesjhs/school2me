import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { apiGet, apiPost, apiPut } from '../api/client';

interface SmtpSettings {
  host: string;
  port: number;
  user: string;
  pass: string;
}

interface WebhookApiKeySettings {
  apiKey: string;
}

export function AdminPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);
  const [smtp, setSmtp] = useState<SmtpSettings>({ host: '', port: 587, user: '', pass: '' });
  const [webhookApiKey, setWebhookApiKey] = useState('');
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

    const loadSettings = async () => {
      try {
        const [smtpPayload, webhookPayload] = await Promise.all([
          apiGet<SmtpSettings>('/api/admin/settings/smtp'),
          apiGet<WebhookApiKeySettings>('/api/admin/settings/webhook-api-key')
        ]);
        setSmtp(smtpPayload);
        setWebhookApiKey(webhookPayload.apiKey);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load admin settings');
      }
    };

    loadSettings();
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

  const saveWebhookApiKey = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    try {
      await apiPut('/api/admin/settings/webhook-api-key', { apiKey: webhookApiKey });
      setMessage('Webhook API key updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save webhook API key');
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
          <div className="mt-4 grid gap-4">
            <form className="grid gap-2" onSubmit={saveSmtp}>
              <input className="rounded-xl border border-slate-200 px-3 py-2" placeholder="SMTP host" value={smtp.host} onChange={(event) => setSmtp((prev) => ({ ...prev, host: event.target.value }))} required />
              <input className="rounded-xl border border-slate-200 px-3 py-2" placeholder="SMTP port" type="number" value={smtp.port} onChange={(event) => setSmtp((prev) => ({ ...prev, port: Number(event.target.value) }))} required />
              <input className="rounded-xl border border-slate-200 px-3 py-2" placeholder="SMTP user" value={smtp.user} onChange={(event) => setSmtp((prev) => ({ ...prev, user: event.target.value }))} required />
              <input className="rounded-xl border border-slate-200 px-3 py-2" placeholder="SMTP pass" type="password" value={smtp.pass} onChange={(event) => setSmtp((prev) => ({ ...prev, pass: event.target.value }))} required />
              <button className="rounded-2xl bg-rose-500 px-4 py-2 font-medium text-white" type="submit">
                Save SMTP
              </button>
            </form>

            <form className="grid gap-2" onSubmit={saveWebhookApiKey}>
              <input className="rounded-xl border border-slate-200 px-3 py-2" placeholder="Webhook API key" value={webhookApiKey} onChange={(event) => setWebhookApiKey(event.target.value)} required />
              <button className="rounded-2xl bg-rose-500 px-4 py-2 font-medium text-white" type="submit">
                Save Webhook API Key
              </button>
            </form>
          </div>
        )}

        {message && <p className="mt-3 text-sm text-emerald-700">{message}</p>}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </section>
    </main>
  );
}
