import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import {
  Activity,
  ArrowUpRight,
  Calendar,
  CalendarCheck,
  ClipboardList,
  Plus,
  Sparkles,
  Users,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Link, useParams } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
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
import type { DashboardStats } from '@/lib/api-client';
import { cn } from '@/lib/utils';

// ─── Stat Card — refined with neural identity ──────────────────────────────

interface StatCardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  accentClass: string;
  loading?: boolean | undefined;
  trend?: string | undefined;
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

const ANALYSIS_TYPE_LABELS: Record<string, string> = {
  SUMMARY: 'Resumo',
  INSIGHTS: 'Insights',
  SOAP_NOTE: 'Nota SOAP',
  BRIEFING: 'Briefing',
  TOPICS: 'Tópicos',
  KEYWORDS: 'Palavras-chave',
  TREATMENT_PLAN: 'Plano de Tratamento',
};

// ─── AI Activity Card — the signature neural element ───────────────────────

function AIActivityCard({ stats }: { stats: DashboardStats | undefined }) {
  const totalSessions = stats?.sessions.total ?? 0;
  const completedSessions = stats?.sessions.completed ?? 0;
  const totalPatients = stats?.patients.active ?? 0;
  const completionRate = totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) : 0;
  const soapNotes = stats?.aiAnalyses.soapNotesGenerated ?? 0;
  const totalTokens = stats?.aiAnalyses.totalTokensUsed ?? 0;

  return (
    <Card className="relative overflow-hidden border-primary/15 bg-gradient-glow">
      <div className="absolute inset-0 mesh-bg-dense opacity-40" />

      <CardContent className="relative space-y-4 p-5">
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

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-primary" />
              <span className="text-xs text-foreground-secondary">Taxa de conclusão</span>
            </div>
            <span className="font-mono text-sm font-semibold text-foreground tabular-nums">{completionRate}%</span>
          </div>

          <div className="relative h-1.5 overflow-hidden rounded-full bg-muted">
            <motion.div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-primary"
              initial={{ width: 0 }}
              animate={{ width: `${completionRate}%` }}
              transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
            />
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
              <span className="text-xs text-foreground-secondary">Notas SOAP geradas</span>
            </div>
            <span className="font-mono text-sm font-semibold text-foreground tabular-nums">{soapNotes}</span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-primary" />
              <span className="text-xs text-foreground-secondary">Tokens utilizados</span>
            </div>
            <span className="font-mono text-sm font-semibold text-foreground tabular-nums">
              {totalTokens >= 1000 ? `${(totalTokens / 1000).toFixed(1)}k` : totalTokens}
            </span>
          </div>
        </div>

        <div className="neural-divider" />

        <div className="space-y-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wider text-primary/70">Insight da IA</p>
          <p className="font-clinical text-sm leading-relaxed text-foreground-secondary">
            {totalPatients === 0
              ? 'Comece cadastrando seu primeiro paciente para ativar a análise clínica.'
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

  const statsQuery = useQuery({
    queryKey: ['stats'],
    queryFn: () => api.stats.get(),
    refetchInterval: 60_000, // refresh every minute
  });

  const stats = statsQuery.data;
  const loading = statsQuery.isLoading;

  // Trend chart data (last 30 days)
  const trendData = (stats?.trend ?? []).map((d) => ({
    name: format(new Date(d.date + 'T00:00:00'), 'dd/MM', { locale: ptBR }),
    sessoes: d.count,
  }));

  // Sessions by type chart data
  const typeChartData = (stats?.sessionsByType ?? []).map((s) => ({
    name: SESSION_TYPES[s.type]?.label ?? s.type,
    total: s.count,
  }));

  const recentSessions = stats?.recentSessions ?? [];
  const recentAnalyses = stats?.recentAnalyses ?? [];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Page header */}
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

      {/* Stats grid — 6 cards with clinical metrics */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          index={0}
          title="Pacientes"
          value={stats?.patients.total ?? 0}
          icon={<Users className="h-5 w-5 text-primary" />}
          accentClass="bg-primary/10"
          loading={loading}
          trend={stats && stats.patients.newThisMonth > 0 ? `+${stats.patients.newThisMonth} este mês` : undefined}
        />
        <StatCard
          index={1}
          title="Sessões Hoje"
          value={stats?.sessions.today ?? 0}
          icon={<Calendar className="h-5 w-5 text-accent" />}
          accentClass="bg-accent/10"
          loading={loading}
        />
        <StatCard
          index={2}
          title="Total Sessões"
          value={stats?.sessions.total ?? 0}
          icon={<Activity className="h-5 w-5 text-primary" />}
          accentClass="bg-primary/10"
          loading={loading}
        />
        <StatCard
          index={3}
          title="Realizadas"
          value={stats?.sessions.completed ?? 0}
          icon={<CalendarCheck className="h-5 w-5 text-success" />}
          accentClass="bg-success/10"
          loading={loading}
        />
        <StatCard
          index={4}
          title="Notas SOAP"
          value={stats?.aiAnalyses.soapNotesGenerated ?? 0}
          icon={<ClipboardList className="h-5 w-5 text-primary" />}
          accentClass="bg-primary/10"
          loading={loading}
        />
        <StatCard
          index={5}
          title="Análises IA"
          value={stats?.aiAnalyses.total ?? 0}
          icon={<Sparkles className="h-5 w-5 text-accent" />}
          accentClass="bg-accent/10"
          loading={loading}
        />
      </div>

      {/* Main grid: trend chart + AI activity */}
      <div className="grid gap-3 lg:grid-cols-3">
        {/* Sessions trend chart (last 30 days) */}
        <Card className="lg:col-span-2">
          <CardContent className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold tracking-tight text-foreground">Atividade de Sessões</h3>
                <p className="text-xs text-foreground-muted">Últimos 30 dias</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-primary animate-ai-pulse" />
                <span className="text-[10px] font-medium uppercase tracking-wider text-foreground-muted">Tempo real</span>
              </div>
            </div>
            {loading ? (
              <Skeleton className="h-[220px] w-full rounded-md" />
            ) : trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={trendData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
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
        <AIActivityCard stats={stats} />
      </div>

      {/* Secondary grid: sessions by type + recent AI analyses */}
      <div className="grid gap-3 lg:grid-cols-3">
        {/* Sessions by type — bar chart */}
        <Card className="lg:col-span-1">
          <CardContent className="p-5">
            <div className="mb-4">
              <h3 className="text-sm font-semibold tracking-tight text-foreground">Sessões por Tipo</h3>
              <p className="text-xs text-foreground-muted">Distribuição total</p>
            </div>
            {loading ? (
              <Skeleton className="h-[180px] w-full rounded-md" />
            ) : typeChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={typeChartData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
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
                  />
                  <Bar
                    dataKey="total"
                    fill="hsl(var(--primary))"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[180px] flex-col items-center justify-center gap-2 text-center">
                <NeuralIndicator state="idle" size="md" />
                <p className="text-xs text-foreground-muted">Sem dados</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent AI analyses */}
        <Card className="lg:col-span-2">
          <CardContent className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold tracking-tight text-foreground">Análises IA Recentes</h3>
                <p className="text-xs text-foreground-muted">Últimas análises geradas</p>
              </div>
              <Badge variant="outline" className="gap-1 text-[10px]">
                <Sparkles className="h-3 w-3 text-primary" />
                {stats?.aiAnalyses.total ?? 0} total
              </Badge>
            </div>
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full rounded-md" />
                ))}
              </div>
            ) : recentAnalyses.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border-subtle bg-surface-elevated">
                  <Sparkles className="h-4 w-4 text-foreground-muted" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground-secondary">Nenhuma análise ainda</p>
                  <p className="text-xs text-foreground-muted">Gere briefings, notas SOAP ou análises pós-sessão</p>
                </div>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border-subtle hover:bg-transparent">
                    <TableHead className="text-[11px] uppercase tracking-wider text-foreground-muted">Tipo</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider text-foreground-muted">Modelo</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider text-foreground-muted">Data</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider text-foreground-muted">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentAnalyses.map((a, i) => (
                    <motion.tr
                      key={a.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.2, delay: i * 0.05 }}
                      className="group border-border-subtle transition-colors hover:bg-surface-elevated/40"
                    >
                      <TableCell className="py-2.5">
                        <Badge variant="outline" className="text-[10px]">
                          {ANALYSIS_TYPE_LABELS[a.type] ?? a.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2.5 text-xs text-foreground-secondary font-mono">
                        {a.model}
                      </TableCell>
                      <TableCell className="py-2.5 text-xs text-foreground-secondary font-mono">
                        {format(new Date(a.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </TableCell>
                      <TableCell className="py-2.5">
                        <Badge
                          variant={a.status === 'COMPLETED' ? 'success' : a.status === 'FAILED' ? 'destructive' : 'warning'}
                          className="text-[10px]"
                        >
                          {a.status === 'COMPLETED' ? 'Concluída' : a.status === 'FAILED' ? 'Falhou' : 'Pendente'}
                        </Badge>
                      </TableCell>
                    </motion.tr>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent sessions table */}
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
          {loading ? (
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
                  const typeInfo = SESSION_TYPES[session.type] ?? { label: session.type, variant: 'outline' as const };
                  const statusInfo = SESSION_STATUS[session.status] ?? { label: session.status, variant: 'outline' as const };

                  return (
                    <motion.tr
                      key={session.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.2, delay: i * 0.05 }}
                      className="group border-border-subtle transition-colors hover:bg-surface-elevated/40"
                    >
                      <TableCell className="py-3 font-medium text-foreground">
                        {session.patientName}
                      </TableCell>
                      <TableCell className="py-3">
                        <Badge variant={typeInfo.variant} className="text-[10px]">{typeInfo.label}</Badge>
                      </TableCell>
                      <TableCell className="py-3 text-xs text-foreground-secondary font-mono">
                        {format(new Date(session.scheduledAt), "dd MMM yyyy 'às' HH:mm", { locale: ptBR })}
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
