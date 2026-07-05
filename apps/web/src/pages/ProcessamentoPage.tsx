import { useCallback, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  AlertCircle,
  CheckCircle2,
  FileAudio,
  Info,
  Loader2,
  Plus,
  UploadCloud,
  X,
} from 'lucide-react';

import { api } from '@/lib/api-client';
import type { CreateSessionRequest } from '@avesia/types';
import { useAuthStore } from '@/stores/auth-store';
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
import { cn } from '@/lib/utils';

// ── Constants ───────────────────────────────────────────────────────────────

const ACCEPTED_FORMATS = '.mp3,.wav,.m4a,.mp4,.webm';
const ACCEPTED_EXTS = ['mp3', 'wav', 'm4a', 'mp4', 'webm'];
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB

const STATUS_CONFIG: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'warning' | 'success' | 'destructive' | 'outline' }
> = {
  UPLOADED: { label: 'Aguardando', variant: 'outline' },
  PROCESSING: { label: 'Processando', variant: 'warning' },
  COMPLETED: { label: 'Concluído', variant: 'success' },
  FAILED: { label: 'Falhou', variant: 'destructive' },
};

const sessionFormSchema = z.object({
  patientId: z.string().min(1, 'Paciente é obrigatório'),
  professionalId: z.string().min(1, 'Profissional é obrigatório'),
  scheduledAt: z.string().min(1, 'Data é obrigatória').refine(
    (val) => {
      const date = new Date(val);
      return date.getTime() <= Date.now();
    },
    'A data não pode ser futura',
  ),
  type: z.enum(['INITIAL', 'FOLLOW_UP', 'EMERGENCY']),
  location: z.enum(['IN_PERSON', 'VIDEO', 'PHONE']),
  notes: z.string().max(5000).optional().or(z.literal('')),
});

