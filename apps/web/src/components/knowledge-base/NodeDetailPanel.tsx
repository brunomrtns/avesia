import { X, FileText, Layers, Tags, Calendar, Clock } from 'lucide-react';
import { motion } from 'motion/react';

type NodeDetail =
  | { nodeType: 'topic'; id: string; label: string; group: string; path?: string; documentCount?: number }
  | { nodeType: 'concept'; id: string; label: string; group: string; description?: string; sourceCount?: number; community?: number | null }
  | { nodeType: 'document'; id: string; label: string; group: string; fileType?: string; summary?: string; keywords?: string[]; themes?: string[]; createdAt?: string; updatedAt?: string };

interface NodeDetailPanelProps {
  node: NodeDetail;
  onClose: () => void;
}

const TYPE_LABELS: Record<string, string> = {
  topic: 'Tópico',
  concept: 'Conceito',
  document: 'Documento',
  PERSON: 'Pessoa',
  METHOD: 'Método',
  DISORDER: 'Transtorno',
  TECHNIQUE: 'Técnica',
  PLACE: 'Local',
  TERM: 'Termo',
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
  topic: <Layers className="h-4 w-4" />,
  concept: <Tags className="h-4 w-4" />,
  document: <FileText className="h-4 w-4" />,
};

export function NodeDetailPanel({ node, onClose }: NodeDetailPanelProps) {
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('pt-BR');
  };

  return (
    <motion.div
      initial={{ x: 16, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 16, opacity: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="w-80 overflow-y-auto border-l border-border bg-surface backdrop-blur-sm"
    >
      <div className="space-y-4 p-4">
        {/* Header — refined with neural identity */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/20 bg-primary/5 text-primary">
              {TYPE_ICONS[node.nodeType]}
            </div>
            <div>
              <h3 className="text-sm font-semibold tracking-tight text-foreground">{node.label}</h3>
              <span className="text-[10px] font-medium uppercase tracking-wider text-foreground-muted">
                {TYPE_LABELS[node.group] ?? TYPE_LABELS[node.nodeType]}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-foreground-muted transition-colors hover:bg-surface-elevated hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="neural-divider" />

        {/* Topic-specific info */}
        {node.nodeType === 'topic' && (
          <div className="space-y-3">
            {node.path && (
              <div className="space-y-1">
                <span className="text-[10px] font-medium uppercase tracking-wider text-foreground-muted">Caminho</span>
                <p className="font-mono text-xs text-foreground-secondary">{node.path}</p>
              </div>
            )}
            {node.documentCount !== undefined && (
              <div className="flex items-center gap-2 text-xs text-foreground-secondary">
                <FileText className="h-3 w-3 text-primary" />
                <span>{node.documentCount} documento(s) relacionado(s)</span>
              </div>
            )}
          </div>
        )}

        {node.nodeType === 'concept' && (
          <div className="space-y-3">
            {node.description && (
              <div className="space-y-1">
                <span className="text-[10px] font-medium uppercase tracking-wider text-foreground-muted">Descrição</span>
                <p className="font-clinical text-xs leading-relaxed text-foreground-secondary">{node.description}</p>
              </div>
            )}
            {node.sourceCount !== undefined && (
              <div className="flex items-center gap-2 text-xs text-foreground-secondary">
                <FileText className="h-3 w-3 text-primary" />
                <span>Mencionado em {node.sourceCount} documento(s)</span>
              </div>
            )}
            {node.community !== null && node.community !== undefined && (
              <div className="flex items-center gap-2 text-xs text-foreground-secondary">
                <Tags className="h-3 w-3 text-accent" />
                <span>Comunidade #{node.community}</span>
              </div>
            )}
          </div>
        )}

        {node.nodeType === 'document' && (
          <div className="space-y-3">
            {node.summary && (
              <div className="space-y-1">
                <span className="text-[10px] font-medium uppercase tracking-wider text-foreground-muted">Resumo</span>
                <p className="font-clinical text-xs leading-relaxed text-foreground-secondary">{node.summary}</p>
              </div>
            )}
            {node.keywords && node.keywords.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[10px] font-medium uppercase tracking-wider text-foreground-muted">Palavras-chave</span>
                <div className="flex flex-wrap gap-1">
                  {node.keywords.map((kw) => (
                    <span key={kw} className="rounded-full border border-border bg-surface-elevated px-2 py-0.5 text-[10px] text-foreground-secondary">
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {node.themes && node.themes.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[10px] font-medium uppercase tracking-wider text-foreground-muted">Temas</span>
                <div className="flex flex-wrap gap-1">
                  {node.themes.map((t) => (
                    <span key={t} className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {node.fileType && (
              <div className="flex items-center gap-2 text-xs text-foreground-secondary">
                <FileText className="h-3 w-3 text-foreground-muted" />
                <span className="font-mono">.{node.fileType}</span>
              </div>
            )}
          </div>
        )}

        {/* Timestamps */}
        <div className="space-y-1.5 border-t border-border-subtle pt-3">
          {node.nodeType === 'document' && node.createdAt && (
            <div className="flex items-center gap-2 text-[10px] text-foreground-muted">
              <Calendar className="h-3 w-3" />
              <span>Criado em {formatDate(node.createdAt)}</span>
            </div>
          )}
          {node.nodeType === 'document' && node.updatedAt && (
            <div className="flex items-center gap-2 text-[10px] text-foreground-muted">
              <Clock className="h-3 w-3" />
              <span>Atualizado em {formatDate(node.updatedAt)}</span>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
