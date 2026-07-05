import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronDown,
  Coins,
  FileText,
  ClipboardList,
  ChartLine,
  Sparkles,
  Mic,
  Users,
  Lightbulb,
} from 'lucide-react';

import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

interface TokenUsagePanelProps {
  readonly sessionId: string;
}

const TYPE_META: Record<string, { label: string; icon: typeof FileText; color: string }> = {
  briefing: { label: 'Briefing', icon: Sparkles, color: 'text-primary' },
  soap: { label: 'Nota SOAP', icon: ClipboardList, color: 'text-accent' },
  summary: { label: 'Resumo', icon: FileText, color: 'text-foreground-secondary' },
  clinicalAnalysis: { label: 'Análise Clínica', icon: ChartLine, color: 'text-foreground-secondary' },
  insights: { label: 'Insights', icon: Lightbulb, color: 'text-primary' },
  diarization: { label: 'Diarização', icon: Users, color: 'text-foreground-secondary' },
  copilot: { label: 'Copilot (tempo real)', icon: Sparkles, color: 'text-primary' },
  transcription: { label: 'Transcrição', icon: Mic, color: 'text-foreground-secondary' },
};

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function TokenUsagePanel({ sessionId }: TokenUsagePanelProps): React.ReactNode {
  const [expanded, setExpanded] = useState(false);

  const { data } = useQuery({
    queryKey: ['session-tokens', sessionId],
    queryFn: () => api.sessions.getTokenUsage(sessionId),
    enabled: !!sessionId,
    refetchInterval: 10000,
  });

  if (!data || data.total === 0) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-foreground-muted">
        <Coins className="h-3.5 w-3.5" />
        <span>0 tokens</span>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-foreground-secondary transition-colors hover:bg-surface-elevated"
      >
        <Coins className="h-3.5 w-3.5 text-primary" />
        <span className="font-medium text-foreground">{formatTokens(data.total)}</span>
        <span className="text-foreground-muted">tokens</span>
        <ChevronDown className={cn('h-3 w-3 transition-transform', expanded && 'rotate-180')} />
      </button>

      {expanded && (
        <>
          {/* Click-away overlay */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setExpanded(false)}
          />

          <div className="absolute right-0 top-full z-50 mt-1 w-80 rounded-lg border border-border bg-popover shadow-lg">
            {/* Header */}
            <div className="border-b border-border px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">Uso de Tokens</span>
                <span className="text-lg font-bold text-primary">{formatTokens(data.total)}</span>
              </div>
              <p className="text-xs text-foreground-muted mt-0.5">
                {data.copilotCount > 0 && `${data.copilotCount} ciclos de copilot • `}
                {data.entries.length} operações de IA
              </p>
            </div>

            {/* Breakdown by type */}
            <ScrollArea className="max-h-64">
              <div className="px-4 py-2 space-y-1">
                {Object.entries(data.byType)
                  .filter(([, v]) => v > 0)
                  .sort((a, b) => b[1] - a[1])
                  .map(([key, value]) => {
                    const meta = TYPE_META[key] ?? { label: key, icon: FileText, color: 'text-foreground-secondary' };
                    const Icon = meta.icon;
                    const pct = data.total > 0 ? (value / data.total) * 100 : 0;
                    return (
                      <div key={key} className="flex items-center gap-2 py-1.5">
                        <Icon className={cn('h-4 w-4 shrink-0', meta.color)} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-foreground-secondary truncate">{meta.label}</span>
                            <span className="text-xs font-medium text-foreground ml-2">{formatTokens(value)}</span>
                          </div>
                          {/* Mini progress bar */}
                          <div className="mt-1 h-1 rounded-full bg-border overflow-hidden">
                            <div
                              className="h-full rounded-full bg-primary/60"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </ScrollArea>

            {/* Provider breakdown */}
            {Object.keys(data.byProvider).length > 0 && (
              <div className="border-t border-border px-4 py-2">
                <p className="text-xs text-foreground-muted mb-1.5">Por provedor</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(data.byProvider).sort((a, b) => b[1] - a[1]).map(([provider, tokens]) => (
                    <span
                      key={provider}
                      className="inline-flex items-center gap-1 rounded-md bg-surface-elevated px-2 py-0.5 text-xs text-foreground-secondary"
                    >
                      {provider}: <strong className="text-foreground">{formatTokens(tokens)}</strong>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
