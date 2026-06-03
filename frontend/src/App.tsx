import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { apiGet } from './api/client';
import { Layout, type ViewerKind } from './components/Layout';
import { AdminPage } from './pages/AdminPage';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';
import { HomePage } from './pages/HomePage';

function App() {
  const [viewer, setViewer] = useState<ViewerKind>('public');
  const [checking, setChecking] = useState(true);

  const refreshSession = useCallback(async () => {
    setChecking(true);

    try {
      await apiGet<{ email: string }>('/api/admin/auth/me');
      setViewer('admin');
      return;
    } catch {
      // not admin
    }

    try {
      await apiGet<{ user: { role: 'admin' | 'member' } }>('/api/auth/session');
      setViewer('member');
    } catch {
      setViewer('public');
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const defaultAuthedRoute = useMemo(() => {
    if (viewer === 'admin') return '/admin';
    if (viewer === 'member') return '/dashboard';
    return '/auth';
  }, [viewer]);

  if (checking) {
    return <main className="mx-auto max-w-4xl p-6 text-sm text-slate-600">Checking session…</main>;
  }

  return (
    <Routes>
      <Route element={<Layout viewer={viewer} onSessionChange={refreshSession} />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/auth" element={<AuthPage onAuthenticated={refreshSession} />} />

        <Route
          path="/dashboard"
          element={viewer === 'member' ? <DashboardPage onSessionChange={refreshSession} /> : <Navigate to={defaultAuthedRoute} replace />}
        />

        <Route
          path="/admin"
          element={viewer === 'admin' ? <AdminPage onSessionChange={refreshSession} /> : <Navigate to={defaultAuthedRoute} replace />}
        />

        <Route path="/settings" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
