import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import {
  Calendar,
  ClipboardList,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  Users,
} from 'lucide-react';

import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface ReportConfig {
  key: 'sessionsCsv' | 'patientsCsv' | 'clinicalNotesCsv';
  title: string;
  description: string;
  icon: React.ReactNode;
  fields: string[];
  fileName: string;
}

const REPORTS: ReportConfig[] = [
  {
    key: 'sessionsCsv',
    title: 'Sessões',
    description: 'Exportação de todas as sessões com dados de paciente, profissional, status, tipo e datas.',
    icon: <Calendar className="h-6 w-6 text-primary" />,
    fields: ['ID', 'Paciente', 'Profissional', 'Tipo', 'Status', 'Local', 'Data Agendada', 'Duração', 'Notas'],
    fileName: 'sessoes.csv',
  },
  {
    key: 'patientsCsv',
    title: 'Pacientes',
    description: 'Lista completa de pacientes cadastrados com dados de contato e status.',
    icon: <Users className="h-6 w-6 text-accent" />,
    fields: ['ID', 'Nome', 'Email', 'Telefone', 'Data de Nascimento', 'Status', 'Criado em'],
    fileName: 'pacientes.csv',
  },
  {
    key: 'clinicalNotesCsv',
    title: 'Notas Clínicas',
    description: 'Todas as notas clínicas geradas, incluindo notas SOAP e análises pós-sessão.',
    icon: <ClipboardList className="h-6 w-6 text-primary" />,
    fields: ['ID', 'Sessão', 'Paciente', 'Tipo', 'Status', 'Conteúdo', 'Criado em'],
    fileName: 'notas-clinicas.csv',
  },
];

export function ReportsPage(): React.ReactNode {
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);

  const downloadMutation = useMutation({
    mutationFn: async (config: ReportConfig) => {
      setDownloadingKey(config.key);
      const blob = await api.reports[config.key]();
      return { blob, config };
    },
    onSuccess: ({ blob, config }) => {
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = config.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success(`${config.title} exportado com sucesso`);
      setDownloadingKey(null);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Erro ao exportar relatório');
      setDownloadingKey(null);
    },
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      >
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Relatórios</h1>
        <p className="text-sm text-foreground-secondary">Exporte dados em formato CSV para análise externa</p>
      </motion.div>

      {/* Info banner */}
      <Card className="border-primary/15 bg-gradient-glow">
        <CardContent className="flex items-start gap-3 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Exportação CSV</p>
            <p className="mt-1 text-xs text-foreground-secondary">
              Os relatórios são gerados em tempo real com os dados mais recentes. O formato CSV pode ser
              aberto em Excel, Google Sheets ou qualquer editor de planilhas.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Report cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map((config, index) => (
          <motion.div
            key={config.key}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: index * 0.06, ease: [0.16, 1, 0.3, 1] }}
          >
            <Card className="group h-full transition-all duration-300 hover:border-border-hover hover:shadow-md">
              <CardContent className="flex h-full flex-col space-y-4 p-5">
                <div className="flex items-start justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-border-subtle bg-surface-elevated transition-transform duration-300 group-hover:scale-110">
                    {config.icon}
                  </div>
                  <FileText className="h-4 w-4 text-foreground-muted" />
                </div>

                <div className="flex-1 space-y-2">
                  <h3 className="text-base font-semibold text-foreground">{config.title}</h3>
                  <p className="text-xs leading-relaxed text-foreground-secondary">
                    {config.description}
                  </p>
                </div>

                {/* Preview fields */}
                <div className="space-y-1.5">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-foreground-muted">
                    Campos incluídos
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {config.fields.slice(0, 5).map((field) => (
                      <span
                        key={field}
                        className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-foreground-muted"
                      >
                        {field}
                      </span>
                    ))}
                    {config.fields.length > 5 && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-foreground-muted">
                        +{config.fields.length - 5}
                      </span>
                    )}
                  </div>
                </div>

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => downloadMutation.mutate(config)}
                  disabled={downloadingKey === config.key}
                >
                  {downloadingKey === config.key ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Gerando...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" />
                      Baixar CSV
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
