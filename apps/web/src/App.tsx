import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

import { Layout } from '@/components/layout/Layout';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { LoginPage } from '@/pages/LoginPage';
import { LandingPage } from '@/pages/LandingPage';

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
const AIProvidersPage = lazy(() =>
  import('@/pages/AIProvidersPage').then((m) => ({ default: m.AIProvidersPage })),
);
const PatientDetailPage = lazy(() =>
  import('@/pages/PatientDetailPage').then((m) => ({ default: m.PatientDetailPage })),
);
const ReportsPage = lazy(() =>
  import('@/pages/ReportsPage').then((m) => ({ default: m.ReportsPage })),
);
const OnboardingPage = lazy(() =>
  import('@/pages/OnboardingPage').then((m) => ({ default: m.OnboardingPage })),
);
const ApiKeysPage = lazy(() =>
  import('@/pages/ApiKeysPage').then((m) => ({ default: m.ApiKeysPage })),
);
const ProcessamentoPage = lazy(() =>
  import('@/pages/ProcessamentoPage').then((m) => ({ default: m.ProcessamentoPage })),
);
const HelpPage = lazy(() =>
  import('@/pages/HelpPage').then((m) => ({ default: m.HelpPage })),
);
const AdminPage = lazy(() =>
  import('@/pages/AdminPage').then((m) => ({ default: m.AdminPage })),
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
      {/* Public routes */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />

      {/* Protected routes — scoped by org slug */}
      <Route path=":orgSlug" element={<ProtectedRoute />}>
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
            path="patients/:id"
            element={
              <Suspense fallback={<PageLoader />}>
                <PatientDetailPage />
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
          <Route
            path="ai-providers"
            element={
              <Suspense fallback={<PageLoader />}>
                <AIProvidersPage />
              </Suspense>
            }
          />
          <Route
            path="reports"
            element={
              <Suspense fallback={<PageLoader />}>
                <ReportsPage />
              </Suspense>
            }
          />
          <Route
            path="onboarding"
            element={
              <Suspense fallback={<PageLoader />}>
                <OnboardingPage />
              </Suspense>
            }
          />
          <Route
            path="api-keys"
            element={
              <Suspense fallback={<PageLoader />}>
                <ApiKeysPage />
              </Suspense>
            }
          />
          <Route
            path="processamento"
            element={
              <Suspense fallback={<PageLoader />}>
                <ProcessamentoPage />
              </Suspense>
            }
          />
          <Route
            path="help"
            element={
              <Suspense fallback={<PageLoader />}>
                <HelpPage />
              </Suspense>
            }
          />
          <Route
            path="help/:articleId"
            element={
              <Suspense fallback={<PageLoader />}>
                <HelpPage />
              </Suspense>
            }
          />
          <Route
            path="admin"
            element={
              <Suspense fallback={<PageLoader />}>
                <AdminPage />
              </Suspense>
            }
          />
        </Route>
      </Route>
    </Routes>
  );
}
