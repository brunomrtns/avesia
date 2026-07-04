import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ClipboardList, Loader2, Sparkles, CheckCircle2 } from 'lucide-react';

import { api } from '@/lib/api-client';
import type { SOAPNoteResponse, SOAPContent } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface SOAPNoteDialogProps {
  readonly sessionId: string;
  readonly patientName: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

const SOAP_SECTIONS: Array<{
  key: keyof SOAPContent;
  label: string;
  description: string;
}> = [
  { key: 'subjective', label: 'Subjetivo', description: 'Queixas e relatos do paciente' },
  { key: 'objective', label: 'Objetivo', description: 'Observações comportamentais e do terapeuta' },
  { key: 'assessment', label: 'Avaliação', description: 'Hipóteses clínicas e avaliação do estado' },
  { key: 'plan', label: 'Plano', description: 'Plano terapêutico e próximos passos' },
];

export function SOAPNoteDialog({
  sessionId,
  patientName,
  open,
  onOpenChange,
}: SOAPNoteDialogProps): React.ReactNode {
  const [soapNote, setSoapNote] = useState<SOAPNoteResponse | null>(null);

  const generateMutation = useMutation({
    mutationFn: () => api.sessions.generateSOAP(sessionId),
    onSuccess: (data) => {
      setSoapNote(data);
      toast.success('Nota SOAP gerada e salva como rascunho');
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Falha ao gerar nota SOAP');
    },
  });

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setSoapNote(null);
      generateMutation.reset();
    }
    onOpenChange(next);
  };

  const content = soapNote?.content;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            Nota SOAP
          </DialogTitle>
          <DialogDescription>
            Nota clínica estruturada para {patientName}, gerada a partir da transcrição.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4">
          {generateMutation.isPending && (
            <div className="flex flex-col items-center justify-center gap-3 py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-foreground-secondary">
                Analisando transcrição e gerando nota SOAP...
              </p>
            </div>
          )}

          {!generateMutation.isPending && !soapNote && (
            <div className="flex flex-col items-center justify-center gap-4 py-12">
              <ClipboardList className="h-12 w-12 text-foreground-muted" />
              <p className="text-center text-sm text-foreground-secondary max-w-sm">
                Gere uma nota clínica estruturada (SOAP) a partir da transcrição
                da sessão. A nota será salva como rascunho para revisão.
              </p>
              <Button
                variant="gradient"
                onClick={() => generateMutation.mutate()}
              >
                <Sparkles className="h-4 w-4" />
                Gerar Nota SOAP
              </Button>
            </div>
          )}

          {soapNote && content && !generateMutation.isPending && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant="warning">Rascunho</Badge>
                <span className="text-xs text-foreground-muted">
                  Gerado em {new Date(soapNote.generatedAt).toLocaleString('pt-BR')}
                  {soapNote.tokensUsed ? ` • ${soapNote.tokensUsed} tokens` : ''}
                </span>
              </div>

              <Tabs defaultValue="subjective">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="subjective">S</TabsTrigger>
                  <TabsTrigger value="objective">O</TabsTrigger>
                  <TabsTrigger value="assessment">A</TabsTrigger>
                  <TabsTrigger value="plan">P</TabsTrigger>
                </TabsList>

                {SOAP_SECTIONS.map((section) => (
                  <TabsContent key={section.key} value={section.key}>
                    <div className="space-y-2 rounded-lg border border-border bg-surface p-4">
                      <div>
                        <h4 className="text-sm font-semibold text-foreground">
                          {section.label}
                        </h4>
                        <p className="text-xs text-foreground-muted">
                          {section.description}
                        </p>
                      </div>
                      <p className="font-clinical text-sm leading-relaxed whitespace-pre-wrap text-foreground">
                        {(content[section.key] as string) || '—'}
                      </p>
                    </div>
                  </TabsContent>
                ))}
              </Tabs>

              {/* Observations and tasks */}
              {(content.observations || (content.tasks && content.tasks.length > 0)) && (
                <div className="space-y-3 rounded-lg border border-border bg-surface-elevated p-4">
                  {content.observations && (
                    <div>
                      <h4 className="text-sm font-semibold text-foreground mb-1">
                        Observações
                      </h4>
                      <p className="font-clinical text-sm leading-relaxed whitespace-pre-wrap text-foreground-secondary">
                        {content.observations}
                      </p>
                    </div>
                  )}
                  {content.tasks && content.tasks.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-foreground mb-1">
                        Tarefas para o paciente
                      </h4>
                      <ul className="space-y-1">
                        {content.tasks.map((task, i) => (
                          <li
                            key={i}
                            className="flex items-start gap-2 text-sm text-foreground-secondary"
                          >
                            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary" />
                            {task}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <p className="text-xs text-foreground-muted">
                  A nota foi salva como rascunho. Revise e finalize no prontuário do paciente.
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
