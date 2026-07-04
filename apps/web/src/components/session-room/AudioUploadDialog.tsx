import { useCallback, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  AlertCircle,
  CheckCircle2,
  FileAudio,
  Info,
  Loader2,
  Trash2,
  UploadCloud,
} from 'lucide-react';

import { api } from '@/lib/api-client';
import type { SessionRecording } from '@/lib/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface AudioUploadDialogProps {
  readonly sessionId: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

const ACCEPTED_FORMATS = '.mp3,.wav,.m4a,.mp4,.webm';
const ACCEPTED_TYPES = ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/m4a', 'audio/webm', 'video/mp4', 'video/webm'];
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB

const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'warning' | 'success' | 'destructive' | 'outline' }> = {
  UPLOADED: { label: 'Enviado', variant: 'outline' },
  PROCESSING: { label: 'Processando', variant: 'warning' },
  COMPLETED: { label: 'Concluído', variant: 'success' },
  FAILED: { label: 'Falhou', variant: 'destructive' },
};

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

export function AudioUploadDialog({ sessionId, open, onOpenChange }: AudioUploadDialogProps): React.ReactNode {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);

  const recordingsQuery = useQuery({
    queryKey: ['session-audio', sessionId],
    queryFn: () => api.sessions.listAudio(sessionId),
    enabled: open,
    refetchInterval: (query) => {
      // Poll while any recording is in PROCESSING or UPLOADED status
      const hasProcessing = query.state.data?.some(
        (r: SessionRecording) => r.status === 'PROCESSING' || r.status === 'UPLOADED',
      );
      return hasProcessing ? 5000 : false;
    },
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      setUploadProgress(0);
      // Simulate progress while uploading (fetch doesn't support upload progress)
      const interval = setInterval(() => {
        setUploadProgress((prev) => Math.min(prev + 10, 90));
      }, 300);
      return api.sessions.uploadAudio(sessionId, file).finally(() => {
        clearInterval(interval);
        setUploadProgress(100);
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['session-audio', sessionId] });
      toast.success('Áudio enviado com sucesso. Aguardando processamento.');
      setUploadProgress(0);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Erro ao enviar áudio');
      setUploadProgress(0);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (recordingId: string) => api.sessions.deleteAudio(sessionId, recordingId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['session-audio', sessionId] });
      toast.success('Gravação removida');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Erro ao remover gravação'),
  });

  const handleFile = useCallback(
    (file: File) => {
      if (!ACCEPTED_TYPES.some((type) => file.type === type) && !file.name.match(/\.(mp3|wav|m4a|mp4|webm)$/i)) {
        toast.error('Formato não suportado. Use: mp3, wav, m4a, mp4 ou webm.');
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        toast.error('Arquivo muito grande. Tamanho máximo: 500 MB.');
        return;
      }
      uploadMutation.mutate(file);
    },
    [uploadMutation],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Reset input so the same file can be selected again
    e.target.value = '';
  };

  const handleDelete = (recording: SessionRecording) => {
    if (window.confirm(`Remover a gravação "${fileNameFromStorageKey(recording.storageKey)}"?`)) {
      deleteMutation.mutate(recording.id);
    }
  };

  const recordings = recordingsQuery.data ?? [];
  const hasProcessing = recordings.some((r) => r.status === 'PROCESSING' || r.status === 'UPLOADED');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UploadCloud className="h-5 w-5 text-primary" />
            Upload de Áudio
          </DialogTitle>
          <DialogDescription>
            Envie gravações de áudio para transcrição automática.
          </DialogDescription>
        </DialogHeader>

        {/* Drag and drop area */}
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
          )}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_FORMATS}
            onChange={handleFileSelect}
            className="hidden"
          />
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border-subtle bg-surface-elevated">
            <UploadCloud className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              Arraste um arquivo de áudio ou clique para selecionar
            </p>
            <p className="mt-1 text-xs text-foreground-muted">
              Formatos: MP3, WAV, M4A, MP4, WebM • Máx. 500 MB
            </p>
          </div>
        </div>

        {/* Upload progress */}
        {uploadMutation.isPending && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="space-y-2"
          >
            <div className="flex items-center gap-2 text-sm text-foreground-secondary">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span>Enviando arquivo...</span>
            </div>
            <Progress value={uploadProgress} />
          </motion.div>
        )}

        {/* Worker info notice */}
        <div className="flex items-start gap-2 rounded-md border border-border-subtle bg-surface-elevated/50 p-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <p className="text-xs leading-relaxed text-foreground-muted">
            O processamento de áudio é assíncrono e depende do worker local estar online.
            Após o upload, a transcrição será processada em segundo plano.
          </p>
        </div>

        {/* Existing recordings */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Gravações</h3>
            {recordings.length > 0 && (
              <Badge variant="outline" className="text-[10px]">
                {recordings.length} arquivo{recordings.length !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>

          {recordingsQuery.isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : recordings.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
              <FileAudio className="h-8 w-8 text-foreground-muted" />
              <p className="text-sm text-foreground-muted">Nenhuma gravação enviada ainda</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recordings.map((recording) => {
                const status = STATUS_CONFIG[recording.status] ?? STATUS_CONFIG.UPLOADED!;
                const isProcessing = recording.status === 'PROCESSING' || recording.status === 'UPLOADED';

                return (
                  <div
                    key={recording.id}
                    className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3 transition-all duration-200 hover:border-border-hover"
                  >
                    <div className="shrink-0">
                      {recording.status === 'COMPLETED' ? (
                        <CheckCircle2 className="h-5 w-5 text-success" />
                      ) : isProcessing ? (
                        <Loader2 className="h-5 w-5 animate-spin text-warning" />
                      ) : recording.status === 'FAILED' ? (
                        <AlertCircle className="h-5 w-5 text-destructive" />
                      ) : (
                        <FileAudio className="h-5 w-5 text-foreground-muted" />
                      )}
                    </div>
                    <div className="flex-1 overflow-hidden space-y-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {fileNameFromStorageKey(recording.storageKey)}
                      </p>
                      <div className="flex items-center gap-2 text-[11px] text-foreground-muted">
                        <span>{formatBytes(recording.sizeBytes)}</span>
                        <span>•</span>
                        <span>{format(new Date(recording.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
                      </div>
                      {isProcessing && (
                        <div className="flex items-center gap-1.5 text-[11px] text-warning">
                          <span className="h-1.5 w-1.5 rounded-full bg-warning animate-ai-pulse" />
                          Aguardando processamento...
                        </div>
                      )}
                      {recording.status === 'FAILED' && recording.errorMessage && (
                        <p className="text-[11px] text-destructive">{recording.errorMessage}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant={status.variant} className="text-[10px]">
                        {status.label}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleDelete(recording)}
                        disabled={deleteMutation.isPending}
                        className="hover:bg-destructive/10 hover:text-destructive"
                        title="Remover gravação"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer info */}
        {hasProcessing && (
          <div className="flex items-center gap-2 rounded-md bg-warning/5 p-3 text-xs text-warning">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Algumas gravações estão sendo processadas. A página será atualizada automaticamente.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
