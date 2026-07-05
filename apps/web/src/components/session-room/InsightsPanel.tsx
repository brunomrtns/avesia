// ============================================================================
//  Web — InsightsPanel (Neural Calm redesign)
//
//  The Session Room's ambient AI presence. Design goals:
//  - Calm, not intrusive — the AI is a quiet companion
//  - Visible intelligence — neural indicator shows processing state
//  - Clinical trust — serif content, confidence bands, provenance
//  - Refined motion — items enter smoothly, status transitions are fluid
// ============================================================================

import { AnimatePresence, motion } from 'motion/react';
import { Settings, Sparkles, Trash2, Coins } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { NeuralIndicator } from '@/components/ui/neural-indicator';
import { AIThinkingState } from '@/components/ui/ai-thinking';
import { AIDisclaimer } from '@/components/ui/ai-disclaimer';
import { MarkdownRenderer } from '@/components/session-room/MarkdownRenderer';
import { AssistanceCard } from '@/components/session-room/AssistanceCard';
import { CopilotSettingsPanel } from '@/components/session-room/CopilotSettingsPanel';
import { useSessionStore } from '@/stores/session-store';
import { useSessionCopilot } from '@/lib/use-session-copilot';
import { api, type CopilotSettings } from '@/lib/api-client';
import { cn } from '@/lib/utils';

interface InsightsPanelProps {
  sessionId: string;
  hasSegments: boolean;
  onGenerate: () => void;
}

type CopilotStatus = 'idle' | 'processing' | 'disabled';

function StatusBadge({ status, pending }: { status: CopilotStatus; pending: number }): React.JSX.Element {
  const config: Record<CopilotStatus, { label: string; color: string }> = {
    idle: { label: 'Aguardando', color: 'text-foreground-muted' },
    processing: { label: 'Processando', color: 'text-primary' },
    disabled: { label: 'Desativado', color: 'text-foreground-muted' },
  };
  const c = config[status];

  return (
    <div className="flex items-center gap-1.5">
      <span className={cn('text-[11px] font-medium', c.color)}>{c.label}</span>
      {pending > 0 && status === 'idle' && (
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] tabular-nums text-foreground-muted">
          {pending}
        </span>
      )}
    </div>
  );
}

