import { useContext } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

import { AuthContext } from '@/lib/auth-context';

export function ProtectedRoute(): React.ReactNode {
  const auth = useContext(AuthContext);

  if (!auth) {
    throw new Error('ProtectedRoute must be used within AuthProvider');
  }

  if (auth.isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!auth.isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
