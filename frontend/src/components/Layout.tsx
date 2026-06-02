import { Link, NavLink, Outlet } from 'react-router-dom';

export function Layout() {
  return (
    <div className="mx-auto min-h-screen w-full max-w-4xl px-4 py-6 md:px-8">
      <header className="mb-6 rounded-3xl border-2 border-rose-200 bg-white/80 p-4 shadow-sm backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <Link to="/" className="text-xl font-semibold tracking-tight text-rose-600">
            School2Me
          </Link>
          <nav className="flex flex-wrap items-center gap-2 text-sm">
            <NavLink to="/auth" className="rounded-2xl border border-rose-200 px-3 py-1.5 hover:bg-rose-50">
              Auth
            </NavLink>
            <NavLink to="/dashboard" className="rounded-2xl border border-rose-200 px-3 py-1.5 hover:bg-rose-50">
              Dashboard
            </NavLink>
            <NavLink to="/settings" className="rounded-2xl border border-rose-200 px-3 py-1.5 hover:bg-rose-50">
              Settings
            </NavLink>
            <NavLink to="/admin" className="rounded-2xl border border-rose-200 px-3 py-1.5 hover:bg-rose-50">
              Admin
            </NavLink>
          </nav>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