type SessionFormValues = z.infer<typeof sessionFormSchema>;

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: string | number | null | undefined): string {
  const n = typeof bytes === 'string' ? Number(bytes) : bytes;
  if (!n || isNaN(n)) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function fileNameFromStorageKey(key: string): string {
  const parts = key.split('/');
  return parts[parts.length - 1] ?? key;
}

// ── Page ────────────────────────────────────────────────────────────────────

export function ProcessamentoPage(): React.ReactNode {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');

  const recordingsQuery = useQuery({
    queryKey: ['recordings', { statusFilter }],
    queryFn: () =>
      api.recordings.list({
        pageSize: 50,
        ...(statusFilter ? { status: statusFilter } : {}),
      }),
    refetchInterval: (query) => {
      const hasProcessing = query.state.data?.items?.some(
        (r) => r.status === 'PROCESSING' || r.status === 'UPLOADED',
      );
      return hasProcessing ? 5000 : false;
    },
  });

  const recordings = recordingsQuery.data?.items ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Processamento</h1>
          <p className="text-sm text-foreground-secondary">
            Importe gravações de áudio para transcrição e análise automática
          </p>
        </div>
        <Button variant="gradient" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          Novo Processamento
        </Button>
      </motion.div>

      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-lg border border-border-subtle bg-surface-elevated/50 p-4">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
        <div className="space-y-1">
          <p className="text-sm text-foreground-secondary">
            O processamento de áudio é <strong>assíncrono</strong> e pode levar vários minutos.
          </p>
          <p className="text-xs text-foreground-muted">
            Após o upload, o áudio é enviado para o worker local (Whisper) para transcrição.
            Os arquivos de áudio são deletados automaticamente após o processamento.
            Você pode acompanhar o status na lista abaixo.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Todos os status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Todos</SelectItem>
            <SelectItem value="UPLOADED">Aguardando</SelectItem>
            <SelectItem value="PROCESSING">Processando</SelectItem>
            <SelectItem value="COMPLETED">Concluído</SelectItem>
            <SelectItem value="FAILED">Falhou</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-surface shadow-sm">
        {recordingsQuery.isLoading ? (
          <div className="space-y-3 p-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : recordings.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <FileAudio className="h-10 w-10 text-foreground-muted" />
            <div>
              <p className="text-sm font-medium text-foreground">Nenhum processamento</p>
              <p className="text-xs text-foreground-muted">
                Clique em "Novo Processamento" para importar gravações de áudio
              </p>
            </div>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Arquivo</TableHead>
                <TableHead>Paciente</TableHead>
                <TableHead>Data da Sessão</TableHead>
                <TableHead>Tamanho</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Enviado em</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recordings.map((rec) => {
                const status = STATUS_CONFIG[rec.status] ?? STATUS_CONFIG.UPLOADED!;
                const isProcessing = rec.status === 'PROCESSING' || rec.status === 'UPLOADED';
                return (
                  <TableRow key={rec.id}>
                    <TableCell className="max-w-[200px] truncate font-medium text-foreground">
                      <div className="flex items-center gap-2">
                        {rec.status === 'COMPLETED' ? (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                        ) : isProcessing ? (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-warning" />
                        ) : rec.status === 'FAILED' ? (
                          <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
                        ) : (
                          <FileAudio className="h-4 w-4 shrink-0 text-foreground-muted" />
                        )}
                        <span className="truncate">{fileNameFromStorageKey(rec.storageKey)}</span>
                      </div>
                      {rec.status === 'FAILED' && rec.errorMessage && (
                        <p className="mt-1 text-[11px] text-destructive">{rec.errorMessage}</p>
                      )}
                    </TableCell>
                    <TableCell>
                      {rec.session?.patient?.fullName ?? (
                        <span className="text-foreground-muted">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-foreground-secondary">
                      {rec.session?.scheduledAt
                        ? format(new Date(rec.session.scheduledAt), 'dd/MM/yyyy', { locale: ptBR })
                        : '—'}
                    </TableCell>
                    <TableCell className="text-foreground-secondary">
                      {formatBytes(rec.sizeBytes)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={status.variant} className="text-[10px]">
                        {status.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-foreground-muted">
                      {format(new Date(rec.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </TableCell>
                    <TableCell className="text-right">
                      {rec.status === 'COMPLETED' && rec.session?.id ? (
                        <Link
                          to={`/${orgSlug}/sessions/${rec.session.id}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                        >
                          Ver resultado
                        </Link>
                      ) : (
                        <span className="text-foreground-muted">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* New processing dialog */}
      <NewProcessingDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        orgSlug={orgSlug ?? ''}
        onCreated={() => {
          void queryClient.invalidateQueries({ queryKey: ['recordings'] });
        }}
      />
    </div>
  );
}

// ── New Processing Dialog (multi-step) ──────────────────────────────────────

interface NewProcessingDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly orgSlug: string;
  readonly onCreated: () => void;
}

type Step = 'session' | 'upload';

function NewProcessingDialog({
  open,
  onOpenChange,
  orgSlug,
  onCreated,
}: NewProcessingDialogProps): React.ReactNode {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isProfessional = (user as Record<string, unknown> | null)?.role === 'PROFESSIONAL';
  const currentProfessionalId =
    ((user as Record<string, unknown> | null)?.professional as Record<string, unknown> | undefined)?.id as string ?? '';
  const [step, setStep] = useState<Step>('session');
  const [createdSessionId, setCreatedSessionId] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const [uploadedCount, setUploadedCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const patientsQuery = useQuery({
    queryKey: ['patients', 'select'],
    queryFn: () => api.patients.list({ pageSize: 100 }),
    enabled: open,
  });

  const professionalsQuery = useQuery({
    queryKey: ['professionals'],
    queryFn: () => api.sessions.listProfessionals(),
    enabled: open && !isProfessional,
    staleTime: 60_000,
  });

  const professionals = professionalsQuery.data?.items ?? [];

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<SessionFormValues>({
    resolver: zodResolver(sessionFormSchema),
    defaultValues: {
      patientId: '',
      professionalId: currentProfessionalId,
      scheduledAt: '',
      type: 'FOLLOW_UP',
      location: 'IN_PERSON',
      notes: '',
    },
  });

  const createSessionMutation = useMutation({
    mutationFn: (data: SessionFormValues) => {
      const payload = {
        patientId: data.patientId,
        professionalId: data.professionalId,
        scheduledAt: new Date(data.scheduledAt).toISOString(),
        type: data.type,
        location: data.location,
        durationMinutes: 50,
        ...(data.notes ? { notes: data.notes } : {}),
      } as CreateSessionRequest;
      return api.sessions.create(payload);
    },
    onSuccess: (session) => {
      setCreatedSessionId(session.id);
      setStep('upload');
      toast.success('Sessão criada. Agora envie os arquivos de áudio.');
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : 'Erro ao criar sessão';
      toast.error(message.includes('fetch') ? 'Erro de conexão com o servidor. Verifique sua rede.' : message);
    },
  });

  const uploadAllMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const sid = createdSessionId!;
      for (let i = 0; i < files.length; i++) {
        setUploadingIdx(i);
        const file = files[i]!;
        await api.sessions.uploadAudio(sid, file);
        setUploadedCount(i + 1);
      }
    },
    onSuccess: () => {
      toast.success(`${pendingFiles.length} arquivo(s) enviado(s). Aguardando processamento.`);
      void queryClient.invalidateQueries({ queryKey: ['recordings'] });
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
      onCreated();
      handleClose();
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Erro ao enviar arquivos');
      setUploadingIdx(null);
    },
  });

  const patients = patientsQuery.data?.items ?? [];

  const handleClose = () => {
    setStep('session');
    setCreatedSessionId(null);
    setPendingFiles([]);
    setUploadingIdx(null);
    setUploadedCount(0);
    reset();
    onOpenChange(false);
  };

  const onSessionSubmit = (data: SessionFormValues) => {
    createSessionMutation.mutate(data);
  };

  const validateFile = (file: File): boolean => {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!ACCEPTED_EXTS.includes(ext)) {
      toast.error(`"${file.name}": formato .${ext} não suportado. Use: ${ACCEPTED_EXTS.join(', ')}`);
      return false;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error(`"${file.name}": arquivo muito grande (máx. 500 MB)`);
      return false;
    }
    return true;
  };

  const addFiles = (fileList: FileList | File[]) => {
    const valid = Array.from(fileList).filter(validateFile);
    setPendingFiles((prev) => [...prev, ...valid]);
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      addFiles(e.dataTransfer.files);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files);
    e.target.value = '';
  };

  const removeFile = (idx: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const isUploading = uploadAllMutation.isPending;
  const totalSize = pendingFiles.reduce((sum, f) => sum + f.size, 0);

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? null : handleClose())}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UploadCloud className="h-5 w-5 text-primary" />
            Novo Processamento
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2">
          <div
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold',
              step === 'session' ? 'bg-primary text-white' : 'bg-success text-white',
            )}
          >
            {step === 'session' ? '1' : <CheckCircle2 className="h-4 w-4" />}
          </div>
          <span className={cn('text-sm', step === 'session' ? 'font-semibold text-foreground' : 'text-foreground-muted')}>
            Sessão
          </span>
          <div className="h-px flex-1 bg-border" />
          <div
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold',
              step === 'upload' ? 'bg-primary text-white' : 'bg-surface-elevated text-foreground-muted',
            )}
          >
            2
          </div>
          <span className={cn('text-sm', step === 'upload' ? 'font-semibold text-foreground' : 'text-foreground-muted')}>
            Áudios
          </span>
        </div>

        {/* Step 1: Session form */}
        {step === 'session' && (
          <form onSubmit={handleSubmit(onSessionSubmit)} className="space-y-4">
            {/* Patient */}
            <div className="space-y-2">
              <Label htmlFor="proc-patient">Paciente *</Label>
              <Controller
                control={control}
                name="patientId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="proc-patient" className={cn(errors.patientId && 'border-destructive')}>
                      <SelectValue placeholder="Selecione um paciente" />
                    </SelectTrigger>
                    <SelectContent>
                      {patients.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.fullName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.patientId && (
                <p className="text-xs text-destructive">{errors.patientId.message}</p>
              )}
              {patients.length === 0 && (
                <p className="text-xs text-foreground-muted">
                  Nenhum paciente cadastrado.{' '}
                  <Link to={`/${orgSlug}/patients`} className="text-primary hover:underline">
                    Cadastrar paciente
                  </Link>
                </p>
              )}
            </div>

            {/* Professional (only for non-PROFESSIONAL users) */}
            {!isProfessional && (
              <div className="space-y-2">
                <Label htmlFor="proc-professional">Profissional *</Label>
                <Controller
                  control={control}
                  name="professionalId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="proc-professional" className={cn(errors.professionalId && 'border-destructive')}>
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
              <Label htmlFor="proc-date">Data da Sessão *</Label>
              <Input
                id="proc-date"
                type="datetime-local"
                max={new Date().toISOString().slice(0, 16)}
                className={cn(errors.scheduledAt && 'border-destructive')}
                {...register('scheduledAt')}
              />
              {errors.scheduledAt && (
                <p className="text-xs text-destructive">{errors.scheduledAt.message}</p>
              )}
              <p className="text-xs text-foreground-muted">
                A data da sessão não pode ser futura.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="proc-type">Tipo</Label>
                <Controller
                  control={control}
                  name="type"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="proc-type">
                        <SelectValue />
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
              <div className="space-y-2">
                <Label htmlFor="proc-location">Local</Label>
                <Controller
                  control={control}
                  name="location"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="proc-location">
                        <SelectValue />
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

            <div className="space-y-2">
              <Label htmlFor="proc-notes">Observações</Label>
              <Textarea
                id="proc-notes"
                rows={2}
                className="resize-none"
                placeholder="Opcional..."
                {...register('notes')}
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <DialogClose asChild>
                <Button variant="outline" type="button">
                  Cancelar
                </Button>
              </DialogClose>
              <Button type="submit" variant="gradient" disabled={createSessionMutation.isPending}>
                {createSessionMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Criando...
                  </>
                ) : (
                  'Continuar'
                )}
              </Button>
            </div>
          </form>
        )}

        {/* Step 2: Audio upload */}
        {step === 'upload' && (
          <div className="space-y-4">
            {/* Drag and drop */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 text-center transition-all duration-200',
                isDragging
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-border-hover hover:bg-surface-elevated/50',
                isUploading && 'pointer-events-none opacity-50',
              )}
              onClick={() => !isUploading && fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_FORMATS}
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border-subtle bg-surface-elevated">
                <UploadCloud className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  Arraste arquivos de áudio ou clique para selecionar
                </p>
                <p className="mt-1 text-xs text-foreground-muted">
                  Múltiplos arquivos • MP3, WAV, M4A, MP4, WebM • Máx. 500 MB cada
                </p>
              </div>
            </div>

            {/* Pending files list */}
            {pendingFiles.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">
                    Arquivos ({pendingFiles.length})
                  </h3>
                  <span className="text-xs text-foreground-muted">
                    Total: {formatBytes(totalSize)}
                  </span>
                </div>
                <div className="space-y-2">
                  {pendingFiles.map((file, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3"
                    >
                      <FileAudio className="h-5 w-5 shrink-0 text-primary" />
                      <div className="flex-1 overflow-hidden">
                        <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
                        <p className="text-[11px] text-foreground-muted">{formatBytes(file.size)}</p>
                      </div>
                      {isUploading && uploadingIdx === idx ? (
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      ) : isUploading && uploadingIdx !== null && uploadingIdx > idx ? (
                        <CheckCircle2 className="h-4 w-4 text-success" />
                      ) : !isUploading ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => removeFile(idx)}
                          className="hover:bg-destructive/10 hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Upload progress */}
            {isUploading && (
              <div className="flex items-center gap-2 rounded-md bg-primary/5 p-3 text-sm text-primary">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>
                  Enviando arquivo {uploadedCount + 1} de {pendingFiles.length}...
                </span>
              </div>
            )}

            {/* Warning */}
            <div className="flex items-start gap-2 rounded-md border border-border-subtle bg-surface-elevated/50 p-3">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              <p className="text-xs leading-relaxed text-foreground-muted">
                A transcrição é processada em segundo plano pelo worker local (Whisper).
                Os arquivos de áudio serão <strong>deletados</strong> após o processamento.
                Você pode acompanhar o status na página de Processamento.
              </p>
            </div>

            {/* Actions */}
            <div className="flex justify-between gap-3 pt-2">
              <Button variant="ghost" onClick={handleClose} disabled={isUploading}>
                Cancelar
              </Button>
              <Button
                variant="gradient"
                disabled={pendingFiles.length === 0 || isUploading}
                onClick={() => uploadAllMutation.mutate(pendingFiles)}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <UploadCloud className="h-4 w-4" />
                    Enviar {pendingFiles.length} arquivo{pendingFiles.length !== 1 ? 's' : ''}
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
