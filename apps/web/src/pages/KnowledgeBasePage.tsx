import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Upload,
  BookOpen,
  Search,
  AlertTriangle,
  Plus,
  FileText,
  Trash2,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';

import { KnowledgeGraph } from '@/components/knowledge-base/KnowledgeGraph.js';
import { NodeDetailPanel } from '@/components/knowledge-base/NodeDetailPanel.js';
import { UploadDialog } from '@/components/knowledge-base/UploadDialog.js';
import { request, ApiError } from '@/lib/api-client.js';
import { useKbProgress, type KbProgressEvent } from '@/lib/use-kb-progress.js';
import { cn } from '@/lib/utils.js';
import { Button } from '@/components/ui/button.js';
import { Card } from '@/components/ui/card.js';
import { Badge } from '@/components/ui/badge.js';
import { Input } from '@/components/ui/input.js';
import { Textarea } from '@/components/ui/textarea.js';
import { Label } from '@/components/ui/label.js';
import { Progress } from '@/components/ui/progress.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs.js';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog.js';

interface KnowledgeBaseItem {
  id: string;
  name: string;
  description: string | null;
  type: string;
  _count?: { documents: number; topics: number; concepts: number };
}

interface KnowledgeDocumentItem {
  id: string;
  originalFileName: string;
  fileType: string;
  status: string;
  progress: number | null;
  fileSize: number | null;
  errorMessage: string | null;
  summary: string | null;
  keywords: string[];
  themes: string[];
  categories: unknown;
  createdAt: string;
}

interface GraphNode {
  id: string;
  type: string;
  label: string;
  group: string;
  parentId?: string | null;
  path?: string;
  sourceCount?: number;
  fileType?: string;
  community?: number | null;
  description?: string | null;
  summary?: string | null;
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  strength: number;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

type NodeDetail =
  | { nodeType: 'topic'; id: string; label: string; group: string; path?: string; documentCount?: number }
  | { nodeType: 'concept'; id: string; label: string; group: string; description?: string; sourceCount?: number; community?: number | null }
  | { nodeType: 'document'; id: string; label: string; group: string; fileType?: string; summary?: string; keywords?: string[]; themes?: string[]; createdAt?: string; updatedAt?: string };

const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; variant: 'default' | 'warning' | 'success' | 'destructive' }> = {
  PENDING: { label: 'Pendente', icon: <Clock className="w-3 h-3" />, variant: 'default' },
  PROCESSING: { label: 'Processando', icon: <Loader2 className="w-3 h-3 animate-spin" />, variant: 'warning' },
  COMPLETED: { label: 'Concluído', icon: <CheckCircle2 className="w-3 h-3" />, variant: 'success' },
  FAILED: { label: 'Falhou', icon: <XCircle className="w-3 h-3" />, variant: 'destructive' },
};