export function InsightsPanel({ sessionId, hasSegments, onGenerate }: InsightsPanelProps) {
  const {
    isGeneratingInsights,
    insightsContent,
    insightsSources,
    copilotItems,
    copilotStatus,
    copilotPendingSegments,
    copilotSettings,
    copilotError,
    copilotSettingsOpen,
    addCopilotItems,
    setCopilotStatus,
    setCopilotSettings,
    setCopilotError,
    setCopilotSettingsOpen,
    clearCopilotItems,
  } = useSessionStore();

  const [showLegacyInsights, setShowLegacyInsights] = useState(false);
  const [copilotTokens, setCopilotTokens] = useState(0);

  useEffect(() => {
    if (!sessionId) return;
    api.sessions
      .getCopilotSettings(sessionId)
      .then(setCopilotSettings)
      .catch(() => {});
  }, [sessionId, setCopilotSettings]);

  const handleAssistance = useCallback(
    (event: Extract<import('@/lib/api-client').CopilotEvent, { type: 'assistance' }>) => {
      addCopilotItems(event.data.items, {
        segmentSeqStart: event.data.segmentSeqStart,
        segmentSeqEnd: event.data.segmentSeqEnd,
        conceptIds: event.data.conceptIds,
        community: event.data.community,
      });
      if (event.data.tokensUsed > 0) {
        setCopilotTokens((prev) => prev + event.data.tokensUsed);
      }
    },
    [addCopilotItems],
  );

  const handleStatus = useCallback(
    (event: Extract<import('@/lib/api-client').CopilotEvent, { type: 'status' }>) => {
      setCopilotStatus(event.data.status, event.data.pendingSegments);
    },
    [setCopilotStatus],
  );

  const handleError = useCallback(
    (event: Extract<import('@/lib/api-client').CopilotEvent, { type: 'error' }>) => {
      setCopilotError(event.data.message);
    },
    [setCopilotError],
  );

  const handleSettingsUpdate = useCallback(
    (settings: CopilotSettings) => {
      setCopilotSettings(settings);
    },
    [setCopilotSettings],
  );

  const copilotEnabled = copilotSettings?.enabled ?? true;
  useSessionCopilot({
    sessionId,
    enabled: copilotEnabled,
    onAssistance: handleAssistance,
    onStatus: handleStatus,
    onError: handleError,
    onSettingsUpdate: handleSettingsUpdate,
  });

  const hasCopilotItems = copilotItems.length > 0;
  const hasLegacyContent = Boolean(insightsContent);
  const showSettings = copilotSettingsOpen;
  const neuralState: 'idle' | 'active' | 'processing' =
    copilotStatus === 'processing' ? 'processing' : copilotEnabled ? 'active' : 'idle';

  // "Modo discreto/ativo" — quick toggle between two copilot presets.
  const isDiscreteMode =
    copilotSettings?.enabled &&
    copilotSettings?.intensity === 'low' &&
    !copilotSettings?.autoGenerate;

  const handleModeToggle = useCallback(
    (mode: 'discrete' | 'active') => {
      if (!copilotSettings) return;
      const preset =
        mode === 'discrete'
          ? { enabled: true, intensity: 'low' as const, autoGenerate: false }
          : { enabled: true, intensity: 'medium' as const, autoGenerate: true };
      const newSettings = { ...copilotSettings, ...preset };
      setCopilotSettings(newSettings);
      api.sessions.updateCopilotSettings(sessionId, preset).then(setCopilotSettings).catch(() => {});
    },
    [copilotSettings, sessionId, setCopilotSettings],
  );

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
      {/* Header — ambient AI presence */}
      <div className="relative border-b border-border bg-surface-elevated/30 px-4 py-3">
        {/* Subtle neural mesh in header */}
        <div className="pointer-events-none absolute inset-0 mesh-bg-dense opacity-30" />

        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <NeuralIndicator state={neuralState} size="md" />
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-foreground">Co-piloto Clínico</h2>
              <div className="mt-0.5">
                <StatusBadge status={copilotStatus as CopilotStatus} pending={copilotPendingSegments} />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {copilotTokens > 0 && (
              <span
                className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-foreground-muted"
                title="Tokens gastos pelo copilot nesta sessão"
              >
                <Coins className="h-3 w-3 text-primary/70" />
                <span className="tabular-nums">{copilotTokens.toLocaleString('pt-BR')}</span>
              </span>
            )}
            {hasCopilotItems && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={clearCopilotItems}
                title="Limpar"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setCopilotSettingsOpen(!showSettings)}
              className={cn(showSettings && 'bg-primary/10 text-primary')}
              title="Configurações"
            >
              <Settings className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="neural"
              size="sm"
              onClick={onGenerate}
              disabled={isGeneratingInsights || !hasSegments}
              className="h-7 gap-1.5 text-xs"
            >
              <Sparkles className="h-3 w-3" />
              {isGeneratingInsights ? 'Analisando...' : 'Analisar'}
            </Button>
          </div>
        </div>

        {/* Modo discreto/ativo — quick toggle */}
        {copilotSettings?.enabled && (
          <div className="relative mt-2 flex items-center gap-1">
            <button
              onClick={() => handleModeToggle('discrete')}
              className={cn(
                'flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition-all duration-200',
                isDiscreteMode
                  ? 'bg-primary/10 text-primary'
                  : 'text-foreground-muted hover:bg-surface-elevated',
              )}
            >
              Discreto
            </button>
            <button
              onClick={() => handleModeToggle('active')}
              className={cn(
                'flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition-all duration-200',
                !isDiscreteMode
                  ? 'bg-primary/10 text-primary'
                  : 'text-foreground-muted hover:bg-surface-elevated',
              )}
            >
              Ativo
            </button>
          </div>
        )}

        {/* Discreet AI disclaimer */}
        <div className="relative mt-2">
          <AIDisclaimer variant="inline" />
        </div>
      </div>

      {/* Settings panel (collapsible) */}
      <AnimatePresence>
        {showSettings && copilotSettings && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden border-b border-border"
          >
            <CopilotSettingsPanel
              sessionId={sessionId}
              settings={copilotSettings}
              onSettingsChange={setCopilotSettings}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="space-y-3 p-4">
          {/* Error */}
          {copilotError && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive"
            >
              {copilotError}
            </motion.div>
          )}

          {/* Copilot items stream */}
          {hasCopilotItems && (
            <div className="space-y-2.5">
              <AnimatePresence>
                {copilotItems.map((item) => {
                  const cardProps: Omit<Parameters<typeof AssistanceCard>[0], never> = {
                    type: item.type,
                    content: item.content,
                    confidence: item.confidence,
                    timestamp: item.timestamp,
                    segmentRange: { start: item.segmentSeqStart, end: item.segmentSeqEnd },
                  };
                  if (item.sourceConcepts) cardProps.sourceConcepts = item.sourceConcepts;
                  if (item.sourceDocuments) cardProps.sourceDocuments = item.sourceDocuments;
                  return <AssistanceCard key={item.id} {...cardProps} />;
                })}
              </AnimatePresence>
            </div>
          )}

          {/* Processing indicator — premium AI thinking state */}
          {copilotStatus === 'processing' && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="rounded-lg border border-primary/15 bg-primary/[0.02]"
            >
              <AIThinkingState
                message="Co-piloto analisando"
                steps={['memória', 'contexto', 'raciocínio']}
                className="py-6"
              />
            </motion.div>
          )}

          {/* Legacy insights (manual generate) */}
          {hasLegacyContent && (
            <div className="space-y-2">
              <button
                onClick={() => setShowLegacyInsights(!showLegacyInsights)}
                className="text-[11px] font-medium text-foreground-muted transition-colors hover:text-foreground"
              >
                {showLegacyInsights ? '▼' : '▶'} Parecer manual
              </button>
              {showLegacyInsights && (
                <div className="rounded-lg border border-border bg-surface-elevated/30 p-3">
                  <div className="font-clinical text-sm leading-relaxed text-foreground">
                    <MarkdownRenderer content={insightsContent!} />
                  </div>
                  {insightsSources.length > 0 && (
                    <div className="mt-3 border-t border-border-subtle pt-2">
                      <p className="mb-1 text-[9px] font-medium uppercase tracking-wider text-foreground-muted">
                        Fontes da KB
                      </p>
                      {insightsSources.slice(0, 3).map((src, i) => (
                        <p key={i} className="font-mono text-[10px] text-foreground-muted">
                          {src.headingPath.join(' › ')} — {(src.score * 100).toFixed(0)}%
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Empty state — calm, ambient */}
          {!hasCopilotItems && !hasLegacyContent && !copilotError && copilotStatus !== 'processing' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
              className="flex h-full flex-col items-center justify-center p-8 text-center"
            >
              <NeuralIndicator state={copilotEnabled ? 'idle' : 'idle'} size="lg" className="mb-4" />
              <h3 className="text-sm font-medium text-foreground-secondary">
                {copilotEnabled ? 'Co-piloto ativo' : 'Co-piloto desativado'}
              </h3>
              <p className="mt-1.5 max-w-[260px] font-clinical text-xs leading-relaxed text-foreground-muted">
                {copilotEnabled
                  ? 'A IA acompanha a consulta em tempo real e produzirá assistência conforme a conversa evolui.'
                  : 'Ative o co-piloto nas configurações para receber assistência durante a consulta.'}
              </p>
            </motion.div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
