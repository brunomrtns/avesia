import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Link, useParams } from 'react-router-dom';
import {
  Activity,
  ArrowLeft,
  Brain,
  Calendar,
  FileText,
  Loader2,
  Plus,
  Shield,
  ShieldCheck,
  ShieldX,
  Sparkles,
} from 'lucide-react';

import { api } from '@/lib/api-client';
import type { Consent, PatientMemory, PatientTimeline } from '@/lib/api-client';
import { AlertsPanel } from '@/components/AlertsPanel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

const TIMELINE_TYPE_ICONS: Record<string, React.ReactNode> = {
  SESSION: <Calendar className="h-4 w-4 text-primary" />,
  NOTE: <FileText className="h-4 w-4 text-accent" />,
  ANALYSIS: <Sparkles className="h-4 w-4 text-primary" />,
  CONSENT: <Shield className="h-4 w-4 text-foreground-muted" />,
  ALERT: <Activity className="h-4 w-4 text-warning" />,
};

const RISK_VARIANTS: Record<string, 'success' | 'warning' | 'destructive'> = {
  low: 'success',
  medium: 'warning',
  high: 'destructive',
};

export function PatientDetailPage(): React.ReactNode {
  const { id, orgSlug } = useParams<{ id: string; orgSlug: string }>();

  const patientQuery = useQuery({
    queryKey: ['patient', id],
    queryFn: () => api.patients.get(id!),
    enabled: !!id,
  });

  const profileQuery = useQuery({
    queryKey: ['patient-profile', id],
    queryFn: () => api.patients.getProfile(id!),
    enabled: !!id,
  });

  const timelineQuery = useQuery({
    queryKey: ['patient-timeline', id],
    queryFn: () => api.patients.getTimeline(id!),
    enabled: !!id,
  });

  const memoryQuery = useQuery({
    queryKey: ['patient-memory', id],
    queryFn: () => api.patients.getMemory(id!),
    enabled: !!id,
  });

  const patient = patientQuery.data as any;

  if (patientQuery.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-96 w-full rounded-lg" />
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center text-center">
        <h2 className="text-xl font-bold text-destructive">Paciente não encontrado</h2>
        <Link to={`/${orgSlug}/patients`} className="mt-4 text-primary hover:underline">
          Voltar para pacientes
        </Link>
      </div>
    );
  }

  const patientName = patient.fullName ?? patient.name ?? 'Paciente';

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="flex items-center gap-4"
      >
        <Link
          to={`/${orgSlug}/patients`}
          className="rounded-lg p-2 text-foreground-secondary transition-colors hover:bg-surface-elevated hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{patientName}</h1>
          <div className="mt-1 flex items-center gap-3 text-sm text-foreground-secondary">
            {patient.email && <span>{patient.email}</span>}
            {patient.phone && <span>• {patient.phone}</span>}
            <Badge variant={patient.status === 'ACTIVE' ? 'success' : 'secondary'} className="text-[10px]">
              {patient.status === 'ACTIVE' ? 'Ativo' : 'Arquivado'}
            </Badge>
          </div>
        </div>
      </motion.div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="timeline">Linha do Tempo</TabsTrigger>
          <TabsTrigger value="consents">Consentimentos</TabsTrigger>
          <TabsTrigger value="alerts">Alertas</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          {/* Quick stats */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Calendar className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold tabular-nums text-foreground">
                    {profileQuery.data?.sessionCount ?? '—'}
                  </p>
                  <p className="text-[11px] uppercase tracking-wider text-foreground-muted">Sessões</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
                  <Brain className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <p className="text-2xl font-bold tabular-nums text-foreground">
                    {memoryQuery.data?.keyThemes?.length ?? '—'}
                  </p>
                  <p className="text-[11px] uppercase tracking-wider text-foreground-muted">Temas-chave</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold tabular-nums text-foreground">
                    {timelineQuery.data?.totalNotes ?? '—'}
                  </p>
                  <p className="text-[11px] uppercase tracking-wider text-foreground-muted">Notas</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10">
                  <Activity className="h-5 w-5 text-success" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {profileQuery.data?.lastSessionDate
                      ? format(new Date(profileQuery.data.lastSessionDate), 'dd/MM/yyyy')
                      : '—'}
                  </p>
                  <p className="text-[11px] uppercase tracking-wider text-foreground-muted">Última sessão</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Profile summary */}
          <Card>
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Resumo do Perfil</h3>
                {profileQuery.data?.riskLevel && (
                  <Badge variant={RISK_VARIANTS[profileQuery.data.riskLevel] ?? 'outline'} className="ml-auto text-[10px]">
                    Risco {profileQuery.data.riskLevel === 'low' ? 'Baixo' : profileQuery.data.riskLevel === 'medium' ? 'Médio' : 'Alto'}
                  </Badge>
                )}
              </div>
              {profileQuery.isLoading ? (
                <Skeleton className="h-20 w-full" />
              ) : profileQuery.data ? (
                <p className="font-clinical text-sm leading-relaxed text-foreground-secondary">
                  {profileQuery.data.summary}
                </p>
              ) : (
                <p className="text-sm text-foreground-muted">Sem resumo de perfil disponível.</p>
              )}

              {/* Key themes */}
              {profileQuery.data?.keyThemes && profileQuery.data.keyThemes.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-foreground-muted">Temas Principais</p>
                  <div className="flex flex-wrap gap-2">
                    {profileQuery.data.keyThemes.map((theme: string) => (
                      <Badge key={theme} variant="outline" className="text-xs">
                        {theme}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Treatment goals */}
              {profileQuery.data?.treatmentGoals && profileQuery.data.treatmentGoals.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-foreground-muted">Objetivos de Tratamento</p>
                  <ul className="space-y-1">
                    {profileQuery.data.treatmentGoals.map((goal: string, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-foreground-secondary">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                        {goal}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Memory summary */}
          <Card>
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-accent" />
                <h3 className="text-sm font-semibold text-foreground">Memória do Paciente</h3>
              </div>
              {memoryQuery.isLoading ? (
                <Skeleton className="h-20 w-full" />
              ) : memoryQuery.data ? (
                <>
                  <p className="font-clinical text-sm leading-relaxed text-foreground-secondary">
                    {memoryQuery.data.summary}
                  </p>
                  {memoryQuery.data.keyThemes && memoryQuery.data.keyThemes.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[11px] font-medium uppercase tracking-wider text-foreground-muted">Temas Recorrentes</p>
                      <div className="space-y-1.5">
                        {memoryQuery.data.keyThemes.map((item: PatientMemory['keyThemes'][number], i: number) => (
                          <div key={i} className="flex items-center justify-between text-sm">
                            <span className="text-foreground-secondary">{item.theme}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-foreground-muted">{item.frequency}x</span>
                              <span className="text-[11px] text-foreground-muted">
                                {format(new Date(item.lastMentioned), 'dd/MM/yyyy', { locale: ptBR })}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {memoryQuery.data.importantEvents && memoryQuery.data.importantEvents.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[11px] font-medium uppercase tracking-wider text-foreground-muted">Eventos Importantes</p>
                      <div className="space-y-1.5">
                        {memoryQuery.data.importantEvents.map((event, i: number) => (
                          <div key={i} className="flex items-start gap-2 text-sm">
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                            <span className="flex-1 text-foreground-secondary">{event.event}</span>
                            <span className="text-[11px] text-foreground-muted">
                              {format(new Date(event.date), 'dd/MM/yyyy', { locale: ptBR })}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-foreground-muted">Sem memória disponível ainda.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Timeline Tab */}
        <TabsContent value="timeline" className="space-y-4">
          <Card>
            <CardContent className="p-5">
              {timelineQuery.isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : timelineQuery.data && timelineQuery.data.entries.length > 0 ? (
                <div className="relative space-y-4">
                  {/* Vertical line */}
                  <div className="absolute left-[19px] top-2 bottom-2 w-px bg-border" />
                  {timelineQuery.data.entries.map((entry: PatientTimeline['entries'][number], index: number) => (
                    <motion.div
                      key={entry.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: index * 0.05, ease: [0.16, 1, 0.3, 1] }}
                      className="relative flex gap-4"
                    >
                      <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-surface">
                        {TIMELINE_TYPE_ICONS[entry.type] ?? <Activity className="h-4 w-4 text-foreground-muted" />}
                      </div>
                      <div className="flex-1 pb-2">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground">{entry.title}</p>
                          <span className="text-[11px] text-foreground-muted">
                            {format(new Date(entry.date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                          </span>
                        </div>
                        {entry.description && (
                          <p className="mt-1 text-sm text-foreground-secondary">{entry.description}</p>
                        )}
                        {entry.sessionId && (
                          <Link
                            to={`/${orgSlug}/sessions/${entry.sessionId}`}
                            className="mt-1 inline-block text-xs text-primary hover:underline"
                          >
                            Ver sessão →
                          </Link>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                  <Calendar className="h-8 w-8 text-foreground-muted" />
                  <p className="text-sm text-foreground-muted">Sem eventos na linha do tempo</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Consents Tab */}
        <TabsContent value="consents" className="space-y-4">
          <ConsentsTab patientId={id!} />
        </TabsContent>

        {/* Alerts Tab */}
        <TabsContent value="alerts" className="space-y-4">
          <AlertsPanel patientId={id!} showAcknowledged />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Consents Tab ────────────────────────────────────────────────────────────

const CONSENT_TYPES: Array<{ value: string; label: string }> = [
  { value: 'DATA_PROCESSING', label: 'Processamento de Dados' },
  { value: 'RECORDING', label: 'Gravação de Áudio' },
  { value: 'AI_ANALYSIS', label: 'Análise por IA' },
  { value: 'DATA_SHARING', label: 'Compartilhamento de Dados' },
  { value: 'RESEARCH', label: 'Pesquisa' },
];

function ConsentsTab({ patientId }: { patientId: string }): React.ReactNode {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);

  const consentsQuery = useQuery({
    queryKey: ['patient-consents', patientId],
    queryFn: () => api.consents.list(patientId),
  });

  const createMutation = useMutation({
    mutationFn: (data: { type: string; granted: boolean; notes?: string }) =>
      api.consents.create(patientId, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['patient-consents', patientId] });
      setDialogOpen(false);
      toast.success('Consentimento registrado');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Erro ao registrar consentimento'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Consent> }) =>
      api.consents.update(id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['patient-consents', patientId] });
      toast.success('Consentimento atualizado');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Erro ao atualizar consentimento'),
  });

  const consents = consentsQuery.data ?? [];

  const handleToggle = (consent: Consent) => {
    updateMutation.mutate({
      id: consent.id,
      data: { granted: !consent.granted },
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Consentimentos</h2>
          <p className="text-sm text-foreground-secondary">Gerencie os consentimentos do paciente</p>
        </div>
        <Button variant="gradient" size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          Novo Consentimento
        </Button>
      </div>

      {consentsQuery.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : consents.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <Shield className="h-8 w-8 text-foreground-muted" />
            <p className="text-sm text-foreground-muted">Nenhum consentimento registrado</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {consents.map((consent: Consent) => {
            const typeLabel = CONSENT_TYPES.find((t) => t.value === consent.type)?.label ?? consent.type;
            return (
              <Card key={consent.id} className="transition-all duration-200 hover:border-border-hover">
                <CardContent className="flex items-center gap-4 p-4">
                  <div className="shrink-0">
                    {consent.granted ? (
                      <ShieldCheck className="h-6 w-6 text-success" />
                    ) : (
                      <ShieldX className="h-6 w-6 text-destructive" />
                    )}
                  </div>
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-medium text-foreground">{typeLabel}</p>
                    {consent.notes && (
                      <p className="text-xs text-foreground-muted">{consent.notes}</p>
                    )}
                    <p className="text-[11px] text-foreground-muted">
                      {consent.granted && consent.grantedAt
                        ? `Concedido em ${format(new Date(consent.grantedAt), 'dd/MM/yyyy')}`
                        : consent.revokedAt
                          ? `Revogado em ${format(new Date(consent.revokedAt), 'dd/MM/yyyy')}`
                          : `Criado em ${format(new Date(consent.createdAt), 'dd/MM/yyyy')}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={consent.granted ? 'success' : 'destructive'} className="text-[10px]">
                      {consent.granted ? 'Concedido' : 'Revogado'}
                    </Badge>
                    <Switch
                      checked={consent.granted}
                      onCheckedChange={() => handleToggle(consent)}
                      disabled={updateMutation.isPending}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Consentimento</DialogTitle>
          </DialogHeader>
          <ConsentForm
            onSubmit={(data) => createMutation.mutate(data)}
            loading={createMutation.isPending}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface ConsentFormProps {
  readonly onSubmit: (data: { type: string; granted: boolean; notes?: string }) => void;
  readonly loading: boolean;
}

function ConsentForm({ onSubmit, loading }: ConsentFormProps): React.ReactNode {
  const [type, setType] = useState('');
  const [granted, setGranted] = useState(true);
  const [notes, setNotes] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!type) {
      toast.error('Selecione um tipo de consentimento');
      return;
    }
    const payload: { type: string; granted: boolean; notes?: string } = { type, granted };
    if (notes) payload.notes = notes;
    onSubmit(payload);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="consent-type">Tipo</Label>
        <select
          id="consent-type"
          value={type}
          onChange={(e) => setType(e.target.value)}
          className={cn(
            'flex h-9 w-full rounded-md border border-border bg-surface px-3 py-1 text-sm',
            'focus:outline-none focus:ring-2 focus:ring-ring',
          )}
        >
          <option value="">Selecione...</option>
          {CONSENT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-3">
        <Switch checked={granted} onCheckedChange={setGranted} id="consent-granted" />
        <Label htmlFor="consent-granted">Concedido</Label>
      </div>

      <div className="space-y-2">
        <Label htmlFor="consent-notes">Observações</Label>
        <Textarea
          id="consent-notes"
          rows={3}
          className="resize-none"
          placeholder="Observações opcionais..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button type="submit" disabled={loading} variant="gradient">
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Salvando...
            </>
          ) : (
            'Registrar'
          )}
        </Button>
      </div>
    </form>
  );
}
