import { Link } from 'react-router-dom';

export function HomePage() {
  return (
    <main className="grid gap-4">
      <section className="rounded-3xl border-2 border-rose-200 bg-white p-6">
        <h1 className="text-3xl font-semibold tracking-tight">Welcome to School2Me</h1>
        <p className="mt-2 text-slate-600">A friendly family inbox and planning space for school communication.</p>
        <Link to="/auth" className="mt-4 inline-block rounded-2xl bg-rose-500 px-4 py-2 font-medium text-white">
          Login
        </Link>
      </section>

      <section id="faq" className="rounded-3xl border-2 border-slate-200 bg-white p-6">
        <h2 className="text-xl font-semibold">FAQ (Placeholder)</h2>
        <p className="mt-2 text-sm text-slate-600">Frequently asked questions will be listed here.</p>
      </section>

      <section id="pricing" className="rounded-3xl border-2 border-slate-200 bg-white p-6">
        <h2 className="text-xl font-semibold">Pricing (Placeholder)</h2>
        <p className="mt-2 text-sm text-slate-600">Pricing tiers and plan comparisons will be listed here.</p>
      </section>
    </main>
  );
}
