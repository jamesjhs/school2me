import type { FormEvent } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost } from '../api/client';

interface ProfilePayload {
  family: { routing_alias: string };
  children: Array<{ id: string; first_name: string; class_name: string | null; teacher_name: string | null }>;
  activities: Array<{ id: string; child_id: string; name: string; activity_type: string }>;
}

export function SettingsPage() {
  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [newChildName, setNewChildName] = useState('');
  const [newClassName, setNewClassName] = useState('');
  const [newTeacherName, setNewTeacherName] = useState('');
  const [childId, setChildId] = useState('');
  const [activityName, setActivityName] = useState('');
  const [activityType, setActivityType] = useState<'school_club' | 'hobby' | 'sports' | 'volunteering'>('hobby');
  const [shareName, setShareName] = useState('');
  const [sharePassword, setSharePassword] = useState('');
  const [invite, setInvite] = useState<{ shareLink: string; qrText: string; expiresAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    try {
      const payload = await apiGet<ProfilePayload>('/api/settings/profile');
      setProfile(payload);
      setChildId((prev) => prev || payload.children[0]?.id || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const payload = await apiGet<ProfilePayload>('/api/settings/profile');
        if (!mounted) return;
        setProfile(payload);
        setChildId((prev) => prev || payload.children[0]?.id || '');
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : 'Failed to load settings');
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const submitChild = async (event: FormEvent) => {
    event.preventDefault();
    await apiPost('/api/settings/children', {
      firstName: newChildName,
      className: newClassName,
      teacherName: newTeacherName
    });
    setNewChildName('');
    setNewClassName('');
    setNewTeacherName('');
    await loadProfile();
  };

  const submitActivity = async (event: FormEvent) => {
    event.preventDefault();
    if (!childId) return;

    await apiPost('/api/settings/activities', {
      childId,
      name: activityName,
      activityType
    });

    setActivityName('');
    await loadProfile();
  };

  const createInvite = async (event: FormEvent) => {
    event.preventDefault();
    const payload = await apiPost<{ shareLink: string; qrText: string; expiresAt: string }>('/api/settings/invites', {
      shareName,
      sharePassword
    });

    setInvite(payload);
  };

  return (
    <main className="grid gap-4">
      <section className="rounded-3xl border-2 border-rose-200 bg-white p-5">
        <h1 className="text-2xl font-semibold tracking-tight">Settings Hub</h1>
        <p className="mt-1 text-sm text-slate-600">Manage children, classes, activities, and family routing identity.</p>

        {profile && (
          <div className="mt-3 rounded-2xl border border-rose-100 bg-rose-50 p-3 text-sm">
            Routing Alias: <span className="font-semibold">{profile.family.routing_alias}</span>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </section>

      <section className="rounded-3xl border-2 border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Children</h2>
        <form className="mt-3 grid gap-2 md:grid-cols-3" onSubmit={submitChild}>
          <input className="rounded-xl border border-slate-200 px-3 py-2" placeholder="First name" value={newChildName} onChange={(event) => setNewChildName(event.target.value)} required />
          <input className="rounded-xl border border-slate-200 px-3 py-2" placeholder="Class name" value={newClassName} onChange={(event) => setNewClassName(event.target.value)} />
          <input className="rounded-xl border border-slate-200 px-3 py-2" placeholder="Teacher name" value={newTeacherName} onChange={(event) => setNewTeacherName(event.target.value)} />
          <button className="rounded-2xl bg-rose-500 px-4 py-2 font-medium text-white md:col-span-3" type="submit">
            Add Child
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
            Add Activity
          </button>
        </form>
      </section>

      <section className="rounded-3xl border-2 border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Invite New Family Members</h2>
        <form className="mt-3 grid gap-2 md:grid-cols-2" onSubmit={createInvite}>
          <input className="rounded-xl border border-slate-200 px-3 py-2" placeholder="Share name" value={shareName} onChange={(event) => setShareName(event.target.value)} required />
          <input className="rounded-xl border border-slate-200 px-3 py-2" placeholder="Share password" type="password" value={sharePassword} onChange={(event) => setSharePassword(event.target.value)} required />
          <button className="rounded-2xl bg-rose-500 px-4 py-2 font-medium text-white md:col-span-2" type="submit">
            Generate Share Link / QR Token
          </button>
        </form>

        {invite && (
          <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm">
            <p>Share link: <span className="font-medium">{invite.shareLink}</span></p>
            <p>QR token text: <span className="font-mono">{invite.qrText}</span></p>
            <p>Expires: {new Date(invite.expiresAt).toLocaleString()}</p>
          </div>
        )}
      </section>
    </main>
  );
}
