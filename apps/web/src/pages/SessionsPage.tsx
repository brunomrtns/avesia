import { useState, useContext, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { AuthContext } from '@/lib/auth-context';
import {
  Plus,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

import { api } from '@/lib/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { BriefingDialog } from '@/components/session-room/BriefingDialog';
import { cn } from '@/lib/utils';

const sessionFormSchema = z.object({
  patientId: z.string().min(1, 'Paciente é obrigatório'),
  professionalId: z.string().min(1, 'Profissional é obrigatório'),
  scheduledAt: z.string().min(1, 'Data é obrigatória'),
  type: z.enum(['INITIAL', 'FOLLOW_UP', 'EMERGENCY']),
  location: z.enum(['IN_PERSON', 'VIDEO', 'PHONE']),
  durationMinutes: z.coerce.number().int().min(1).max(480).default(50),
  notes: z.string().max(5000).optional().or(z.literal('')),
});

type SessionFormValues = z.infer<typeof sessionFormSchema>;

const TYPE_LABELS: Record<string, string> = {
  INITIAL: 'Inicial',
  FOLLOW_UP: 'Acompanhamento',
  EMERGENCY: 'Emergência',
};

const LOCATION_LABELS: Record<string, string> = {
  IN_PERSON: 'Presencial',
  VIDEO: 'Vídeo',
  PHONE: 'Telefone',
};

const STATUS_LABELS: Record<string, string> = {
  SCHEDULED: 'Agendada',
  IN_PROGRESS: 'Em Andamento',
  COMPLETED: 'Realizada',
  CANCELLED: 'Cancelada',
};

const STATUS_VARIANTS: Record<string, 'default' | 'warning' | 'success' | 'destructive' | 'outline'> = {
  SCHEDULED: 'default',
  IN_PROGRESS: 'warning',
  COMPLETED: 'success',
  CANCELLED: 'destructive',
};

export function SessionsPage(): React.ReactNode {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  // Open dialog automatically if ?new=true
  useEffect(() => {
    if (searchParams.get('new') === 'true') {
      setDialogOpen(true);
      // Clean the URL so it doesn't re-open on refresh
      searchParams.delete('new');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);
  const [briefingSession, setBriefingSession] = useState<{ id: string; patientName: string } | null>(null);

  const pageSize = 20;

  const sessionsQuery = useQuery({
    queryKey: ['sessions', { page, status: statusFilter, from: fromDate, to: toDate }],
    queryFn: () => {
      const q: any = { page, pageSize };
      if (statusFilter) q.status = statusFilter;
      if (fromDate) q.from = `${fromDate}T00:00:00.000Z`;
      if (toDate) q.to = `${toDate}T23:59:59.999Z`;
      return api.sessions.list(q);
    },
  });

  const patientsQuery = useQuery({
    queryKey: ['patients', 'select'],
    queryFn: () => api.patients.list({ pageSize: 100 }),
  });

  const professionalsQuery = useQuery({
    queryKey: ['professionals'],
    queryFn: () => api.sessions.listProfessionals(),
  });

  const createMutation = useMutation({
    mutationFn: (data: SessionFormValues) => {
      const payload: any = {
        patientId: data.patientId,
        professionalId: data.professionalId,
        scheduledAt: new Date(data.scheduledAt).toISOString(),
        type: data.type,
        location: data.location,
        durationMinutes: data.durationMinutes,
      };
      if (data.notes) {
        payload.notes = data.notes;
      }
      return api.sessions.create(payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
      setDialogOpen(false);
      toast.success('Sessão criada com sucesso');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Erro ao criar sessão'),
  });

  const items = sessionsQuery.data?.items ?? [];
  const total = sessionsQuery.data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);
  const patients = (patientsQuery.data?.items ?? []) as any[];
  const professionals = (professionalsQuery.data?.items ?? []) as any[];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Sessões</h1>
          <p className="text-sm text-foreground-secondary">Gerencie as sessões agendadas</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-3">
          <Select
            value={statusFilter || 'all'}
            onValueChange={(v) => {
              setStatusFilter(v === 'all' ? '' : v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Todos os status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="SCHEDULED">Agendada</SelectItem>
              <SelectItem value="IN_PROGRESS">Em Andamento</SelectItem>
              <SelectItem value="COMPLETED">Realizada</SelectItem>
              <SelectItem value="CANCELLED">Cancelada</SelectItem>
            </SelectContent>
          </Select>

          <Input
            type="date"
            className="w-[150px]"
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value);
              setPage(1);
            }}
            placeholder="De"
          />

          <Input
            type="date"
            className="w-[150px]"
            value={toDate}
            onChange={(e) => {
              setToDate(e.target.value);
              setPage(1);
            }}
            placeholder="Até"
          />
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <Button
            variant="gradient"
            onClick={() => setDialogOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Nova Sessão
          </Button>

          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Nova Sessão</DialogTitle>
            </DialogHeader>
            <SessionDialog
              patients={patients}
              professionals={professionals}
              onSubmit={(data) => createMutation.mutate(data)}
              loading={createMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-surface shadow-sm">
        {sessionsQuery.isLoading ? (
          <div className="space-y-3 p-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center text-sm text-foreground-muted">
            Nenhuma sessão encontrada
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Paciente</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Local</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const s = item as any;
                const patient = s.patient;
                return (
                  <TableRow key={s.id as string}>
                    <TableCell className="whitespace-nowrap font-medium text-foreground">
                      {(patient?.fullName as string) ?? '—'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Badge variant="outline">
                        {TYPE_LABELS[s.type as string] ?? (s.type as string)}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-foreground-secondary">
                      {s.scheduledAt
                        ? format(new Date(s.scheduledAt as string), "dd MMM yyyy 'às' HH:mm", {
                            locale: ptBR,
                          })
                        : '—'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-foreground-secondary">
                      {LOCATION_LABELS[s.location as string] ?? (s.location as string)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Badge variant={STATUS_VARIANTS[s.status as string] ?? 'outline'}>
                        {STATUS_LABELS[s.status as string] ?? (s.status as string)}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-2">
                        {s.status === 'SCHEDULED' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-primary hover:text-primary"
                            onClick={() =>
                              setBriefingSession({
                                id: s.id as string,
                                patientName: (patient?.fullName as string) ?? 'Paciente',
                              })
                            }
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                            Briefing
                          </Button>
                        )}
                        <Link to={`/${orgSlug}/sessions/${s.id}`}>
                          <Button variant="outline" size="sm" className="h-8">
                            {s.status === 'SCHEDULED' || s.status === 'IN_PROGRESS' ? 'Atender' : 'Ver Detalhes'}
                          </Button>
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border px-6 py-3">
            <p className="text-sm text-foreground-muted">
              {total} sessão{total !== 1 ? 'ões' : ''} encontrada{total !== 1 ? 's' : ''}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon-sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-foreground-muted">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="icon-sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Briefing dialog */}
      {briefingSession && (
        <BriefingDialog
          sessionId={briefingSession.id}
          patientName={briefingSession.patientName}
          open={!!briefingSession}
          onOpenChange={(open) => {
            if (!open) setBriefingSession(null);
          }}
        />
      )}
    </div>
  );
}

interface SessionDialogProps {
  readonly patients: Array<Record<string, unknown>>;
  readonly professionals: Array<{ id: string; fullName: string }>;
  readonly onSubmit: (data: SessionFormValues) => void;
  readonly loading: boolean;
}

function SessionDialog({ patients, professionals, onSubmit, loading }: SessionDialogProps): React.ReactNode {
  const auth = useContext(AuthContext);
  const currentProfessionalId = (auth?.user as any)?.professional?.id ?? '';
  const isProfessional = (auth?.user as any)?.role === 'PROFESSIONAL';

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = useForm<SessionFormValues>({
    resolver: zodResolver(sessionFormSchema),
    defaultValues: {
      patientId: '',
      professionalId: currentProfessionalId,
      scheduledAt: '',
      type: 'FOLLOW_UP',
      location: 'IN_PERSON',
      durationMinutes: 50,
      notes: '',
    },
  });

  useEffect(() => {
    if (currentProfessionalId) {
      setValue('professionalId', currentProfessionalId);
    }
  }, [currentProfessionalId, setValue]);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Patient */}
      <div className="space-y-2">
        <Label htmlFor="session-patient">Paciente *</Label>
        <Controller
          control={control}
          name="patientId"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="session-patient" className={cn(errors.patientId && 'border-destructive')}>
                <SelectValue placeholder="Selecione um paciente" />
              </SelectTrigger>
              <SelectContent>
                {patients.map((p) => (
                  <SelectItem key={p.id as string} value={p.id as string}>
                    {p.fullName as string}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.patientId && (
          <p className="text-xs text-destructive">{errors.patientId.message}</p>
        )}
      </div>

      {/* Professional Selector */}
      {!isProfessional && (
        <div className="space-y-2">
          <Label htmlFor="session-professional">Profissional *</Label>
          <Controller
            control={control}
            name="professionalId"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="session-professional" className={cn(errors.professionalId && 'border-destructive')}>
                  <SelectValue placeholder="Selecione um profissional" />
                </SelectTrigger>
                <SelectContent>
                  {professionals.map((prof) => (
                    <SelectItem key={prof.id} value={prof.id}>
                      {prof.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.professionalId && (
            <p className="text-xs text-destructive">{errors.professionalId.message}</p>
          )}
        </div>
      )}

      {/* Date */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="session-date">Data e Hora *</Label>
          <button
            type="button"
            onClick={() => {
              const now = new Date();
              const offset = now.getTimezoneOffset();
              const localNow = new Date(now.getTime() - offset * 60 * 1000);
              const formatted = localNow.toISOString().slice(0, 16);
              setValue('scheduledAt', formatted);
            }}
            className="text-xs font-semibold text-primary hover:underline"
          >
            Usar Hora Atual (Agora)
          </button>
        </div>
        <Input
          id="session-date"
          type="datetime-local"
          className={cn(errors.scheduledAt && 'border-destructive')}
          {...register('scheduledAt')}
        />
        {errors.scheduledAt && (
          <p className="text-xs text-destructive">{errors.scheduledAt.message}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Type */}
        <div className="space-y-2">
          <Label htmlFor="session-type">Tipo</Label>
          <Controller
            control={control}
            name="type"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="session-type">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INITIAL">Inicial</SelectItem>
                  <SelectItem value="FOLLOW_UP">Acompanhamento</SelectItem>
                  <SelectItem value="EMERGENCY">Emergência</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </div>

        {/* Location */}
        <div className="space-y-2">
          <Label htmlFor="session-location">Local</Label>
          <Controller
            control={control}
            name="location"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="session-location">
                  <SelectValue placeholder="Local" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="IN_PERSON">Presencial</SelectItem>
                  <SelectItem value="VIDEO">Vídeo</SelectItem>
                  <SelectItem value="PHONE">Telefone</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </div>
      </div>

      {/* Duration Selector */}
      <div className="space-y-2">
        <Label htmlFor="session-duration">Duração</Label>
        <Controller
          control={control}
          name="durationMinutes"
          render={({ field }) => (
            <Select value={String(field.value)} onValueChange={(v) => field.onChange(Number(v))}>
              <SelectTrigger id="session-duration">
                <SelectValue placeholder="Duração" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">30 minutos</SelectItem>
                <SelectItem value="50">50 minutos</SelectItem>
                <SelectItem value="60">60 minutos</SelectItem>
                <SelectItem value="90">90 minutos</SelectItem>
                <SelectItem value="120">120 minutos (2h)</SelectItem>
                <SelectItem value="180">Ilimitado (máx. 3h)</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <Label htmlFor="session-notes">Observações</Label>
        <Textarea
          id="session-notes"
          rows={3}
          className="resize-none"
          placeholder="Observações opcionais..."
          {...register('notes')}
        />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <DialogClose asChild>
          <Button variant="outline" type="button">
            Cancelar
          </Button>
        </DialogClose>
        <Button type="submit" variant="gradient" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Criando...
            </>
          ) : (
            'Criar Sessão'
          )}
        </Button>
      </div>
    </form>
  );
}
