import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import {
  Activity,
  ArrowUpRight,
  Calendar,
  CalendarCheck,
  Plus,
  Users,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Link, useParams } from 'react-router-dom';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { NeuralIndicator } from '@/components/ui/neural-indicator';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import type { ClinicalSession } from '@avesia/types';

// ─── Stat Card — refined with neural identity ──────────────────────────────

interface StatCardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  accentClass: string;
  loading?: boolean;
  trend?: string;
  index: number;
}

function StatCard({ title, value, icon, accentClass, loading, trend, index }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.06, ease: [0.16, 1, 0.3, 1] }}
    >
      <Card className="group relative overflow-hidden transition-all duration-300 hover:border-border-hover hover:shadow-md">
        {/* Subtle accent glow on hover */}
        <div className={cn(
          'absolute -right-12 -top-12 h-28 w-28 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-20',
          accentClass,
        )} />
        <CardContent className="relative p-5">
          <div className="flex items-start justify-between">
            <div className="space-y-1.5">
              <p className="text-[11px] font-medium uppercase tracking-wider text-foreground-muted">{title}</p>
              {loading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <p className="text-3xl font-bold tracking-tight text-foreground tabular-nums">{value}</p>
              )}
              {trend && !loading && (
                <div className="flex items-center gap-1 text-xs text-success">
                  <ArrowUpRight className="h-3 w-3" />
                  {trend}
                </div>
              )}
            </div>
            <div className={cn(
              'flex h-10 w-10 items-center justify-center rounded-lg border border-border-subtle transition-transform duration-300 group-hover:scale-110',
              accentClass,
            )}>
              {icon}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── Session Status ────────────────────────────────────────────────────────

const SESSION_TYPES: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  INITIAL: { label: 'Inicial', variant: 'default' },
  FOLLOW_UP: { label: 'Acompanhamento', variant: 'secondary' },
  EMERGENCY: { label: 'Emergência', variant: 'destructive' },
};

const SESSION_STATUS: Record<string, { label: string; variant: 'success' | 'warning' | 'outline' | 'destructive' }> = {
  SCHEDULED: { label: 'Agendada', variant: 'outline' },
  IN_PROGRESS: { label: 'Em Andamento', variant: 'warning' },
  COMPLETED: { label: 'Realizada', variant: 'success' },
  CANCELLED: { label: 'Cancelada', variant: 'destructive' },
};

// ─── AI Activity Card — the signature neural element ───────────────────────

