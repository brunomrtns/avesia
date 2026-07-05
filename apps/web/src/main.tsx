import { useEffect } from 'react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';

import { useAuthStore } from '@/stores/auth-store';
import { queryClient } from '@/lib/query-client';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { BRAND } from '@/components/branding/BrandLogo';
import App from '@/App';
import '@/index.css';

// Sync document title with brand config
document.title = `${BRAND.name} — ${BRAND.tagline}`;

// Initialize auth store on app mount (replaces AuthProvider's useEffect)
function AppInitializer({ children }: { children: React.ReactNode }) {
  const initAuth = useAuthStore((s) => s.init);

  useEffect(() => {
    void initAuth();
  }, [initAuth]);

  return <>{children}</>;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <AppInitializer>
            <App />
            <Toaster
              richColors
              position="top-right"
              theme="dark"
              toastOptions={{
                style: {
                  background: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  color: 'hsl(var(--popover-foreground))',
                },
              }}
            />
          </AppInitializer>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
