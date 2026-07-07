import { useState, useRef, useCallback } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Upload, AlertCircle, FileText, FileUp, X } from 'lucide-react';
import { buildApiUrl, getAccessToken } from '../../lib/api-client.js';
import { cn } from '@/lib/utils';

interface UploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  knowledgeBaseId: string;
}

const ACCEPTED_TYPES = [
  { ext: '.pdf', label: 'PDF', mime: 'application/pdf' },
  { ext: '.docx', label: 'DOCX', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  { ext: '.txt', label: 'TXT', mime: 'text/plain' },
  { ext: '.md', label: 'Markdown', mime: 'text/markdown' },
];

const ACCEPTED_EXTS = ACCEPTED_TYPES.map((t) => t.ext);
const MAX_SIZE_MB = 50;

export function UploadDialog({ open, onOpenChange, knowledgeBaseId }: UploadDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  const validateFile = useCallback((f: File): string | null => {
    if (f.size > MAX_SIZE_MB * 1024 * 1024) {
      return `Arquivo muito grande. Máximo: ${MAX_SIZE_MB}MB`;
    }

    const ext = '.' + f.name.split('.').pop()?.toLowerCase();
    if (!ACCEPTED_EXTS.includes(ext)) {
      return `Formato não suportado. Use: ${ACCEPTED_TYPES.map((t) => t.label).join(', ')}`;
    }

    return null;
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    const validationError = validateFile(f);
    if (validationError) {
      setError(validationError);
      return;
    }

    setFile(f);
    setError(null);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragging(false);

    const droppedFile = e.dataTransfer.files?.[0];
    if (!droppedFile) return;

    const validationError = validateFile(droppedFile);
    if (validationError) {
      setError(validationError);
      return;
    }

    setFile(droppedFile);
    setError(null);
  }, [validateFile]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleReset = () => {
    setFile(null);
    setError(null);
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Selecione um arquivo primeiro.');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const headers: Record<string, string> = {};
      const token = getAccessToken();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const res = await fetch(buildApiUrl(`/knowledge-bases/${knowledgeBaseId}/upload`), {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? 'Erro ao fazer upload');
      }

      onOpenChange(false);
      setFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao fazer upload');
    } finally {
      setUploading(false);
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <DialogPrimitive.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-gray-900 border border-gray-800 rounded-xl p-6 w-full max-w-lg z-50 shadow-2xl">
          <DialogPrimitive.Title className="text-lg font-semibold text-white mb-1">
            Upload de Documento
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="text-sm text-slate-400 mb-4">
            Formatos aceitos: {ACCEPTED_TYPES.map((t) => t.label).join(', ')}. Máx: {MAX_SIZE_MB}MB.
          </DialogPrimitive.Description>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-300 mb-1">Arquivo</label>
              {file ? (
                <div className="flex items-center justify-between gap-3 px-3 py-4 border border-gray-700 rounded-lg bg-gray-800/50">
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="w-5 h-5 text-indigo-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm text-white truncate">{file.name}</p>
                      <p className="text-xs text-slate-500">
                        {(file.size / 1024 / 1024).toFixed(1)}MB
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleReset}
                    className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-gray-700 hover:text-white"
                    aria-label="Remover arquivo"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div
                  onDrop={handleDrop}
                  onDragEnter={handleDragEnter}
                  onDragLeave={handleDragLeave}
                  onDragOver={handleDragOver}
                  onClick={() => inputRef.current?.click()}
                  className={cn(
                    'flex flex-col items-center justify-center gap-2 px-3 py-8 border-2 border-dashed rounded-lg cursor-pointer transition-all',
                    isDragging
                      ? 'border-indigo-500 bg-indigo-500/10 scale-[1.01]'
                      : 'border-gray-600 hover:border-indigo-500',
                  )}
                >
                  <FileUp className={cn('w-7 h-7 transition-colors', isDragging ? 'text-indigo-400' : 'text-slate-400')} />
                  <span className="text-sm text-slate-400 text-center">
                    {isDragging
                      ? 'Solte o arquivo aqui'
                      : 'Clique para selecionar ou arraste um arquivo'}
                  </span>
                  <span className="text-xs text-slate-600">
                    PDF, DOCX, TXT, MD — até {MAX_SIZE_MB}MB
                  </span>
                  <input
                    ref={inputRef}
                    type="file"
                    accept={ACCEPTED_TYPES.map((t) => t.mime).join(',')}
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </div>
              )}
            </div>

            {error && (
              <div className="flex items-start gap-2 text-amber-400 text-sm">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <DialogPrimitive.Close className="px-4 py-2 text-sm text-slate-300 hover:text-white transition-colors">
                Cancelar
              </DialogPrimitive.Close>
              <button
                onClick={handleUpload}
                disabled={uploading || !file}
                className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors flex items-center gap-2"
              >
                {uploading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Enviando...
                  </div>
                ) : (
                  <><Upload className="w-4 h-4" /> Enviar</>
                )}
              </button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
