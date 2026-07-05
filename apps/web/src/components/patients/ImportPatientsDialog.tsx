import { useState, useMemo, useCallback, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  FileUp,
  Loader2,
  Upload,
  X,
} from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api, type PatientImportResult } from '@/lib/api-client';
import { cn } from '@/lib/utils';

const SEPARATORS = [
  { value: ',', label: 'Vírgula ( , )' },
  { value: ';', label: 'Ponto e vírgula ( ; )' },
  { value: '|', label: 'Pipe ( | )' },
  { value: '\t', label: 'Tab' },
];

const PATIENT_FIELDS = [
  { key: 'fullNameCol', label: 'Nome *', required: true },
  { key: 'emailCol', label: 'Email', required: false },
  { key: 'phoneCol', label: 'Telefone', required: false },
  { key: 'dateOfBirthCol', label: 'Data de Nascimento', required: false },
  { key: 'genderCol', label: 'Gênero', required: false },
] as const;

interface ImportPatientsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportPatientsDialog({ open, onOpenChange }: ImportPatientsDialogProps): React.ReactNode {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [separator, setSeparator] = useState<string>(',');
  const [skipHeader, setSkipHeader] = useState(true);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [result, setResult] = useState<PatientImportResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fileText, setFileText] = useState<string | null>(null);
  const [previewCollapsed, setPreviewCollapsed] = useState(false);
  const dragCounter = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Parse preview
  const preview = useMemo(() => {
    if (!file || !fileText) return null;

    const lines = fileText.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const startIdx = skipHeader ? 1 : 0;
    const previewRows: string[][] = [];
    for (let i = startIdx; i < Math.min(startIdx + 10, lines.length); i++) {
      previewRows.push(parseCsvLine(lines[i]!, separator));
    }

    // Column options from the header row (or first data row if no header)
    const headerRow = skipHeader ? parseCsvLine(lines[0]!, separator) : previewRows[0] ?? [];
    const columnOptions = headerRow.map((val, idx) => ({
      value: String(idx),
      label: val ? `Col ${idx + 1}: ${val.slice(0, 30)}` : `Col ${idx + 1}`,
    }));

    return { previewRows, columnOptions, totalLines: lines.length - startIdx };
  }, [file, fileText, separator, skipHeader]);

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Nenhum arquivo selecionado');
      const formData = new FormData();
      formData.append('file', file);
      formData.append('separator', separator);
      formData.append('skipHeader', String(skipHeader));
      for (const field of PATIENT_FIELDS) {
        const col = columnMapping[field.key];
        if (col !== undefined && col !== '') {
          formData.append(field.key, col);
        }
      }
      return api.patients.import(formData);
    },
    onSuccess: (data) => {
      setResult(data);
      void queryClient.invalidateQueries({ queryKey: ['patients'] });
      if (data.errors === 0 && data.duplicates === 0) {
        toast.success(`${data.imported} pacientes importados com sucesso`);
      } else {
        toast.success(
          `${data.imported} importados, ${data.duplicates} duplicados, ${data.errors} erros`
        );
      }
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Erro ao importar pacientes');
    },
  });

  const processFile = useCallback(async (selectedFile: File) => {
    setFile(selectedFile);
    setResult(null);
    setColumnMapping({});
    setFileText(null);

    // Read file content
    const text = await selectedFile.text();
    setFileText(text);

    // Auto-detect separator
    const counts: Record<string, number> = { ',': 0, ';': 0, '|': 0, '\t': 0 };
    const firstLine = text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? '';
    for (const sep of Object.keys(counts)) {
      counts[sep] = firstLine.split(sep).length - 1;
    }
    const detected = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (detected && detected[1] > 0) {
      setSeparator(detected[0]);
    }
  }, []);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    await processFile(selectedFile);
    // Reset so the same file can be selected again later
    e.target.value = '';
  }, [processFile]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragging(false);

    const droppedFile = e.dataTransfer.files?.[0];
    if (!droppedFile) return;

    // Accept only CSV-like files
    const isCsv = droppedFile.name.endsWith('.csv') || droppedFile.type === 'text/csv';
    if (!isCsv) {
      toast.error('Apenas arquivos CSV são suportados.');
      return;
    }

    await processFile(droppedFile);
  }, [processFile]);

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
    setFileText(null);
    setResult(null);
    setColumnMapping({});
  };

  const canImport = file && preview && columnMapping.fullNameCol !== undefined && columnMapping.fullNameCol !== '';

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) handleReset(); }}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar Pacientes — CSV</DialogTitle>
        </DialogHeader>

        {!result && (
          <div className="space-y-5">
            {/* File upload */}
            <div className="space-y-2">
              <Label>Arquivo CSV</Label>
              {!file ? (
                <div
                  onDrop={handleDrop}
                  onDragEnter={handleDragEnter}
                  onDragLeave={handleDragLeave}
                  onDragOver={handleDragOver}
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 cursor-pointer transition-colors',
                    isDragging
                      ? 'border-primary bg-primary/10 scale-[1.01]'
                      : 'border-border hover:border-primary/50',
                  )}
                >
                  <FileUp className={cn('h-8 w-8 transition-colors', isDragging ? 'text-primary' : 'text-foreground-muted')} />
                  <span className="text-sm text-foreground-secondary">
                    {isDragging
                      ? 'Solte o arquivo aqui'
                      : 'Clique para selecionar ou arraste um arquivo .csv'}
                  </span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                </div>
              ) : (
                <div className="flex items-center justify-between rounded-lg border border-border bg-surface p-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileUp className="h-5 w-5 text-primary shrink-0" />
                    <span className="text-sm truncate">{file.name}</span>
                  </div>
                  <Button variant="ghost" size="icon-sm" onClick={handleReset}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>

            {file && preview && (
              <>
                {/* Options */}
                <div className="flex flex-wrap items-end gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Separador</Label>
                    <Select value={separator} onValueChange={setSeparator}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SEPARATORS.map((s) => (
                          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center gap-2 pb-2">
                    <Checkbox
                      id="skip-header"
                      checked={skipHeader}
                      onCheckedChange={(v) => setSkipHeader(v === true)}
                    />
                    <Label htmlFor="skip-header" className="text-sm cursor-pointer">
                      Ignorar primeira linha (cabeçalho)
                    </Label>
                  </div>
                </div>

                {/* Preview */}
                <div className="space-y-2">
                  <div
                    onClick={() => setPreviewCollapsed((v) => !v)}
                    className="flex w-full items-center gap-1.5 cursor-pointer select-none py-1"
                  >
                    <ChevronDown
                      className={cn(
                        'h-4 w-4 text-foreground-secondary transition-transform',
                        previewCollapsed ? '-rotate-90' : '',
                      )}
                    />
                    <span className="text-xs text-foreground-secondary">
                      Preview ({preview.previewRows.length} de {preview.totalLines} linhas)
                    </span>
                  </div>
                  {!previewCollapsed && (
                    <div className="rounded-lg border border-border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-10 text-center">#</TableHead>
                            {preview.previewRows[0]?.map((_, idx) => (
                              <TableHead key={idx}>
                                Col {idx + 1}
                              </TableHead>
                            )) ?? null}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {preview.previewRows.map((row, rowIdx) => (
                            <TableRow key={rowIdx}>
                              <TableCell className="text-center text-xs text-foreground-muted">
                                {skipHeader ? rowIdx + 2 : rowIdx + 1}
                              </TableCell>
                              {preview.previewRows[0]?.map((_, colIdx) => (
                                <TableCell key={colIdx} className="text-xs break-words">
                                  {row[colIdx] ?? ''}
                                </TableCell>
                              )) ?? null}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>

                {/* Column mapping */}
                <div className="space-y-3">
                  <Label className="text-xs">Mapeamento de colunas</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {PATIENT_FIELDS.map((field) => (
                      <div key={field.key} className="space-y-1.5">
                        <Label className="text-xs text-foreground-secondary">
                          {field.label}
                        </Label>
                        <Select
                          value={columnMapping[field.key] ?? ''}
                          onValueChange={(v) =>
                            setColumnMapping((prev) => ({ ...prev, [field.key]: v }))
                          }
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Não importar" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">Não importar</SelectItem>
                            {preview.columnOptions.map((col) => (
                              <SelectItem key={col.value} value={col.value}>
                                {col.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Import button */}
                <div className="flex justify-end gap-3 pt-2">
                  <Button
                    variant="gradient"
                    disabled={!canImport || importMutation.isPending}
                    onClick={() => importMutation.mutate()}
                  >
                    {importMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Importando...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4" />
                        Importar {preview.totalLines} pacientes
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-4">
              <ResultCard
                icon={<CheckCircle2 className="h-5 w-5 text-success" />}
                label="Importados"
                value={result.imported}
                className="border-success/30"
              />
              <ResultCard
                icon={<AlertCircle className="h-5 w-5 text-warning" />}
                label="Duplicados"
                value={result.duplicates}
                className="border-warning/30"
              />
              <ResultCard
                icon={<AlertCircle className="h-5 w-5 text-destructive" />}
                label="Erros"
                value={result.errors}
                className="border-destructive/30"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-foreground-secondary">Progresso</span>
                <span className="text-foreground-muted">
                  {result.imported + result.duplicates + result.errors} / {result.total}
                </span>
              </div>
              <Progress value={(result.imported + result.duplicates + result.errors) / result.total * 100} />
            </div>

            {result.errorDetails.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs">Detalhes dos erros</Label>
                <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-surface p-3 space-y-1">
                  {result.errorDetails.map((err, idx) => (
                    <p key={idx} className="text-xs text-destructive">{err}</p>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={handleReset}>
                Importar outro arquivo
              </Button>
              <Button variant="gradient" onClick={() => onOpenChange(false)}>
                Concluir
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ResultCard({ icon, label, value, className }: {
  icon: React.ReactNode;
  label: string;
  value: number;
  className?: string;
}): React.ReactNode {
  return (
    <div className={cn('rounded-lg border bg-surface p-4 space-y-1', className)}>
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm text-foreground-secondary">{label}</span>
      </div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

// ── CSV parsing helpers ──────────────────────────────────────────────────────

function parseCsvLine(line: string, separator: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;

    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === separator) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
  }
  result.push(current);
  return result;
}
