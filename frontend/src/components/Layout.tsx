import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { apiPost } from '../api/client';

export type ViewerKind = 'public' | 'member' | 'admin';

export function Layout({
  viewer,
  onSessionChange
}: {
  viewer: ViewerKind;
  onSessionChange: () => Promise<void>;
}) {
  const navigate = useNavigate();

  const logout = async () => {
    try {
      if (viewer === 'admin') {
        await apiPost('/api/admin/auth/logout', {});
      } else if (viewer === 'member') {
        await apiPost('/api/auth/logout', {});
      }
    } finally {
      await onSessionChange();
      navigate('/auth');
    }
  };

  return (
    <div className="mx-auto min-h-screen w-full max-w-5xl px-4 py-6 md:px-8">
      <header className="mb-6 rounded-3xl border-2 border-rose-200 bg-white/80 p-4 shadow-sm backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <Link to="/" className="text-xl font-semibold tracking-tight text-rose-600">
            School2Me
          </Link>
          <nav className="flex flex-wrap items-center gap-2 text-sm">
            <NavLink to="/" className="rounded-2xl border border-rose-200 px-3 py-1.5 hover:bg-rose-50">
              Home
            </NavLink>
            <a href="/#faq" className="rounded-2xl border border-rose-200 px-3 py-1.5 hover:bg-rose-50">
              FAQ
            </a>
            <a href="/#pricing" className="rounded-2xl border border-rose-200 px-3 py-1.5 hover:bg-rose-50">
              Pricing
            </a>

            {viewer === 'public' && (
              <NavLink to="/auth" className="rounded-2xl border border-rose-200 px-3 py-1.5 hover:bg-rose-50">
                Login
              </NavLink>
            )}

            {viewer === 'member' && (
              <>
                <NavLink to="/dashboard" className="rounded-2xl border border-rose-200 px-3 py-1.5 hover:bg-rose-50">
                  Dashboard
                </NavLink>
                <button type="button" onClick={logout} className="rounded-2xl border border-rose-200 px-3 py-1.5 hover:bg-rose-50">
                  Logout
                </button>
              </>
            )}

            {viewer === 'admin' && (
              <>
                <NavLink to="/admin" className="rounded-2xl border border-rose-200 px-3 py-1.5 hover:bg-rose-50">
                  Admin Dashboard
                </NavLink>
                <button type="button" onClick={logout} className="rounded-2xl border border-rose-200 px-3 py-1.5 hover:bg-rose-50">
                  Logout
                </button>
              </>
            )}
          </nav>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
