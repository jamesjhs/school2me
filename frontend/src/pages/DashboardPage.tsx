import { useEffect, useMemo, useState } from 'react';
import { apiGet } from '../api/client';

interface EventItem {
  id: string;
  childId: string | null;
  activityId: string | null;
  title: string;
  description: string | null;
  startTime: string;
  endTime: string | null;
  location: string | null;
  needsReview: boolean;
}

interface ProfileResponse {
  family: { routing_alias: string };
  children: Array<{ id: string; first_name: string }>;
  activities: Array<{ id: string; name: string }>;
}

export function DashboardPage() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [children, setChildren] = useState<ProfileResponse['children']>([]);
  const [activities, setActivities] = useState<ProfileResponse['activities']>([]);
  const [childFilter, setChildFilter] = useState('');
  const [activityFilter, setActivityFilter] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        const profile = await apiGet<ProfileResponse>('/api/settings/profile');
        setChildren(profile.children);
        setActivities(profile.activities);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load profile');
      }
    };

    run();
  }, []);

  useEffect(() => {
    const run = async () => {
      try {
        const query = new URLSearchParams();
        if (childFilter) query.set('childId', childFilter);
        if (activityFilter) query.set('activityId', activityFilter);
        const payload = await apiGet<{ events: EventItem[] }>(`/api/dashboard/events?${query.toString()}`);
        setEvents(payload.events);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load events');
      }
    };

    run();
  }, [childFilter, activityFilter]);

  const grouped = useMemo(() => {
    return events.reduce<Record<string, EventItem[]>>((acc, event) => {
      const day = new Date(event.startTime).toLocaleDateString();
      acc[day] = acc[day] ?? [];
      acc[day].push(event);
      return acc;
    }, {});
  }, [events]);

  return (
    <main className="grid gap-4">
      <section className="rounded-3xl border-2 border-rose-200 bg-white p-5">
        <h1 className="text-2xl font-semibold tracking-tight">Family Timeline</h1>
        <p className="mt-1 text-sm text-slate-600">Upcoming obligations with quick filters by child or activities.</p>

        <div className="mt-4 flex flex-wrap gap-2">
          <select className="rounded-2xl border border-slate-200 px-3 py-2" value={childFilter} onChange={(event) => setChildFilter(event.target.value)}>
            <option value="">All Children</option>
            {children.map((child) => (
              <option key={child.id} value={child.id}>
                {child.first_name}
              </option>
            ))}
          </select>

          <select className="rounded-2xl border border-slate-200 px-3 py-2" value={activityFilter} onChange={(event) => setActivityFilter(event.target.value)}>
            <option value="">All Activities</option>
            {activities.map((activity) => (
              <option key={activity.id} value={activity.id}>
                {activity.name}
              </option>
            ))}
          </select>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-4 grid gap-4">
          {Object.entries(grouped).map(([day, dayEvents]) => (
            <section key={day} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <h2 className="text-base font-semibold">{day}</h2>
              <ul className="mt-2 grid gap-2">
                {dayEvents.map((event) => (
                  <li key={event.id} className="rounded-2xl border border-white bg-white p-3 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{event.title}</p>
                        <p className="text-sm text-slate-600">{new Date(event.startTime).toLocaleString()}</p>
                        {event.location && <p className="text-sm text-slate-600">📍 {event.location}</p>}
                      </div>
                      {event.needsReview && <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">Needs Review</span>}
                    </div>
                    {event.description && <p className="mt-2 text-sm text-slate-700">{event.description}</p>}
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {events.length === 0 && <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm">No upcoming items yet.</p>}
        </div>
      </section>
    </main>
  );
}
