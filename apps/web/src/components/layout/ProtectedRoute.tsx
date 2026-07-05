import { Navigate, Outlet, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

import { useAuthStore } from '@/stores/auth-store';

export function ProtectedRoute(): React.ReactNode {
  const isLoading = useAuthStore((s) => s.isLoading);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const authOrgSlug = useAuthStore((s) => s.orgSlug);
  const { orgSlug } = useParams<{ orgSlug: string }>();

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // If the URL slug doesn't match the user's org slug, redirect to the correct one.
  // This handles: bookmarked old slug, manual URL typing, slug changes.
  if (authOrgSlug && orgSlug && authOrgSlug !== orgSlug) {
    return <Navigate to={`/${authOrgSlug}`} replace />;
  }

  return <Outlet />;
}
