import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, ShieldCheck, AlertTriangle, FileText, Sparkles, Lock } from 'lucide-react';

import type { PendingTermsVersion } from '@avesia/types';

import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface TermsAcceptanceDialogProps {
  readonly pendingTerms: readonly PendingTermsVersion[];
  readonly onAccepted: () => void;
}

const TYPE_META: Record<
  PendingTermsVersion['type'],
  { icon: typeof FileText; label: string; variant: 'default' | 'warning' | 'accent' }
> = {
  TERMS_OF_USE: { icon: FileText, label: 'Termos de Uso', variant: 'default' },
  AI_NOTICE: { icon: Sparkles, label: 'Aviso de IA', variant: 'accent' },
  PRIVACY_POLICY: { icon: Lock, label: 'Privacidade', variant: 'default' },
};

export function TermsAcceptanceDialog({
  pendingTerms,
  onAccepted,
}: TermsAcceptanceDialogProps): React.ReactNode {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [contents, setContents] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  // Sort: AI_NOTICE first (most important for this product), then TERMS, then PRIVACY
  const sortedTerms = useMemo(() => {
    const order: Record<string, number> = { AI_NOTICE: 0, TERMS_OF_USE: 1, PRIVACY_POLICY: 2 };
    return [...pendingTerms].sort((a, b) => (order[a.type] ?? 99) - (order[b.type] ?? 99));
  }, [pendingTerms]);

  useEffect(() => {
    if (pendingTerms.length === 0) {
      setOpen(false);
      return;
    }
    setOpen(true);
    setLoading(true);
    setActiveIndex(0);
    setChecked({});
    setError(null);

    void (async () => {
      try {
        const results = await Promise.all(
          pendingTerms.map((t) => api.terms.getByType(t.type)),
        );
        const map: Record<string, string> = {};
        pendingTerms.forEach((t, i) => {
          map[t.id] = results[i]?.content ?? '';
        });
        setContents(map);
      } catch {
        setError('Não foi possível carregar os termos. Tente novamente.');
      } finally {
        setLoading(false);
      }
    })();
  }, [pendingTerms]);

  const current = sortedTerms[activeIndex];
  const allChecked = sortedTerms.every((t) => checked[t.id] === true);

  const handleAccept = useCallback(async () => {
    if (!allChecked) return;
    setAccepting(true);
    setError(null);
    try {
      await api.terms.accept(sortedTerms.map((t) => t.id));
      setOpen(false);
      onAccepted();
    } catch {
      setError('Erro ao registrar aceite. Tente novamente.');
    } finally {
      setAccepting(false);
    }
  }, [allChecked, sortedTerms, onAccepted]);

  const handleNext = useCallback(() => {
    if (activeIndex < sortedTerms.length - 1) {
      setActiveIndex(activeIndex + 1);
    }
  }, [activeIndex, sortedTerms.length]);

  const handlePrev = useCallback(() => {
    if (activeIndex > 0) {
      setActiveIndex(activeIndex - 1);
    }
  }, [activeIndex]);

  const isLast = activeIndex === sortedTerms.length - 1;
  const currentMeta = current ? TYPE_META[current.type] : null;

  return (
    <Dialog open={open} onOpenChange={() => { /* prevent close without accepting */ }}>
      <DialogContent
        className="max-h-[90vh] max-w-3xl overflow-hidden p-0"
        showCloseButton={false}
      >
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Aceite de Termos e Avisos
          </DialogTitle>
          <DialogDescription>
            Para continuar utilizando a plataforma, é necessário revisar e aceitar os
            termos abaixo. Esta etapa é obrigatória e registra sua concordância com a
            versão vigente de cada documento.
          </DialogDescription>
        </DialogHeader>

        {/* Tabs / steps */}
        <div className="flex items-center gap-1 border-b border-border px-6 py-2">
          {sortedTerms.map((t, i) => {
            const meta = TYPE_META[t.type];
            const Icon = meta.icon;
            const isActive = i === activeIndex;
            const isChecked = checked[t.id] === true;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveIndex(i)}
                className={cn(
                  'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-foreground-secondary hover:bg-surface-elevated',
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{meta.label}</span>
                {isChecked && <ShieldCheck className="h-3.5 w-3.5 text-success" />}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex min-h-0 flex-1 flex-col">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : current && currentMeta ? (
            <>
              <div className="flex items-center justify-between px-6 py-3">
                <div className="flex items-center gap-2">
                  <h3 className="font-clinical text-base font-semibold">{current.title}</h3>
                  <Badge variant={currentMeta.variant}>v{current.version}</Badge>
                </div>
              </div>

              {current.summary && (
                <div className="mx-6 mb-3 rounded-lg border border-warning/20 bg-warning/5 px-4 py-3">
                  <div className="flex gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
                    <p className="text-sm text-foreground-secondary">{current.summary}</p>
                  </div>
                </div>
              )}

              <ScrollArea className="max-h-[40vh] px-6">
                <div className="prose prose-sm prose-invert max-w-none pb-4 font-clinical text-foreground-secondary [&_h1]:text-foreground [&_h2]:text-foreground [&_h3]:text-foreground [&_strong]:text-foreground">
                  <pre className="whitespace-pre-wrap font-clinical text-sm leading-relaxed">
                    {contents[current.id] ?? 'Conteúdo indisponível.'}
                  </pre>
                </div>
              </ScrollArea>

              {/* Acceptance checkbox */}
              <div className="border-t border-border px-6 py-4">
                <label className="flex cursor-pointer items-start gap-3">
                  <Checkbox
                    checked={checked[current.id] === true}
                    onCheckedChange={(v) =>
                      setChecked((prev) => ({ ...prev, [current.id]: v === true }))
                    }
                  />
                  <span className="text-sm text-foreground-secondary">
                    Li e estou de acordo com a <strong className="text-foreground">versão {current.version}</strong> do
                    documento <strong className="text-foreground">{current.title}</strong>. Compreendo que este aceite
                    fica registrado com data, hora e minha identificação.
                  </span>
                </label>
              </div>
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-6 py-4">
          <div className="flex items-center gap-2 text-sm text-foreground-muted">
            <span>{activeIndex + 1} de {sortedTerms.length}</span>
            {error && <span className="text-destructive">{error}</span>}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePrev}
              disabled={activeIndex === 0}
            >
              Anterior
            </Button>
            {!isLast ? (
              <Button size="sm" onClick={handleNext} disabled={!checked[current?.id ?? '']}>
                Próximo
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleAccept}
                disabled={!allChecked || accepting}
              >
                {accepting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="h-4 w-4" />
                )}
                Aceitar todos e continuar
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
