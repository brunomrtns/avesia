import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

import { Layout } from '@/components/layout/Layout';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { LoginPage } from '@/pages/LoginPage';

// Route-level code splitting
const DashboardPage = lazy(() =>
  import('@/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);
const PatientsPage = lazy(() =>
  import('@/pages/PatientsPage').then((m) => ({ default: m.PatientsPage })),
);
const SessionsPage = lazy(() =>
  import('@/pages/SessionsPage').then((m) => ({ default: m.SessionsPage })),
);
const SessionRoomPage = lazy(() =>
  import('@/pages/SessionRoomPage').then((m) => ({ default: m.SessionRoomPage })),
);
const KnowledgeBasePage = lazy(() =>
  import('@/pages/KnowledgeBasePage').then((m) => ({ default: m.default })),
);
const SettingsPage = lazy(() =>
  import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);

function PageLoader() {
  return (
    <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );
}

export default function App(): React.ReactNode {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route
            index
            element={
              <Suspense fallback={<PageLoader />}>
                <DashboardPage />
              </Suspense>
            }
          />
          <Route
            path="patients"
            element={
              <Suspense fallback={<PageLoader />}>
                <PatientsPage />
              </Suspense>
            }
          />
          <Route
            path="sessions"
            element={
              <Suspense fallback={<PageLoader />}>
                <SessionsPage />
              </Suspense>
            }
          />
          <Route
            path="sessions/:id"
            element={
              <Suspense fallback={<PageLoader />}>
                <SessionRoomPage />
              </Suspense>
            }
          />
          <Route
            path="knowledge-base"
            element={
              <Suspense fallback={<PageLoader />}>
                <KnowledgeBasePage />
              </Suspense>
            }
          />
          <Route
            path="settings"
            element={
              <Suspense fallback={<PageLoader />}>
                <SettingsPage />
              </Suspense>
            }
          />
        </Route>
      </Route>
    </Routes>
  );
}
