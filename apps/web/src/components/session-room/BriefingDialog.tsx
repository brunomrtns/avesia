import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileText, Loader2, Sparkles } from 'lucide-react';

import { api } from '@/lib/api-client';
import type { BriefingResponse } from '@/lib/api-client';
import { AIDisclaimer } from '@/components/ui/ai-disclaimer';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { MarkdownRenderer } from './MarkdownRenderer';

interface BriefingDialogProps {
  readonly sessionId: string;
  readonly patientName: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export function BriefingDialog({
  sessionId,
  patientName,
  open,
  onOpenChange,
}: BriefingDialogProps): React.ReactNode {
  const [briefing, setBriefing] = useState<BriefingResponse | null>(null);

  const generateMutation = useMutation({
    mutationFn: () => api.sessions.generateBriefing(sessionId),
    onSuccess: (data) => {
      setBriefing(data);
      if (!data.hasHistory) {
        toast.info('Sem histórico anterior — primeira sessão do paciente');
      } else {
        toast.success('Briefing gerado com sucesso');
      }
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Falha ao gerar briefing');
    },
  });

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setBriefing(null);
      generateMutation.reset();
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Briefing Pré-Sessão
          </DialogTitle>
          <DialogDescription>
            Resumo do histórico de {patientName} para preparação antes da sessão.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4">
          {generateMutation.isPending && (
            <div className="flex flex-col items-center justify-center gap-3 py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-foreground-secondary">
                Analisando histórico do paciente...
              </p>
            </div>
          )}

          {!generateMutation.isPending && !briefing && (
            <div className="flex flex-col items-center justify-center gap-4 py-12">
              <FileText className="h-12 w-12 text-foreground-muted" />
              <p className="text-center text-sm text-foreground-secondary max-w-sm">
                Gere um briefing com base nas sessões anteriores, notas clínicas e
                histórico do paciente para se preparar antes do atendimento.
              </p>
              <Button
                variant="gradient"
                onClick={() => generateMutation.mutate()}
              >
                <Sparkles className="h-4 w-4" />
                Gerar Briefing
              </Button>
            </div>
          )}

          {briefing && !generateMutation.isPending && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-surface p-4">
                <div className="font-clinical text-sm leading-relaxed">
                  <MarkdownRenderer content={briefing.content} />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-foreground-muted">
                  Gerado em {new Date(briefing.generatedAt).toLocaleString('pt-BR')}
                  {briefing.tokensUsed ? ` • ${briefing.tokensUsed} tokens` : ''}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => generateMutation.mutate()}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Regenerar
                </Button>
              </div>
            </div>
          )}
        </div>
        <AIDisclaimer variant="footer" className="px-6 pb-4" />
      </DialogContent>
    </Dialog>
  );
}
