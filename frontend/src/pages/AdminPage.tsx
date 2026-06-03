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

type AdminTab = 'account' | 'users' | 'email' | 'webhooks' | 'system';

export function AdminPage({ onSessionChange }: { onSessionChange: () => Promise<void> }) {
  const [tab, setTab] = useState<AdminTab>('account');
  const [adminEmail, setAdminEmail] = useState('');
  const [smtp, setSmtp] = useState<SmtpSettings>({ host: '', port: 587, user: '', pass: '' });
  const [webhookApiKey, setWebhookApiKey] = useState('');
  const [dbSize, setDbSize] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [account, smtpPayload, webhookPayload, system] = await Promise.all([
          apiGet<{ email: string }>('/api/admin/account'),
          apiGet<SmtpSettings>('/api/admin/settings/smtp'),
          apiGet<WebhookApiKeySettings>('/api/admin/settings/webhook-api-key'),
          apiGet<{ databaseSizeBytes: number }>('/api/admin/system/status')
        ]);
        setAdminEmail(account.email);
        setSmtp(smtpPayload);
        setWebhookApiKey(webhookPayload.apiKey);
        setDbSize(system.databaseSizeBytes);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load admin settings');
      }
    };

    void load();
  }, []);

  const saveAdminEmail = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    try {
      await apiPut('/api/admin/account/email', { email: adminEmail });
      setMessage('Admin email updated.');
      await onSessionChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update admin email');
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

  const runExportPlaceholder = async () => {
    setError(null);
    setMessage(null);
    try {
      const response = await apiPost<{ message: string }>('/api/admin/system/export', {});
      setMessage(response.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    }
  };

  const runRestorePlaceholder = async () => {
    setError(null);
    setMessage(null);
    try {
      const response = await apiPost<{ message: string }>('/api/admin/system/restore', {});
      setMessage(response.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Restore failed');
    }
  };

  return (
    <main className="grid gap-4 md:grid-cols-[230px_1fr]">
      <aside className="rounded-3xl border-2 border-rose-200 bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">Admin Dashboard</h2>
        <div className="flex flex-col gap-2">
          {([
            ['account', 'Account'],
            ['users', 'User management'],
            ['email', 'Email management'],
            ['webhooks', 'Webhook management'],
            ['system', 'System']
          ] as Array<[AdminTab, string]>).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`rounded-2xl border px-3 py-2 text-left ${tab === id ? 'border-rose-400 bg-rose-50' : 'border-slate-200 bg-white'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </aside>

      <section className="rounded-3xl border-2 border-rose-200 bg-white p-5">
        {tab === 'account' && (
          <form className="grid gap-2" onSubmit={saveAdminEmail}>
            <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
            <p className="text-sm text-slate-600">Change administrator email address.</p>
            <input className="rounded-xl border border-slate-200 px-3 py-2" type="email" value={adminEmail} onChange={(event) => setAdminEmail(event.target.value)} required />
            <button className="rounded-2xl bg-rose-500 px-4 py-2 font-medium text-white" type="submit">
              Save admin email
            </button>
          </form>
        )}

        {tab === 'users' && (
          <div className="grid gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">User management</h1>
            <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-slate-600">Placeholder tab for user management tools.</p>
          </div>
        )}

        {tab === 'email' && (
          <div className="grid gap-4">
            <h1 className="text-2xl font-semibold tracking-tight">Email management</h1>
            <form className="grid gap-2" onSubmit={saveSmtp}>
              <input className="rounded-xl border border-slate-200 px-3 py-2" placeholder="SMTP host" value={smtp.host} onChange={(event) => setSmtp((prev) => ({ ...prev, host: event.target.value }))} required />
              <input className="rounded-xl border border-slate-200 px-3 py-2" placeholder="SMTP port" type="number" value={smtp.port} onChange={(event) => setSmtp((prev) => ({ ...prev, port: Number(event.target.value) }))} required />
              <input className="rounded-xl border border-slate-200 px-3 py-2" placeholder="SMTP user" value={smtp.user} onChange={(event) => setSmtp((prev) => ({ ...prev, user: event.target.value }))} required />
              <input className="rounded-xl border border-slate-200 px-3 py-2" placeholder="SMTP pass" type="password" value={smtp.pass} onChange={(event) => setSmtp((prev) => ({ ...prev, pass: event.target.value }))} required />
              <button className="rounded-2xl bg-rose-500 px-4 py-2 font-medium text-white" type="submit">
                Save SMTP settings
              </button>
            </form>
          </div>
        )}

        {tab === 'webhooks' && (
          <div className="grid gap-4">
            <h1 className="text-2xl font-semibold tracking-tight">Webhook management</h1>
            <form className="grid gap-2" onSubmit={saveWebhookApiKey}>
              <input className="rounded-xl border border-slate-200 px-3 py-2" placeholder="Webhook API key" value={webhookApiKey} onChange={(event) => setWebhookApiKey(event.target.value)} required />
              <button className="rounded-2xl bg-rose-500 px-4 py-2 font-medium text-white" type="submit">
                Save webhook API key
              </button>
            </form>
            <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-slate-600">Placeholder area for webhook diagnostics and delivery logs.</p>
          </div>
        )}

        {tab === 'system' && (
          <div className="grid gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">System</h1>
            <p className="text-sm text-slate-600">Database size: {dbSize.toLocaleString()} bytes</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="rounded-2xl border border-rose-300 px-4 py-2" onClick={runExportPlaceholder}>
                Export database (placeholder)
              </button>
              <button type="button" className="rounded-2xl border border-rose-300 px-4 py-2" onClick={runRestorePlaceholder}>
                Restore database (placeholder)
              </button>
            </div>
          </div>
        )}

        {message && <p className="mt-3 text-sm text-emerald-700">{message}</p>}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </section>
    </main>
  );
}
