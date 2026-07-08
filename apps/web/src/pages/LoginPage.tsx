import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Eye, EyeOff, Loader2, Sparkles } from 'lucide-react';

import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api-client';
import { BrandLogo, BRAND } from '@/components/branding/BrandLogo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Reveal } from '@/components/animation/reveal';

const loginFormSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Senha deve ter pelo menos 8 caracteres'),
});

type LoginFormValues = z.infer<typeof loginFormSchema>;

export function LoginPage(): React.ReactNode {
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (values: LoginFormValues): Promise<void> => {
    try {
      await login(values.email, values.password);
      // Redirect to the org-scoped dashboard
      const slug = useAuthStore.getState().orgSlug ?? (await api.auth.me()).organization?.slug;
      navigate(slug ? `/${slug}` : '/', { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao fazer login. Tente novamente.';
      toast.error(message);
    }
  };

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

        {/* Login card */}
        <div className="glass-card gradient-border-active elevation-accent rounded-xl p-8">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-foreground">Entrar na sua conta</h2>
            <p className="text-sm text-foreground-secondary">Insira suas credenciais para acessar</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="login-email">Email</Label>
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                placeholder="seu@email.com"
                className={cn(errors.email && 'border-destructive')}
                {...register('email')}
              />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="login-password">Senha</Label>
              <div className="relative">
                <Input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className={cn('pr-10', errors.password && 'border-destructive')}
                  {...register('password')}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground-muted transition-colors hover:text-foreground"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs text-destructive">{errors.password.message}</p>
              )}
            </div>

            <Button
              type="submit"
              variant="gradient"
              className="w-full"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Entrando...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Entrar
                </>
              )}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-foreground-muted">
          © {new Date().getFullYear()} {BRAND.name}. Todos os direitos reservados.
        </p>
      </Reveal>
    </div>
  );
}
