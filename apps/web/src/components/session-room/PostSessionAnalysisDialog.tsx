import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChartLine, Loader2, Sparkles } from 'lucide-react';

import { api } from '@/lib/api-client';
import type { PostSessionAnalysisResponse } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MarkdownRenderer } from './MarkdownRenderer';

interface PostSessionAnalysisDialogProps {
  readonly sessionId: string;
  readonly patientName: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export function PostSessionAnalysisDialog({
  sessionId,
  patientName,
  open,
  onOpenChange,
}: PostSessionAnalysisDialogProps): React.ReactNode {
  const [analysis, setAnalysis] = useState<PostSessionAnalysisResponse | null>(null);

  const generateMutation = useMutation({
    mutationFn: () => api.sessions.generateAnalysis(sessionId),
    onSuccess: (data) => {
      setAnalysis(data);
      toast.success('Análise pós-sessão gerada com sucesso');
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Falha ao gerar análise');
    },
  });

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setAnalysis(null);
      generateMutation.reset();
    }
    onOpenChange(next);
  };

  const totalTokens =
    analysis ? analysis.tokensUsed.summary + analysis.tokensUsed.analysis : 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ChartLine className="h-5 w-5 text-primary" />
            Análise Pós-Sessão
          </DialogTitle>
          <DialogDescription>
            Resumo e análise clínica da sessão de {patientName}.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4">
          {generateMutation.isPending && (
            <div className="flex flex-col items-center justify-center gap-3 py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-foreground-secondary">
                Analisando transcrição e gerando resumo + análise clínica...
              </p>
            </div>
          )}

          {!generateMutation.isPending && !analysis && (
            <div className="flex flex-col items-center justify-center gap-4 py-12">
              <ChartLine className="h-12 w-12 text-foreground-muted" />
              <p className="text-center text-sm text-foreground-secondary max-w-sm">
                Gere um resumo da sessão e uma análise clínica estruturada
                (humor, risco, padrões comportamentais) a partir da transcrição.
              </p>
              <Button
                variant="gradient"
                onClick={() => generateMutation.mutate()}
              >
                <Sparkles className="h-4 w-4" />
                Gerar Análise
              </Button>
            </div>
          )}

          {analysis && !generateMutation.isPending && (
            <div className="space-y-4">
              <Tabs defaultValue="summary">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="summary">Resumo</TabsTrigger>
                  <TabsTrigger value="analysis">Análise Clínica</TabsTrigger>
                </TabsList>

                <TabsContent value="summary">
                  <div className="rounded-lg border border-border bg-surface p-4">
                    <div className="font-clinical text-sm leading-relaxed">
                      <MarkdownRenderer content={analysis.summary} />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="analysis">
                  <div className="rounded-lg border border-border bg-surface p-4">
                    <div className="font-clinical text-sm leading-relaxed">
                      <MarkdownRenderer content={analysis.analysis} />
                    </div>
                  </div>
                </TabsContent>
              </Tabs>

              <div className="flex items-center justify-between pt-2">
                <p className="text-xs text-foreground-muted">
                  Gerado em {new Date(analysis.generatedAt).toLocaleString('pt-BR')}
                  {totalTokens ? ` • ${totalTokens} tokens` : ''}
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
      </DialogContent>
    </Dialog>
  );
}