function formatFileSize(bytes: number | null): string {
  if (bytes === null) return '—';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export default function KnowledgeBasePage(): React.ReactNode {
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseItem[]>([]);
  const [activeKb, setActiveKb] = useState<KnowledgeBaseItem | null>(null);
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], edges: [] });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedNodeDetail, setSelectedNodeDetail] = useState<NodeDetail | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<KnowledgeDocumentItem[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [rightTab, setRightTab] = useState<'graph' | 'documents'>('graph');
  const [processing, setProcessing] = useState<Record<string, { progress: number; stage: string; message: string; status: string }>>({});

  // ── Real-time progress stream ──────────────────────────────────────────
  // Subscribes to the worker's pipeline events (via API WebSocket ← Redis
  // pub/sub). Updates per-document progress live and reloads the graph/docs
  // when the knowledge graph or the whole pipeline finishes.
  useKbProgress({
    knowledgeBaseId: activeKb?.id,
    onEvent: (event: KbProgressEvent) => {
      setProcessing((prev) => ({
        ...prev,
        [event.documentId]: {
          progress: event.progress,
          stage: event.message,
          message: event.message,
          status: event.status,
        },
      }));

      // Graph evolves during 'build-graph'; reload to surface new nodes/edges.
      if (event.status === 'completed' && (event.stage === 'build-graph' || event.stage === 'finalize')) {
        void loadGraph(activeKb!.id);
      }
      // On finalize, the document is done — refresh the documents list and
      // drop it from the live processing map.
      if (event.stage === 'finalize') {
        void loadDocuments(activeKb!.id);
        if (event.status === 'completed' || event.status === 'failed') {
          setProcessing((prev) => {
            const next = { ...prev };
            delete next[event.documentId];
            return next;
          });
        }
      }
    },
  });

  const loadBases = useCallback(async () => {
    try {
      const data = await request<{ items: KnowledgeBaseItem[] }>('/knowledge-bases');
      setKnowledgeBases(data.items);
      if (data.items.length > 0 && !activeKb) {
        setActiveKb(data.items[0]!);
      }
    } catch {
      // will show empty state
    } finally {
      setLoading(false);
    }
  }, [activeKb]);

  const loadGraph = useCallback(async (kbId: string) => {
    try {
      const data = await request<GraphData>(`/knowledge-bases/${kbId}/graph`);
      setGraphData(data);
    } catch {
      setGraphData({ nodes: [], edges: [] });
    }
  }, []);

  const loadDocuments = useCallback(async (kbId: string) => {
    setDocsLoading(true);
    try {
      const data = await request<{ id: string; documents: KnowledgeDocumentItem[] }>(`/knowledge-bases/${kbId}`);
      setDocuments(data.documents ?? []);
    } catch {
      setDocuments([]);
    } finally {
      setDocsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBases();
  }, [loadBases]);

  useEffect(() => {
    if (!activeKb) return;
    void loadGraph(activeKb.id);
    void loadDocuments(activeKb.id);
  }, [activeKb, loadGraph, loadDocuments]);

  const handleNodeSelect = async (nodeId: string, nodeType: string) => {
    setSelectedNodeId(nodeId);

    const node = graphData.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    if (nodeType === 'topic') {
      const detail: NodeDetail = {
        nodeType: 'topic',
        id: node.id,
        label: node.label,
        group: node.group,
      };
      if (node.path) detail.path = node.path;
      if (activeKb?._count?.topics !== undefined) detail.documentCount = activeKb._count.topics;
      setSelectedNodeDetail(detail);
    } else if (nodeType === 'concept') {
      const detail: NodeDetail = {
        nodeType: 'concept',
        id: node.id,
        label: node.label,
        group: node.group,
      };
      if (node.sourceCount !== undefined) detail.sourceCount = node.sourceCount;
      if (node.community !== undefined && node.community !== null) detail.community = node.community;
      if (node.description) detail.description = node.description;
      setSelectedNodeDetail(detail);
    } else if (nodeType === 'document') {
      if (activeKb) {
        try {
          const doc = await request<{ documents: KnowledgeDocumentItem[] }>(`/knowledge-bases/${activeKb.id}`);
          const found = doc.documents?.find((d) => d.id === nodeId);
          if (found) {
            const detail: NodeDetail = {
              nodeType: 'document',
              id: found.id,
              label: found.originalFileName,
              group: 'document',
            };
            if (found.fileType) detail.fileType = found.fileType;
            if (found.createdAt) detail.createdAt = found.createdAt;
            if (found.summary) detail.summary = found.summary;
            if (found.keywords?.length) detail.keywords = found.keywords;
            if (found.themes?.length) detail.themes = found.themes;
            setSelectedNodeDetail(detail);
          }
        } catch {
          const detail: NodeDetail = {
            nodeType: 'document',
            id: node.id,
            label: node.label,
            group: node.group,
          };
          if (node.fileType) detail.fileType = node.fileType;
          setSelectedNodeDetail(detail);
        }
      }
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    if (!activeKb) return;
    const doc = documents.find((d) => d.id === docId);
    const fileName = doc?.originalFileName ?? 'este documento';

    toast(`Deletar "${fileName}"?`, {
      duration: 8000,
      action: {
        label: 'Deletar',
        onClick: async () => {
          try {
            await request<void>(`/knowledge-bases/${activeKb.id}/documents/${docId}`, { method: 'DELETE' });
            setDocuments((prev) => prev.filter((d) => d.id !== docId));
            void loadGraph(activeKb.id);
            toast.success('Documento deletado com sucesso');
          } catch (err) {
            const message = err instanceof ApiError ? err.message : 'Erro ao deletar documento';
            toast.error(message);
          }
        },
      },
      cancel: {
        label: 'Cancelar',
        onClick: () => {},
      },
    });
  };

  const handleDeleteKb = async (kbId: string) => {
    const kb = knowledgeBases.find((k) => k.id === kbId);
    const kbName = kb?.name ?? 'esta base de conhecimento';

    toast(`Deletar "${kbName}" e todos os documentos?`, {
      duration: 8000,
      action: {
        label: 'Deletar',
        onClick: async () => {
          try {
            await request<void>(`/knowledge-bases/${kbId}`, { method: 'DELETE' });
            setKnowledgeBases((prev) => prev.filter((k) => k.id !== kbId));
            if (activeKb?.id === kbId) {
              setActiveKb(null);
              setGraphData({ nodes: [], edges: [] });
              setDocuments([]);
            }
            toast.success('Base de conhecimento deletada');
          } catch (err) {
            const message = err instanceof ApiError ? err.message : 'Erro ao deletar base';
            toast.error(message);
          }
        },
      },
      cancel: {
        label: 'Cancelar',
        onClick: () => {},
      },
    });
  };

  const filteredKb = knowledgeBases.filter((kb) =>
    kb.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col -m-6 mesh-bg">
      <div className="border-b border-warning/20 bg-warning/10 px-6 py-2.5">
        <div className="flex items-start gap-2 text-xs text-warning">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <p className="text-foreground-secondary">
            A qualidade das respostas da IA depende diretamente dos documentos enviados.
            Revise periodicamente sua Base de Conhecimento.
          </p>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 border-r border-border bg-surface/60 glass flex flex-col">
          <div className="p-3 border-b border-border">
            <div className="flex items-center justify-between mb-2.5">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-primary" />
                Bases
              </h2>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setCreateOpen(true)}
                aria-label="Criar nova base"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-foreground-muted pointer-events-none" />
              <Input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filtrar..."
                className="h-8 pl-8 pr-2 text-xs"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {loading && (
              <div className="space-y-1.5 px-1">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            )}
            <AnimatePresence mode="popLayout">
              {filteredKb.map((kb, index) => (
                <motion.div
                  key={kb.id}
                  layout
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.2, delay: index * 0.03, ease: [0.16, 1, 0.3, 1] }}
                  className={cn(
                    'group flex items-center gap-1 px-3 py-2 rounded-md text-xs transition-colors cursor-pointer border',
                    activeKb?.id === kb.id
                      ? 'bg-primary/10 text-primary border-primary/30'
                      : 'text-foreground-secondary hover:bg-surface-elevated hover:text-foreground border-transparent',
                  )}
                  onClick={() => setActiveKb(kb)}
                  onKeyDown={(e) => e.key === 'Enter' && setActiveKb(kb)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{kb.name}</div>
                    <div className="flex gap-2 mt-0.5 text-foreground-muted">
                      <span>{kb._count?.documents ?? 0} docs</span>
                      <span>{kb._count?.topics ?? 0} tópicos</span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); void handleDeleteKb(kb.id); }}
                    className="opacity-0 group-hover:opacity-100 text-foreground-muted hover:text-destructive transition-all p-0.5"
                    aria-label="Excluir base"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
            {filteredKb.length === 0 && !loading && (
              <p className="text-xs text-foreground-muted text-center py-4">
                Nenhuma base encontrada
              </p>
            )}
          </div>
        </div>

        {/* Main area */}
        <div className="flex-1 flex flex-col">
          <AnimatePresence>
            {activeKb && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-surface/40"
              >
                <div className="min-w-0">
                  <h1 className="text-sm font-semibold text-foreground truncate">{activeKb.name}</h1>
                  {activeKb.description && (
                    <p className="text-xs text-foreground-muted truncate">{activeKb.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {Object.keys(processing).length > 0 && (
                    <Badge variant="default" className="ai-pulse">
                      <Sparkles className="w-3 h-3" />
                      Processando {Object.keys(processing).length}
                    </Badge>
                  )}
                  <Tabs value={rightTab} onValueChange={(v) => setRightTab(v as 'graph' | 'documents')}>
                    <TabsList className="h-8">
                      <TabsTrigger value="graph" className="px-2.5 py-1 text-xs">Grafo</TabsTrigger>
                      <TabsTrigger value="documents" className="px-2.5 py-1 text-xs">Documentos</TabsTrigger>
                    </TabsList>
                  </Tabs>
                  <Button
                    variant="gradient"
                    size="sm"
                    onClick={() => setUploadOpen(true)}
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Upload
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex-1 flex overflow-hidden">
            {/* Graph or Documents */}
            <div className="flex-1 overflow-auto">
              {rightTab === 'graph' && (
                <KnowledgeGraph
                  nodes={graphData.nodes}
                  edges={graphData.edges}
                  onNodeSelect={handleNodeSelect}
                  selectedNodeId={selectedNodeId}
                />
              )}
              {rightTab === 'documents' && (
                <div className="p-4 space-y-2">
                  {docsLoading && (
                    <div className="space-y-2">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Skeleton key={i} className="h-16 w-full rounded-lg" />
                      ))}
                    </div>
                  )}
                  {!docsLoading && documents.length === 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                      className="flex flex-col items-center justify-center py-16 text-center"
                    >
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-elevated mb-3">
                        <FileText className="w-7 h-7 text-foreground-muted" />
                      </div>
                      <p className="text-sm text-foreground-secondary">Nenhum documento nesta base</p>
                      <Button
                        variant="link"
                        size="sm"
                        onClick={() => setUploadOpen(true)}
                        className="mt-2"
                      >
                        Fazer upload do primeiro documento
                      </Button>
                    </motion.div>
                  )}
                  <AnimatePresence mode="popLayout">
                    {documents.map((doc, index) => {
                      const status = STATUS_CONFIG[doc.status] ?? STATUS_CONFIG.PENDING!;
                      const live = processing[doc.id];
                      const isLiveProcessing = live !== undefined && live.status !== 'failed';
                      const displayProgress = live?.progress ?? doc.progress ?? 0;
                      return (
                        <motion.div
                          key={doc.id}
                          layout
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.98 }}
                          transition={{ duration: 0.2, delay: index * 0.03, ease: [0.16, 1, 0.3, 1] }}
                        >
                          <Card className="group flex items-center gap-3 px-3 py-2.5 hover:shadow-md transition-shadow">
                            <FileText className="w-4 h-4 text-foreground-muted shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-foreground truncate">{doc.originalFileName}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <Badge variant={status.variant} className="py-0">
                                  {status.icon}
                                  {status.label}
                                </Badge>
                                {displayProgress > 0 && displayProgress < 100 && (
                                  <span className="text-xs text-foreground-muted">{displayProgress}%</span>
                                )}
                                <span className="text-xs text-foreground-muted">{formatFileSize(doc.fileSize)}</span>
                              </div>
                              {isLiveProcessing && (
                                <div className="mt-1.5 space-y-1">
                                  <Progress value={displayProgress} className="h-1" />
                                  {live && (
                                    <p className="text-[10px] text-primary/80 truncate">{live.message}</p>
                                  )}
                                </div>
                              )}
                              {doc.errorMessage && (
                                <p className="text-xs text-destructive mt-0.5">{doc.errorMessage}</p>
                              )}
                            </div>
                            <button
                              onClick={() => void handleDeleteDocument(doc.id)}
                              className="text-foreground-muted hover:text-destructive transition-colors p-1 opacity-0 group-hover:opacity-100"
                              aria-label="Excluir documento"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </Card>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              )}
            </div>

            {/* Detail panel */}
            {selectedNodeDetail && (
              <NodeDetailPanel
                node={selectedNodeDetail}
                onClose={() => {
                  setSelectedNodeId(null);
                  setSelectedNodeDetail(null);
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Upload Dialog */}
      {activeKb && (
        <UploadDialog
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          knowledgeBaseId={activeKb.id}
        />
      )}

      {/* Create Base Dialog */}
      <CreateBaseDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(kb) => {
          setKnowledgeBases((prev) => [...prev, kb]);
          setActiveKb(kb);
        }}
      />
    </div>
  );
}

interface CreateBaseDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onCreated: (kb: KnowledgeBaseItem) => void;
}

function CreateBaseDialog({ open, onOpenChange, onCreated }: CreateBaseDialogProps): React.ReactNode {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim()) {
      setError('Nome é obrigatório');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const kb = await request<KnowledgeBaseItem>('/knowledge-bases', {
        method: 'POST',
        body: { name: name.trim(), description: description.trim() || null },
      });
      onCreated(kb);
      onOpenChange(false);
      setName('');
      setDescription('');
    } catch (err) {
      setError(err instanceof ApiError ? String(err.body ?? err.message) : 'Erro ao criar base');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-primary glow-primary">
              <BookOpen className="w-4 h-4 text-white" />
            </div>
            Nova Base de Conhecimento
          </DialogTitle>
          <DialogDescription>
            Crie uma base para organizar seus documentos clínicos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="kb-name">Nome</Label>
            <Input
              id="kb-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Protocolos TCC"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="kb-desc">
              Descrição <span className="text-foreground-muted font-normal">(opcional)</span>
            </Label>
            <Textarea
              id="kb-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Protocolos clínicos para ansiedade e depressão"
              rows={2}
              className="resize-none min-h-[60px]"
            />
          </div>
          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancelar</Button>
          </DialogClose>
          <Button
            variant="gradient"
            onClick={() => void handleCreate()}
            disabled={creating || !name.trim()}
          >
            {creating && <Loader2 className="w-4 h-4 animate-spin" />}
            Criar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
