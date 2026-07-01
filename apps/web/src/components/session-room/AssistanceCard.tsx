// ============================================================================
//  Web — AssistanceCard (Neural Calm redesign)
//
//  Renders a single copilot assistance item with:
//  - Confidence band (left border color = trust level)
//  - Type-specific neural icon (custom SVG, not emoji)
//  - Provenance display (source concepts + documents)
//  - Clinical serif for content (trust through typography)
//  - Refined motion entrance
// ============================================================================

import { memo } from 'react';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  HelpCircle,
  Lightbulb,
  Link2,
  Microscope,
} from 'lucide-react';
import { MarkdownRenderer } from './MarkdownRenderer.js';
import type { AssistanceType, Confidence } from '@/lib/api-client';
import { cn } from '@/lib/utils';

interface AssistanceCardProps {
  type: AssistanceType;
  content: string;
  confidence: Confidence;
  sourceConcepts?: string[];
  sourceDocuments?: string[];
  timestamp: number;
  segmentRange?: { start: number; end: number };
}

const TYPE_CONFIG: Record<
  AssistanceType,
  {
    label: string;
    icon: React.ReactNode;
    color: string;
    border: string;
    bg: string;
    glow: string;
  }
> = {
  insight: {
    label: 'Insight',
    icon: <Lightbulb className="h-3.5 w-3.5" />,
    color: 'text-primary',
    border: 'border-primary/20',
    bg: 'bg-primary/[0.03]',
    glow: 'shadow-[0_0_24px_-12px_hsl(var(--primary-glow)/0.3)]',
  },
  hypothesis: {
    label: 'Hipótese',
    icon: <Microscope className="h-3.5 w-3.5" />,
    color: 'text-accent',
    border: 'border-accent/20',
    bg: 'bg-accent/[0.03]',
    glow: 'shadow-[0_0_24px_-12px_hsl(var(--accent-glow)/0.3)]',
  },
  question: {
    label: 'Pergunta',
    icon: <HelpCircle className="h-3.5 w-3.5" />,
    color: 'text-warning',
    border: 'border-warning/20',
    bg: 'bg-warning/[0.03]',
    glow: '',
  },
  attention: {
    label: 'Atenção',
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
    color: 'text-destructive',
    border: 'border-destructive/20',
    bg: 'bg-destructive/[0.03]',
    glow: 'shadow-[0_0_24px_-12px_hsl(var(--destructive)/0.3)]',
  },
  connection: {
    label: 'Conexão KB',
    icon: <Link2 className="h-3.5 w-3.5" />,
    color: 'text-success',
    border: 'border-success/20',
    bg: 'bg-success/[0.03]',
    glow: '',
  },
};

const CONFIDENCE_CONFIG: Record<
  Confidence,
  { label: string; band: string; dot: string; bar: string }
> = {
  high: {
    label: 'Alta confiança',
    band: 'confidence-high',
    dot: 'bg-success',
    bar: 'w-full bg-success',
  },
  medium: {
    label: 'Média confiança',
    band: 'confidence-medium',
    dot: 'bg-warning',
    bar: 'w-2/3 bg-warning',
  },
  low: {
    label: 'Baixa confiança',
    band: 'confidence-low',
    dot: 'bg-foreground-muted',
    bar: 'w-1/3 bg-foreground-muted',
  },
};

function AssistanceCardImpl({
  type,
  content,
  confidence,
  sourceConcepts,
  sourceDocuments,
  timestamp,
  segmentRange,
}: AssistanceCardProps): React.JSX.Element {
  const config = TYPE_CONFIG[type];
  const confConfig = CONFIDENCE_CONFIG[confidence];
  const timeStr = new Date(timestamp).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        'group relative overflow-hidden rounded-lg border bg-surface p-3.5 transition-all duration-300 hover:shadow-md',
        config.border,
        config.bg,
        confConfig.band,
      )}
    >
      {/* Header — type + confidence + time */}
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className={cn(
            'flex h-6 w-6 items-center justify-center rounded-md border transition-colors',
            config.border,
            config.color,
          )}>
            {config.icon}
          </div>
          <span className={cn('text-[11px] font-semibold uppercase tracking-wider', config.color)}>
            {config.label}
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          {/* Confidence — 3-tier visual */}
          <div className="flex items-center gap-1.5" title={confConfig.label}>
            <div className="flex h-1 w-8 overflow-hidden rounded-full bg-muted">
              <div className={cn('h-full rounded-full transition-all', confConfig.bar)} />
            </div>
          </div>
          {/* Timestamp */}
          <span className="font-mono text-[10px] tabular-nums text-foreground-muted">{timeStr}</span>
        </div>
      </div>

      {/* Content — clinical serif for trust */}
      <div className="font-clinical text-sm leading-relaxed text-foreground">
        <MarkdownRenderer content={content} />
      </div>

      {/* Provenance — source concepts + documents */}
      {(sourceConcepts?.length || sourceDocuments?.length) ? (
        <div className="mt-3 space-y-1.5 border-t border-border-subtle pt-2.5">
          <p className="text-[9px] font-medium uppercase tracking-wider text-foreground-muted">Proveniência</p>
          {sourceConcepts?.length ? (
            <div className="flex flex-wrap gap-1">
              {sourceConcepts.map((c, i) => (
                <span
                  key={i}
                  className="rounded border border-primary/15 bg-primary/5 px-1.5 py-0.5 text-[10px] text-primary"
                >
                  {c}
                </span>
              ))}
            </div>
          ) : null}
          {sourceDocuments?.length ? (
            <div className="flex flex-wrap gap-1">
              {sourceDocuments.map((d, i) => (
                <span
                  key={i}
                  className="flex items-center gap-1 rounded border border-border bg-surface-elevated px-1.5 py-0.5 text-[10px] text-foreground-secondary"
                >
                  <Link2 className="h-2.5 w-2.5" />
                  {d}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Segment range — subtle footer */}
      {segmentRange && (
        <div className="mt-2 font-mono text-[9px] tabular-nums text-foreground-muted">
          Segmentos {segmentRange.start}–{segmentRange.end}
        </div>
      )}
    </motion.div>
  );
}

export const AssistanceCard = memo(AssistanceCardImpl);
