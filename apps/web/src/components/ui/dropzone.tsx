import { useCallback, useRef, useState, type ReactNode } from 'react';
import { FileUp } from 'lucide-react';

import { cn } from '@/lib/utils';

interface DropzoneProps {
  /** Called when a file is dropped or selected (after passing validation) */
  onFile: (file: File) => void;
  /** Called when a file is dropped or selected but fails validation */
  onError?: (message: string) => void;
  /** Accepted file extensions, e.g. ['.pdf', '.docx'] */
  acceptedExtensions: string[];
  /** Accepted MIME types for the hidden input (comma-separated) */
  acceptedMimes: string[];
  /** Human-readable labels for the hint, e.g. ['PDF', 'DOCX'] */
  acceptedLabels: string[];
  /** Max file size in MB */
  maxFileSizeMB: number;
  /** Optional className for the dropzone */
  className?: string;
  /** Icon to show (defaults to FileUp) */
  icon?: ReactNode;
  /** Placeholder text when no file is being dragged */
  placeholder?: string;
  /** Text shown while dragging over the dropzone */
  dragActiveText?: string;
}

export function Dropzone({
  onFile,
  onError,
  acceptedExtensions,
  acceptedMimes,
  acceptedLabels,
  maxFileSizeMB,
  className,
  icon,
  placeholder,
  dragActiveText,
}: DropzoneProps): ReactNode {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  const validate = useCallback(
    (file: File): string | null => {
      if (file.size > maxFileSizeMB * 1024 * 1024) {
        return `Arquivo muito grande. Máximo: ${maxFileSizeMB}MB`;
      }

      const ext = '.' + (file.name.split('.').pop()?.toLowerCase() ?? '');
      if (!acceptedExtensions.includes(ext)) {
        return `Formato não suportado. Use: ${acceptedLabels.join(', ')}`;
      }

      return null;
    },
    [acceptedExtensions, acceptedLabels, maxFileSizeMB],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const error = validate(file);
      if (error) {
        onError?.(error);
        return;
      }

      onFile(file);
      // Reset so the same file can be selected again
      e.target.value = '';
    },
    [onFile, onError, validate],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current = 0;
      setIsDragging(false);

      const file = e.dataTransfer.files?.[0];
      if (!file) return;

      const error = validate(file);
      if (error) {
        onError?.(error);
        return;
      }

      onFile(file);
    },
    [onFile, onError, validate],
  );

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

  return (
    <div
      onDrop={handleDrop}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onClick={() => inputRef.current?.click()}
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed cursor-pointer transition-all',
        isDragging
          ? 'border-primary bg-primary/10 scale-[1.01]'
          : 'border-border hover:border-primary/50',
        className,
      )}
    >
      {icon ?? (
        <FileUp
          className={cn(
            'h-8 w-8 transition-colors',
            isDragging ? 'text-primary' : 'text-foreground-muted',
          )}
        />
      )}
      <span className="text-sm text-foreground-secondary text-center">
        {isDragging
          ? (dragActiveText ?? 'Solte o arquivo aqui')
          : (placeholder ?? 'Clique para selecionar ou arraste um arquivo')}
      </span>
      <span className="text-xs text-foreground-muted">
        {acceptedLabels.join(', ')} — até {maxFileSizeMB}MB
      </span>
      <input
        ref={inputRef}
        type="file"
        accept={acceptedMimes.join(',')}
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
}
