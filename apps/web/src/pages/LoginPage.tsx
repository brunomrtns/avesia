import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Sparkles, Loader2 } from 'lucide-react';

import { useAuthStore } from '@/stores/auth-store';
import { SSO_LOGIN_URL } from '@/lib/api-client';
import { BrandLogo, BRAND } from '@/components/branding/BrandLogo';
import { Button } from '@/components/ui/button';
import { Reveal } from '@/components/animation/reveal';

export function LoginPage(): React.ReactNode {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const orgSlug = useAuthStore((s) => s.orgSlug);
  const isLoading = useAuthStore((s) => s.isLoading);

  // If already authenticated, redirect to the org dashboard
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      const returnTo = searchParams.get('returnTo');
      if (returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//')) {
        window.location.href = returnTo;
        return;
      }
      navigate(orgSlug ? `/${orgSlug}` : '/', { replace: true });
    }
  }, [isAuthenticated, isLoading, orgSlug, navigate, searchParams]);

  // If not authenticated, redirect to BI Identity SSO login
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      window.location.href = SSO_LOGIN_URL;
    }
  }, [isAuthenticated, isLoading]);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      {/* Cinematic background layers */}
      <div className="pointer-events-none absolute inset-0 aurora-bg" />
      <div className="pointer-events-none absolute inset-0 volumetric-light" />
      <div className="pointer-events-none absolute inset-0 dot-grid opacity-40" />
      <div className="pointer-events-none absolute inset-0 noise opacity-[0.04]" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-glow" />

      {/* Floating ambient orbs */}
      <div className="pointer-events-none absolute -top-24 left-[15%] h-72 w-72 animate-float rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-10%] right-[12%] h-80 w-80 animate-drift rounded-full bg-accent/8 blur-3xl [animation-delay:1.5s]" />
      <div className="pointer-events-none absolute top-1/3 right-[20%] h-56 w-56 animate-float rounded-full bg-primary/6 blur-3xl [animation-delay:0.8s]" />

      <Reveal y={20} className="relative w-full max-w-md">
        {/* Branding */}
        <div className="mb-8 flex flex-col items-center text-center">
          <Reveal delay={0.1} y={12} scale blur>
            <BrandLogo variant="full" size="lg" />
          </Reveal>
          <p className="mt-3 text-balance text-sm text-foreground-secondary">
            Plataforma de apoio clínico com IA
          </p>
        </div>

        {/* Redirect card */}
        <div className="glass-card gradient-border-active elevation-accent rounded-xl p-8">
          <div className="mb-6 flex flex-col items-center text-center">
            <h2 className="text-lg font-semibold text-foreground">Entrar na sua conta</h2>
            <p className="text-sm text-foreground-secondary">
              Redirecionando para Brunointegrations Identity...
            </p>
          </div>

          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <Button
              variant="gradient"
              className="w-full"
              onClick={() => { window.location.href = SSO_LOGIN_URL; }}
            >
              <Sparkles className="h-4 w-4" />
              Entrar via Brunointegrations
            </Button>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-foreground-muted">
          © {new Date().getFullYear()} {BRAND.name}. Todos os direitos reservados.
        </p>
      </Reveal>
    </div>
  );
}
