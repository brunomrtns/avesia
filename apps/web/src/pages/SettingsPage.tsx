import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2, Building2, Save } from 'lucide-react';

import { AuthContext } from '@/lib/auth-context';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useContext } from 'react';

const settingsFormSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(200),
  slug: z.string().min(1, 'Slug é obrigatório').max(100),
});

type SettingsFormValues = z.infer<typeof settingsFormSchema>;

export function SettingsPage(): React.ReactNode {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const auth = useContext(AuthContext);

  const orgQuery = useQuery({
    queryKey: ['organization'],
    queryFn: () => api.organization.get<Record<string, unknown>>(),
  });

  const updateMutation = useMutation({
    mutationFn: (data: SettingsFormValues) => api.organization.update<Record<string, unknown>>(data),
    onSuccess: (data: Record<string, unknown>) => {
      void queryClient.invalidateQueries({ queryKey: ['organization'] });
      const newSlug = data.slug as string;
      const newName = data.name as string;
      // Update auth context with new slug/name
      auth?.updateOrgSlug(newSlug, newName);
      toast.success('Organização atualizada com sucesso');
      // If slug changed, navigate to the new URL
      if (newSlug && newSlug !== orgSlug) {
        navigate(`/${newSlug}/settings`, { replace: true });
      }
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : 'Erro ao atualizar organização'),
  });

  const org = orgQuery.data;

  if (orgQuery.isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Configurações</h1>
            <p className="text-sm text-foreground-secondary">Gerencie as preferências da sua conta</p>
          </div>
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-10 w-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-10 w-full" />
            </div>
            <div className="flex justify-end">
              <Skeleton className="h-10 w-40" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Configurações</h1>
          <p className="text-sm text-foreground-secondary">Gerencie as preferências da sua conta</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Building2 className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">Organização</h3>
          <p className="text-sm text-foreground-secondary">
            Gerencie as informações da sua clínica
          </p>
        </div>
      </div>

      {org && (
        <SettingsForm
          defaultValues={{
            name: (org.name as string) ?? '',
            slug: (org.slug as string) ?? '',
          }}
          onSubmit={(data) => updateMutation.mutate(data)}
          loading={updateMutation.isPending}
        />
      )}
    </div>
  );
}

interface SettingsFormProps {
  readonly defaultValues: SettingsFormValues;
  readonly onSubmit: (data: SettingsFormValues) => void;
  readonly loading: boolean;
}

function SettingsForm({ defaultValues, onSubmit, loading }: SettingsFormProps): React.ReactNode {
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsFormSchema),
    defaultValues,
  });

  return (
    <Card>
      <CardContent className="p-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="org-name">Nome da organização</Label>
            <Input
              id="org-name"
              type="text"
              className={cn(errors.name && 'border-destructive')}
              {...register('name')}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="org-slug">Identificador (slug)</Label>
            <Input
              id="org-slug"
              type="text"
              className={cn(errors.slug && 'border-destructive')}
              {...register('slug')}
            />
            {errors.slug && <p className="text-xs text-destructive">{errors.slug.message}</p>}
            <p className="text-xs text-foreground-muted">
              Usado para identificar sua organização na URL
            </p>
          </div>

          <div className="flex justify-end">
            <Button type="submit" variant="gradient" disabled={loading || !isDirty}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Salvar Alterações
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
