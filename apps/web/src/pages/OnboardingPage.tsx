import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  Brain,
  Calendar,
  CheckCircle2,
  Circle,
  FileText,
  Lightbulb,
  Sparkles,
  Users,
} from 'lucide-react';

import { api } from '@/lib/api-client';
import type { OnboardingSuggestion } from '@/lib/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const SUGGESTION_ICONS: Record<string, React.ReactNode> = {
  topic: <Lightbulb className="h-4 w-4 text-accent" />,
  specialty: <Brain className="h-4 w-4 text-primary" />,
  document: <FileText className="h-4 w-4 text-primary" />,
  action: <Sparkles className="h-4 w-4 text-accent" />,
};

const PRIORITY_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline' | 'warning'> = {
  high: 'destructive',
  medium: 'warning',
  low: 'outline',
};

const PRIORITY_LABELS: Record<string, string> = {
  high: 'Alta',
  medium: 'Média',
  low: 'Baixa',
};

interface ProgressItem {
  label: string;
  value: number;
  icon: React.ReactNode;
  link?: string;
  linkLabel?: string;
}

export function OnboardingPage(): React.ReactNode {
  const { orgSlug } = useParams<{ orgSlug: string }>();

  const suggestionsQuery = useQuery({
    queryKey: ['onboarding-suggestions'],
    queryFn: () => api.onboarding.getSuggestions(),
  });

  const data = suggestionsQuery.data;

  if (suggestionsQuery.isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  const progress = data?.progress;
  const totalProgressItems =
    (progress?.documentsUploaded ?? 0) +
    (progress?.conceptsExtracted ?? 0) +
    (progress?.topicsCreated ?? 0) +
    (progress?.sessionsCreated ?? 0) +
    (progress?.patientsCreated ?? 0);

  const progressItems: ProgressItem[] = [
    {
      label: 'Documentos Enviados',
      value: progress?.documentsUploaded ?? 0,
      icon: <FileText className="h-5 w-5 text-primary" />,
      link: `/${orgSlug}/knowledge-base`,
      linkLabel: 'Enviar documentos',
    },
    {
      label: 'Conceitos Extraídos',
      value: progress?.conceptsExtracted ?? 0,
      icon: <Brain className="h-5 w-5 text-accent" />,
    },
    {
      label: 'Tópicos Criados',
      value: progress?.topicsCreated ?? 0,
      icon: <Lightbulb className="h-5 w-5 text-primary" />,
    },
    {
      label: 'Pacientes Cadastrados',
      value: progress?.patientsCreated ?? 0,
      icon: <Users className="h-5 w-5 text-accent" />,
      link: `/${orgSlug}/patients`,
      linkLabel: 'Cadastrar paciente',
    },
    {
      label: 'Sessões Criadas',
      value: progress?.sessionsCreated ?? 0,
      icon: <Calendar className="h-5 w-5 text-primary" />,
      link: `/${orgSlug}/sessions?new=true`,
      linkLabel: 'Nova sessão',
    },
  ];

  const completionPercentage =
    totalProgressItems === 0 ? 0 : Math.min(100, Math.round((totalProgressItems / 10) * 100));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      >
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Configuração & Onboarding</h1>
        <p className="text-sm text-foreground-secondary">
          Configure sua clínica e comece a aproveitar a inteligência clínica
        </p>
      </motion.div>

      {/* Overall progress */}
      <Card className="relative overflow-hidden border-primary/15 bg-gradient-glow">
        <div className="absolute inset-0 mesh-bg-dense opacity-30" />
        <CardContent className="relative space-y-4 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Progresso Geral</p>
              <p className="text-xs text-foreground-muted">
                {completionPercentage >= 100 ? 'Configuração completa!' : 'Continue configurando sua clínica'}
              </p>
            </div>
            <span className="font-mono text-2xl font-bold tabular-nums text-primary">
              {completionPercentage}%
            </span>
          </div>
          <Progress value={completionPercentage} />
        </CardContent>
      </Card>

      {/* Progress items */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {progressItems.map((item, index) => (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: index * 0.06, ease: [0.16, 1, 0.3, 1] }}
          >
            <Card className="h-full transition-all duration-200 hover:border-border-hover">
              <CardContent className="flex h-full flex-col gap-3 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border-subtle bg-surface-elevated">
                    {item.icon}
                  </div>
                  <div className="flex-1">
                    <p className="text-2xl font-bold tabular-nums text-foreground">{item.value}</p>
                    <p className="text-[11px] uppercase tracking-wider text-foreground-muted">{item.label}</p>
                  </div>
                </div>
                {item.link && (
                  <Button asChild variant="ghost" size="sm" className="mt-auto justify-start text-xs">
                    <Link to={item.link}>
                      {item.linkLabel}
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Steps checklist */}
      {data && (data.completedSteps?.length > 0 || data.pendingSteps?.length > 0) && (
        <Card>
          <CardContent className="space-y-3 p-5">
            <h3 className="text-sm font-semibold text-foreground">Etapas de Configuração</h3>
            <div className="space-y-2">
              {data.completedSteps.map((step) => (
                <div key={step} className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                  <span className="text-foreground-secondary">{step}</span>
                </div>
              ))}
              {data.pendingSteps.map((step) => (
                <div key={step} className="flex items-center gap-2 text-sm">
                  <Circle className="h-4 w-4 shrink-0 text-foreground-muted" />
                  <span className="text-foreground-muted">{step}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Suggestions */}
      {data && data.suggestions?.length > 0 && (
        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Sugestões da IA</h3>
              <Badge variant="accent" className="ml-auto text-[10px]">
                {data.suggestions.length} sugestões
              </Badge>
            </div>
            <p className="text-xs text-foreground-muted">
              Baseado no conteúdo da sua base de conhecimento, aqui estão algumas sugestões para melhorar sua clínica.
            </p>
            <div className="space-y-2">
              {data.suggestions.map((suggestion: OnboardingSuggestion, index: number) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05, ease: [0.16, 1, 0.3, 1] }}
                  className={cn(
                    'flex items-start gap-3 rounded-lg border border-border bg-surface p-3 transition-all duration-200 hover:border-border-hover',
                  )}
                >
                  <div className="mt-0.5 shrink-0">
                    {SUGGESTION_ICONS[suggestion.type] ?? <Lightbulb className="h-4 w-4 text-accent" />}
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">{suggestion.label}</p>
                      <Badge variant={PRIORITY_VARIANTS[suggestion.priority] ?? 'outline'} className="text-[10px]">
                        {PRIORITY_LABELS[suggestion.priority] ?? suggestion.priority}
                      </Badge>
                    </div>
                    {suggestion.description && (
                      <p className="text-xs text-foreground-secondary">{suggestion.description}</p>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick actions */}
      <Card>
        <CardContent className="space-y-3 p-5">
          <h3 className="text-sm font-semibold text-foreground">Ações Rápidas</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Button asChild variant="outline" className="justify-start">
              <Link to={`/${orgSlug}/knowledge-base`}>
                <BookOpen className="h-4 w-4 text-primary" />
                Enviar Documentos
              </Link>
            </Button>
            <Button asChild variant="outline" className="justify-start">
              <Link to={`/${orgSlug}/patients`}>
                <Users className="h-4 w-4 text-accent" />
                Cadastrar Paciente
              </Link>
            </Button>
            <Button asChild variant="outline" className="justify-start">
              <Link to={`/${orgSlug}/sessions?new=true`}>
                <Calendar className="h-4 w-4 text-primary" />
                Nova Sessão
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
