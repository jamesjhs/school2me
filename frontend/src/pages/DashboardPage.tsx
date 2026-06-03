import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiDelete, apiGet, apiPost, apiPut } from '../api/client';

interface EventItem {
  id: string;
  title: string;
  startTime: string;
  location: string | null;
}

interface ProfilePayload {
  family: { routing_alias: string };
  user: { email: string };
  children: Array<{ id: string; first_name: string; class_name: string | null; teacher_name: string | null }>;
  activities: Array<{ id: string; child_id: string; name: string; activity_type: string }>;
}

interface SummaryPayload {
  userEmail: string;
  forwardingEmail: string;
  calendarIcsUrl: string;
  rssUrl: string;
}

interface InboxItem {
  id: string;
  sender: string;
  subject: string | null;
  bodyText: string | null;
  processedAt: string;
}

export function DashboardPage({ onSessionChange }: { onSessionChange: () => Promise<void> }) {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<SummaryPayload | null>(null);
  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [newChildName, setNewChildName] = useState('');
  const [newClassName, setNewClassName] = useState('');
  const [newTeacherName, setNewTeacherName] = useState('');
  const [childId, setChildId] = useState('');
  const [activityName, setActivityName] = useState('');
  const [activityType, setActivityType] = useState<'school_club' | 'hobby' | 'sports' | 'volunteering'>('hobby');
  const [shareName, setShareName] = useState('');
  const [sharePassword, setSharePassword] = useState('');
  const [invite, setInvite] = useState<{ shareLink: string; qrText: string; expiresAt: string } | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = async () => {
    try {
      const [summaryPayload, profilePayload, inboxPayload, eventsPayload] = await Promise.all([
        apiGet<SummaryPayload>('/api/dashboard/summary'),
        apiGet<ProfilePayload>('/api/settings/profile'),
        apiGet<{ emails: InboxItem[] }>('/api/dashboard/inbox'),
        apiGet<{ events: EventItem[] }>('/api/dashboard/events')
      ]);
      setSummary(summaryPayload);
      setProfile(profilePayload);
      const defaultChildId = profilePayload.children.length > 0 ? profilePayload.children[0].id : '';
      setChildId((prev) => prev || defaultChildId);
      setInbox(inboxPayload.emails);
      setEvents(eventsPayload.events);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load dashboard');
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadDashboard();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const submitChild = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);

    try {
      await apiPost('/api/settings/children', {
        firstName: newChildName,
        className: newClassName,
        teacherName: newTeacherName
      });
      setNewChildName('');
      setNewClassName('');
      setNewTeacherName('');
      setMessage('Child added.');
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add child');
    }
  };

  const submitActivity = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!childId) {
      setError('Select a child first.');
      return;
    }

    try {
      await apiPost('/api/settings/activities', {
        childId,
        name: activityName,
        activityType
      });
      setActivityName('');
      setMessage('Activity added.');
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add activity');
    }
  };

  const createInvite = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);

    try {
      const payload = await apiPost<{ shareLink: string; qrText: string; expiresAt: string }>('/api/settings/invites', {
        shareName,
        sharePassword
      });

      setInvite(payload);
      setMessage('Invite generated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate invite');
    }
  };

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);

    try {
      await apiPut('/api/settings/account/password', { currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setMessage('Password updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update password');
    }
  };

  const deleteFamily = async () => {
    if (!window.confirm('Delete family group and all related data?')) return;
    setError(null);
    setMessage(null);

    try {
      await apiDelete('/api/settings/family');
      await onSessionChange();
      navigate('/auth', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete family group');
    }
  };

  const deleteAccount = async () => {
    if (!window.confirm('Delete your account?')) return;
    setError(null);
    setMessage(null);

    try {
      await apiDelete('/api/settings/account');
      await onSessionChange();
      navigate('/auth', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete account');
    }
  };

  return (
    <main className="grid gap-4">
      <section className="rounded-3xl border-2 border-rose-200 bg-white p-5">
        <h1 className="text-2xl font-semibold tracking-tight">User Dashboard</h1>
        <p className="mt-1 text-sm text-slate-600">All family operations live here.</p>
        {summary && (
          <div className="mt-3 grid gap-2 text-sm">
            <p>
              Forwarding email: <span className="font-semibold">{summary.forwardingEmail}</span>
            </p>
            <p>
              Personalized ICS feed: <a className="text-rose-700 underline" href={summary.calendarIcsUrl}>{summary.calendarIcsUrl}</a>
            </p>
            <p>
              Personalized RSS feed: <a className="text-rose-700 underline" href={summary.rssUrl}>{summary.rssUrl}</a>
            </p>
          </div>
        )}
      </section>

      <section className="rounded-3xl border-2 border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Children</h2>
        <form className="mt-3 grid gap-2 md:grid-cols-3" onSubmit={submitChild}>
          <input className="rounded-xl border border-slate-200 px-3 py-2" placeholder="First name" value={newChildName} onChange={(event) => setNewChildName(event.target.value)} required />
          <input className="rounded-xl border border-slate-200 px-3 py-2" placeholder="Class name" value={newClassName} onChange={(event) => setNewClassName(event.target.value)} />
          <input className="rounded-xl border border-slate-200 px-3 py-2" placeholder="Teacher name" value={newTeacherName} onChange={(event) => setNewTeacherName(event.target.value)} />
          <button className="rounded-2xl bg-rose-500 px-4 py-2 font-medium text-white md:col-span-3" type="submit">
            Add child
          </button>
        </form>
        <ul className="mt-3 grid gap-2">
          {profile?.children.map((child) => (
            <li key={child.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-3 text-sm">
              <span className="font-semibold">{child.first_name}</span> · {child.class_name || 'No class'} · {child.teacher_name || 'No teacher'}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-3xl border-2 border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Activities</h2>
        <form className="mt-3 grid gap-2 md:grid-cols-3" onSubmit={submitActivity}>
          <select className="rounded-xl border border-slate-200 px-3 py-2" value={childId} onChange={(event) => setChildId(event.target.value)}>
            <option value="">Select child</option>
            {profile?.children.map((child) => (
              <option key={child.id} value={child.id}>{child.first_name}</option>
            ))}
          </select>
          <input className="rounded-xl border border-slate-200 px-3 py-2" placeholder="Activity name" value={activityName} onChange={(event) => setActivityName(event.target.value)} required />
          <select className="rounded-xl border border-slate-200 px-3 py-2" value={activityType} onChange={(event) => setActivityType(event.target.value as typeof activityType)}>
            <option value="school_club">School Club</option>
            <option value="hobby">Hobby</option>
            <option value="sports">Sports</option>
            <option value="volunteering">Volunteering</option>
          </select>
          <button className="rounded-2xl bg-rose-500 px-4 py-2 font-medium text-white md:col-span-3" type="submit">
            Add activity
          </button>
        </form>
      </section>

      <section className="rounded-3xl border-2 border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Family member invites</h2>
        <form className="mt-3 grid gap-2 md:grid-cols-2" onSubmit={createInvite}>
          <input className="rounded-xl border border-slate-200 px-3 py-2" placeholder="Share name" value={shareName} onChange={(event) => setShareName(event.target.value)} required />
          <input className="rounded-xl border border-slate-200 px-3 py-2" placeholder="Share password" type="password" value={sharePassword} onChange={(event) => setSharePassword(event.target.value)} required />
          <button className="rounded-2xl bg-rose-500 px-4 py-2 font-medium text-white md:col-span-2" type="submit">
            Generate invite + QR payload
          </button>
        </form>
        {invite && (
          <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm">
            <p>Share link: <span className="font-medium">{invite.shareLink}</span></p>
            <p>QR payload: <span className="font-mono">{invite.qrText}</span></p>
            <p>Expires: {new Date(invite.expiresAt).toLocaleString()}</p>
          </div>
        )}
      </section>

      <section className="rounded-3xl border-2 border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Received emails inbox</h2>
        <div className="mt-3 grid gap-2">
          {inbox.length === 0 && <p className="text-sm text-slate-600">No emails yet.</p>}
          {inbox.map((item) => (
            <article key={item.id} className="rounded-2xl border border-slate-200 p-3 text-sm">
              <p className="font-semibold">{item.subject || 'No subject'}</p>
              <p className="text-slate-600">From: {item.sender}</p>
              <p className="text-slate-600">{new Date(item.processedAt).toLocaleString()}</p>
              {item.bodyText && <p className="mt-2 line-clamp-4">{item.bodyText}</p>}
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border-2 border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Calendar of events</h2>
        <div className="mt-3 grid gap-2">
          {events.length === 0 && <p className="text-sm text-slate-600">Calendar placeholder: no events yet.</p>}
          {events.map((event) => (
            <div key={event.id} className="rounded-2xl border border-slate-200 p-3 text-sm">
              <p className="font-semibold">{event.title}</p>
              <p>{new Date(event.startTime).toLocaleString()}</p>
              {event.location && <p>📍 {event.location}</p>}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border-2 border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold">To-do list</h2>
        <p className="mt-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-slate-600">Placeholder for upcoming to-do management.</p>
      </section>

      <section className="rounded-3xl border-2 border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Account actions</h2>
        <form className="mt-3 grid gap-2 md:grid-cols-2" onSubmit={changePassword}>
          <input className="rounded-xl border border-slate-200 px-3 py-2" placeholder="Current password (if set)" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
          <input className="rounded-xl border border-slate-200 px-3 py-2" placeholder="New password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required />
          <button className="rounded-2xl bg-rose-500 px-4 py-2 font-medium text-white md:col-span-2" type="submit">
            Change password
          </button>
        </form>

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="rounded-2xl border border-amber-300 px-4 py-2" onClick={deleteFamily}>
            Delete family group
          </button>
          <button type="button" className="rounded-2xl border border-red-300 px-4 py-2 text-red-700" onClick={deleteAccount}>
            Delete account
          </button>
        </div>
      </section>

      {message && <p className="text-sm text-emerald-700">{message}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </main>
  );
}
