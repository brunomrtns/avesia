import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertTriangle, Bell, Check, Loader2, ShieldAlert } from 'lucide-react';

import { api } from '@/lib/api-client';
import type { ClinicalAlert } from '@/lib/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface AlertsPanelProps {
  readonly patientId?: string;
  readonly showAcknowledged?: boolean;
  readonly compact?: boolean;
}

const SEVERITY_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'warning' | 'outline' }> = {
  low: { label: 'Baixa', variant: 'outline' },
  medium: { label: 'Média', variant: 'warning' },
  high: { label: 'Alta', variant: 'destructive' },
  critical: { label: 'Crítica', variant: 'destructive' },
};

const SEVERITY_ICON: Record<string, React.ReactNode> = {
  low: <Bell className="h-4 w-4 text-foreground-muted" />,
  medium: <AlertTriangle className="h-4 w-4 text-warning" />,
  high: <ShieldAlert className="h-4 w-4 text-destructive" />,
  critical: <ShieldAlert className="h-4 w-4 text-destructive" />,
};

export function AlertsPanel({ patientId, showAcknowledged = false, compact = false }: AlertsPanelProps): React.ReactNode {
  const queryClient = useQueryClient();

  const alertsQuery = useQuery({
    queryKey: ['alerts', { patientId, acknowledged: showAcknowledged ? undefined : false }],
    queryFn: () => {
      const params: { acknowledged?: boolean; patientId?: string; severity?: string } = {};
      if (!showAcknowledged) params.acknowledged = false;
      if (patientId) params.patientId = patientId;
      return api.alerts.list(params);
    },
    refetchInterval: 30_000,
  });

  const acknowledgeMutation = useMutation({
    mutationFn: (id: string) => api.alerts.acknowledge(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['alerts'] });
      toast.success('Alerta reconhecido');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Erro ao reconhecer alerta'),
  });

  const alerts = alertsQuery.data ?? [];

  if (alertsQuery.isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (alerts.length === 0) {
    return (
      <Card className="border-border-subtle">
        <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border-subtle bg-surface-elevated">
            <Bell className="h-5 w-5 text-foreground-muted" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground-secondary">Nenhum alerta ativo</p>
            <p className="text-xs text-foreground-muted">
              {showAcknowledged ? 'Nenhum alerta encontrado.' : 'Não há alertas não reconhecidos no momento.'}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {alerts.map((alert: ClinicalAlert, index: number) => {
        const severity = SEVERITY_CONFIG[alert.severity] ?? SEVERITY_CONFIG.medium!;
        const isAcknowledged = alert.acknowledged;

        return (
          <motion.div
            key={alert.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.05, ease: [0.16, 1, 0.3, 1] }}
          >
            <Card
              className={cn(
                'transition-all duration-200',
                isAcknowledged ? 'opacity-60' : 'hover:border-border-hover hover:shadow-md',
                alert.severity === 'critical' && !isAcknowledged && 'border-destructive/30',
              )}
            >
              <CardContent className={cn('flex items-start gap-3', compact ? 'p-3' : 'p-4')}>
                <div className="mt-0.5 shrink-0">
                  {SEVERITY_ICON[alert.severity] ?? SEVERITY_ICON.medium!}
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant={severity.variant} className="text-[10px]">
                      {severity.label}
                    </Badge>
                    <span className="text-[10px] font-medium uppercase tracking-wider text-foreground-muted">
                      {alert.type}
                    </span>
                  </div>
                  <p className="text-sm text-foreground-secondary">{alert.message}</p>
                  <div className="flex items-center gap-3 text-[11px] text-foreground-muted">
                    <span>{format(new Date(alert.createdAt), "dd MMM yyyy 'às' HH:mm", { locale: ptBR })}</span>
                    {alert.patientName && <span>• {alert.patientName}</span>}
                  </div>
                </div>
                {!isAcknowledged && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => acknowledgeMutation.mutate(alert.id)}
                    disabled={acknowledgeMutation.isPending}
                    title="Reconhecer alerta"
                    className="shrink-0 hover:bg-success/10 hover:text-success"
                  >
                    {acknowledgeMutation.isPending && acknowledgeMutation.variables === alert.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                  </Button>
                )}
              </CardContent>
            </Card>
          </motion.div>
        );
      })}
    </div>
  );
}
