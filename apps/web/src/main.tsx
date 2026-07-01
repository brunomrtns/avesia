import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';

import { AuthProvider } from '@/lib/auth-context';
import { queryClient } from '@/lib/query-client';
import { ThemeProvider } from '@/lib/theme-context';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import App from '@/App';
import '@/index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <AuthProvider>
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
            </AuthProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
);