function AIActivityCard({ totalSessions, completedSessions, totalPatients }: {
  totalSessions: number;
  completedSessions: number;
  totalPatients: number;
}) {
  const completionRate = totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) : 0;

  return (
    <Card className="relative overflow-hidden border-primary/15 bg-gradient-glow">
      {/* Neural mesh overlay — denser for AI areas */}
      <div className="absolute inset-0 mesh-bg-dense opacity-40" />

      <CardContent className="relative space-y-4 p-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <NeuralIndicator state="active" size="md" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">Inteligência Clínica</p>
            <p className="text-[11px] text-foreground-muted">Análise contínua ativa</p>
          </div>
          <Badge variant="accent" className="gap-1 text-[10px]">
            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-ai-pulse" />
            ONLINE
          </Badge>
        </div>

        <div className="neural-divider" />

        {/* Metrics */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-primary" />
              <span className="text-xs text-foreground-secondary">Taxa de conclusão</span>
            </div>
            <span className="font-mono text-sm font-semibold text-foreground tabular-nums">{completionRate}%</span>
          </div>

          {/* Progress bar — neural styled */}
          <div className="relative h-1.5 overflow-hidden rounded-full bg-muted">
            <motion.div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-primary"
              initial={{ width: 0 }}
              animate={{ width: `${completionRate}%` }}
              transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
            />
            {/* Shimmer overlay */}
            <div className="absolute inset-0 shimmer opacity-30" />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-accent" />
              <span className="text-xs text-foreground-secondary">Pacientes ativos</span>
            </div>
            <span className="font-mono text-sm font-semibold text-foreground tabular-nums">{totalPatients}</span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-success" />
              <span className="text-xs text-foreground-secondary">Sessões processadas</span>
            </div>
            <span className="font-mono text-sm font-semibold text-foreground tabular-nums">{completedSessions}</span>
          </div>
        </div>

        <div className="neural-divider" />

        {/* AI insight — clinical serif for trust */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wider text-primary/70">Insight da IA</p>
          <p className="font-clinical text-sm leading-relaxed text-foreground-secondary">
            {totalPatients === 0
              ? 'Comece cadastrando seu primeiro paciente para ativar a análise preditiva.'
              : completionRate >= 70
                ? 'Taxa de conclusão saudável. O padrão de atendimento está consistente.'
                : completionRate > 0
                  ? 'Taxa de conclusão abaixo do ideal. Considere revisar agendamentos.'
                  : 'Sem sessões concluídas ainda. Os insights aparecerão após a primeira sessão.'}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Dashboard Page ─────────────────────────────────────────────────────────

export function DashboardPage(): React.ReactNode {
  const { orgSlug } = useParams<{ orgSlug: string }>();

  const patientsQuery = useQuery({
    queryKey: ['patients', 'stats'],
    queryFn: () => api.patients.list({ pageSize: 1 }),
  });

  const sessionsQuery = useQuery({
    queryKey: ['sessions', 'stats'],
    queryFn: () => api.sessions.list({ pageSize: 5 }),
  });

  const todayStr = new Date().toISOString().split('T')[0]!;
  const todaySessionsQuery = useQuery({
    queryKey: ['sessions', 'today'],
    queryFn: () =>
      api.sessions.list({
        from: `${todayStr}T00:00:00.000Z` as never,
        to: `${todayStr}T23:59:59.999Z` as never,
        pageSize: 100,
      }),
  });

  const totalPatients = patientsQuery.data?.total ?? 0;
  const todaySessions = todaySessionsQuery.data?.total ?? 0;
  const totalSessions = sessionsQuery.data?.total ?? 0;
  const completedSessions =
    sessionsQuery.data?.items?.filter((s) => s.status === 'COMPLETED').length ?? 0;
  const recentSessions = sessionsQuery.data?.items ?? [];

  const chartData = recentSessions.map((s) => ({
    name: s.scheduledAt ? format(new Date(s.scheduledAt), 'dd/MM', { locale: ptBR }) : '—',
    sessoes: 1,
  }));

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Page header — refined, confident */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="flex items-end justify-between"
      >
        <div>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-primary/70">
            {format(new Date(), "EEEE", { locale: ptBR })}
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {format(new Date(), "d 'de' MMMM", { locale: ptBR })}
          </h1>
        </div>
        <Button asChild variant="gradient" size="sm">
          <Link to={`/${orgSlug}/sessions`}>
            <Plus className="h-4 w-4" />
            Nova Sessão
          </Link>
        </Button>
      </motion.div>

      {/* Stats grid — 4 cards, refined */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          index={0}
          title="Pacientes"
          value={totalPatients}
          icon={<Users className="h-5 w-5 text-primary" />}
          accentClass="bg-primary/10"
          loading={patientsQuery.isLoading}
        />
        <StatCard
          index={1}
          title="Sessões Hoje"
          value={todaySessions}
          icon={<Calendar className="h-5 w-5 text-accent" />}
          accentClass="bg-accent/10"
          loading={todaySessionsQuery.isLoading}
        />
        <StatCard
          index={2}
          title="Total Sessões"
          value={totalSessions}
          icon={<Activity className="h-5 w-5 text-primary" />}
          accentClass="bg-primary/10"
          loading={sessionsQuery.isLoading}
        />
        <StatCard
          index={3}
          title="Realizadas"
          value={completedSessions}
          icon={<CalendarCheck className="h-5 w-5 text-success" />}
          accentClass="bg-success/10"
          loading={sessionsQuery.isLoading}
        />
      </div>

      {/* Main grid: chart + AI activity */}
      <div className="grid gap-3 lg:grid-cols-3">
        {/* Sessions chart — refined */}
        <Card className="lg:col-span-2">
          <CardContent className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold tracking-tight text-foreground">Atividade de Sessões</h3>
                <p className="text-xs text-foreground-muted">Distribuição das sessões recentes</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-primary animate-ai-pulse" />
                <span className="text-[10px] font-medium uppercase tracking-wider text-foreground-muted">Tempo real</span>
              </div>
            </div>
            {sessionsQuery.isLoading ? (
              <Skeleton className="h-[220px] w-full rounded-md" />
            ) : chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={chartData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorSessions" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="name"
                    stroke="hsl(var(--foreground-muted))"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="hsl(var(--foreground-muted))"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 'var(--radius)',
                      fontSize: '12px',
                      color: 'hsl(var(--popover-foreground))',
                      boxShadow: 'var(--shadow-md)',
                    }}
                    labelStyle={{ color: 'hsl(var(--foreground-muted))' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="sessoes"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#colorSessions)"
                    dot={{ fill: 'hsl(var(--primary))', r: 3 }}
                    activeDot={{ r: 5, fill: 'hsl(var(--primary))', stroke: 'hsl(var(--background))', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[220px] flex-col items-center justify-center gap-3 text-center">
                <NeuralIndicator state="idle" size="lg" />
                <div>
                  <p className="text-sm font-medium text-foreground-secondary">Sem dados ainda</p>
                  <p className="text-xs text-foreground-muted">As sessões aparecerão aqui assim que forem criadas</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* AI Activity — signature card */}
        <AIActivityCard
          totalSessions={totalSessions}
          completedSessions={completedSessions}
          totalPatients={totalPatients}
        />
      </div>

      {/* Recent sessions table — refined */}
      <Card>
        <CardContent className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold tracking-tight text-foreground">Sessões Recentes</h3>
              <p className="text-xs text-foreground-muted">Últimas sessões agendadas</p>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link to={`/${orgSlug}/sessions`}>Ver todas</Link>
            </Button>
          </div>
          {sessionsQuery.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-md" />
              ))}
            </div>
          ) : recentSessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border-subtle bg-surface-elevated">
                <Calendar className="h-5 w-5 text-foreground-muted" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Nenhuma sessão encontrada</p>
                <p className="text-xs text-foreground-muted">As sessões aparecerão aqui assim que forem criadas</p>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border-subtle hover:bg-transparent">
                  <TableHead className="text-[11px] uppercase tracking-wider text-foreground-muted">Paciente</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-foreground-muted">Tipo</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-foreground-muted">Data</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-foreground-muted">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentSessions.map((session, i) => {
                  const s = session as ClinicalSession & { patient?: { fullName?: string } };
                  const typeInfo = SESSION_TYPES[s.type] ?? { label: s.type, variant: 'outline' as const };
                  const statusInfo = SESSION_STATUS[s.status] ?? { label: s.status, variant: 'outline' as const };

                  return (
                    <motion.tr
                      key={s.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.2, delay: i * 0.05 }}
                      className="group border-border-subtle transition-colors hover:bg-surface-elevated/40"
                    >
                      <TableCell className="py-3 font-medium text-foreground">
                        {s.patient?.fullName ?? '—'}
                      </TableCell>
                      <TableCell className="py-3">
                        <Badge variant={typeInfo.variant} className="text-[10px]">{typeInfo.label}</Badge>
                      </TableCell>
                      <TableCell className="py-3 text-xs text-foreground-secondary font-mono">
                        {s.scheduledAt
                          ? format(new Date(s.scheduledAt), "dd MMM yyyy 'às' HH:mm", { locale: ptBR })
                          : '—'}
                      </TableCell>
                      <TableCell className="py-3">
                        <Badge variant={statusInfo.variant} className="text-[10px]">{statusInfo.label}</Badge>
                      </TableCell>
                    </motion.tr>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
