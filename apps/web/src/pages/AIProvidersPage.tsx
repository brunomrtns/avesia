import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  Cpu,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  Loader2,
  Zap,
  Server,
  Cloud,
  Pencil,
  Power,
  Shield,
} from 'lucide-react';

import { api } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';
import { Navigate, useParams } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

// ── Types ────────────────────────────────────────────────────────────────────
interface AIProviderConfigDTO {
  id: string;
  provider: string;
  label: string;
  apiKeyMasked: string;
  hasApiKey: boolean;
  baseUrl: string | null;
  model: string;
  embeddingModel: string | null;
  isActive: boolean;
  isFallback: boolean;
  lastStatus: string;
  lastCheckedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AIProvidersResponse {
  items: AIProviderConfigDTO[];
}

interface TestResult {
  status: 'ok' | 'fail';
  provider: string;
  model: string;
  message: string;
}

const PROVIDER_META: Record<string, { icon: typeof Cloud; label: string; color: string }> = {
  'nvidia-nim': { icon: Cloud, label: 'NVIDIA NIM', color: 'text-green-500' },
  'openrouter': { icon: Server, label: 'OpenRouter', color: 'text-purple-500' },
  'ollama': { icon: Cpu, label: 'Ollama (Local)', color: 'text-blue-500' },
};

// ── Page ─────────────────────────────────────────────────────────────────────
export function AIProvidersPage(): React.ReactNode {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<AIProviderConfigDTO | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  // Admin/owner only
  if (user && user.role !== 'OWNER' && user.role !== 'ADMIN') {
    const { orgSlug } = useParams<{ orgSlug: string }>();
    return <Navigate to={orgSlug ? `/${orgSlug}` : '/'} replace />;
  }

  const providersQuery = useQuery({
    queryKey: ['ai-providers'],
    queryFn: () => api.aiProviders.list<AIProvidersResponse>(),
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.aiProviders.create(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ai-providers'] });
      toast.success('Provedor adicionado com sucesso');
      setDialogOpen(false);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Erro ao adicionar provedor'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      api.aiProviders.update(id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ai-providers'] });
      toast.success('Provedor atualizado');
      setDialogOpen(false);
      setEditingProvider(null);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Erro ao atualizar'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.aiProviders.delete(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ai-providers'] });
      toast.success('Provedor removido');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Erro ao remover'),
  });

  const activateMutation = useMutation({
    mutationFn: (id: string) => api.aiProviders.activate(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ai-providers'] });
      toast.success('Provedor ativado como principal');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Erro ao ativar'),
  });

  const fallbackMutation = useMutation({
    mutationFn: (id: string) => api.aiProviders.setFallback(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ai-providers'] });
      toast.success('Provedor definido como fallback');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Erro ao definir fallback'),
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => api.aiProviders.test<TestResult>(id),
    onMutate: (id) => setTestingId(id),
    onSettled: () => setTestingId(null),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['ai-providers'] });
      if (result.status === 'ok') {
        toast.success(`Conexão OK — ${result.provider}`);
      } else {
        toast.error(`Falha: ${result.message}`);
      }
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Erro no teste'),
  });

  const providers = providersQuery.data?.items ?? [];

  const handleEdit = (cfg: AIProviderConfigDTO) => {
    setEditingProvider(cfg);
    setDialogOpen(true);
  };

  const handleAdd = () => {
    setEditingProvider(null);
    setDialogOpen(true);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Provedores de IA</h1>
          <p className="text-sm text-foreground-secondary">
            Configure os provedores de IA da sua clínica
          </p>
        </div>
        <Button variant="gradient" onClick={handleAdd}>
          <Plus className="h-4 w-4" />
          Adicionar
        </Button>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-lg border border-border-subtle bg-surface/50 p-4">
        <Zap className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="text-sm text-foreground-secondary">
          <p className="font-medium text-foreground">Como funciona</p>
          <p className="mt-1">
            Escolha um provedor <strong>Principal</strong> e um <strong>Fallback</strong>. Se o
            provedor principal for local (Ollama) e estiver offline (PC desligado), o sistema
            detecta automaticamente e usa o fallback. Provedores na nuvem (NIM, OpenRouter) são
            considerados sempre online.
          </p>
        </div>
      </div>

      {/* Loading */}
      {providersQuery.isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}

      {/* Provider cards */}
      {!providersQuery.isLoading && providers.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Cpu className="h-10 w-10 text-foreground-muted" />
            <p className="mt-3 text-sm text-foreground-secondary">
              Nenhum provedor configurado. Clique em "Adicionar" para começar.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {providers.map((cfg) => {
          const meta = PROVIDER_META[cfg.provider] ?? { icon: Server, label: cfg.provider, color: '' };
          const Icon = meta.icon;
          const isTesting = testingId === cfg.id;

          return (
            <Card
              key={cfg.id}
              className={cn(
                'transition-all',
                cfg.isActive && 'border-primary/40 shadow-[0_0_0_1px_hsl(var(--primary)/0.2)]',
              )}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  {/* Left: icon + info */}
                  <div className="flex items-start gap-3">
                    <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-elevated', meta.color)}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-semibold text-foreground">{cfg.label}</h3>
                        {cfg.isActive && (
                          <Badge className="bg-primary/10 text-primary border-primary/20">
                            <CheckCircle2 className="mr-1 h-3 w-3" />
                            Principal
                          </Badge>
                        )}
                        {cfg.isFallback && (
                          <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">
                            <Shield className="mr-1 h-3 w-3" />
                            Fallback
                          </Badge>
                        )}
                        {/* Status indicator */}
                        {cfg.lastStatus === 'ok' && (
                          <span className="flex items-center gap-1 text-xs text-success">
                            <CheckCircle2 className="h-3 w-3" /> Online
                          </span>
                        )}
                        {cfg.lastStatus === 'fail' && (
                          <span className="flex items-center gap-1 text-xs text-destructive">
                            <XCircle className="h-3 w-3" /> Offline
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-foreground-muted">
                        Modelo: <span className="font-mono text-foreground-secondary">{cfg.model}</span>
                      </p>
                      {cfg.baseUrl && (
                        <p className="text-xs text-foreground-muted">
                          URL: <span className="font-mono text-foreground-secondary">{cfg.baseUrl}</span>
                        </p>
                      )}
                      {cfg.hasApiKey && (
                        <p className="text-xs text-foreground-muted">
                          API Key: <span className="font-mono">{cfg.apiKeyMasked}</span>
                        </p>
                      )}
                      {cfg.embeddingModel && (
                        <p className="text-xs text-foreground-muted">
                          Embeddings: <span className="font-mono text-foreground-secondary">{cfg.embeddingModel}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Right: actions */}
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => testMutation.mutate(cfg.id)}
                      disabled={isTesting}
                      title="Testar conexão"
                    >
                      {isTesting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Zap className="h-4 w-4" />
                      )}
                      <span className="ml-1.5 hidden sm:inline">Testar</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(cfg)}
                      title="Editar"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {!cfg.isActive && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => activateMutation.mutate(cfg.id)}
                        disabled={activateMutation.isPending}
                        title="Definir como provedor principal"
                      >
                        <Power className="h-4 w-4 text-primary" />
                        <span className="ml-1.5 hidden sm:inline">Principal</span>
                      </Button>
                    )}
                    {!cfg.isFallback && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => fallbackMutation.mutate(cfg.id)}
                        disabled={fallbackMutation.isPending}
                        title="Definir como fallback"
                      >
                        <Shield className="h-4 w-4 text-amber-500" />
                        <span className="ml-1.5 hidden sm:inline">Fallback</span>
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (confirm(`Remover o provedor "${cfg.label}"?`)) {
                          deleteMutation.mutate(cfg.id);
                        }
                      }}
                      title="Remover"
                      className="text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Add/Edit Dialog */}
      <ProviderDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editingProvider={editingProvider}
        onCreate={(data) => createMutation.mutate(data)}
        onUpdate={(id, data) => updateMutation.mutate({ id, data })}
        loading={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}

// ── Provider Dialog (Add/Edit) ───────────────────────────────────────────────
interface ProviderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingProvider: AIProviderConfigDTO | null;
  onCreate: (data: Record<string, unknown>) => void;
  onUpdate: (id: string, data: Record<string, unknown>) => void;
  loading: boolean;
}

function ProviderDialog({
  open,
  onOpenChange,
  editingProvider,
  onCreate,
  onUpdate,
  loading,
}: ProviderDialogProps): React.ReactNode {
  const isEdit = !!editingProvider;
  const [provider, setProvider] = useState('nvidia-nim');
  const [label, setLabel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [embeddingModel, setEmbeddingModel] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [isFallback, setIsFallback] = useState(false);

  // Sync form when dialog opens
  useEffect(() => {
    if (open) {
      if (editingProvider) {
        setProvider(editingProvider.provider);
        setLabel(editingProvider.label);
        setBaseUrl(editingProvider.baseUrl ?? '');
        setModel(editingProvider.model);
        setEmbeddingModel(editingProvider.embeddingModel ?? '');
        setIsActive(editingProvider.isActive);
        setIsFallback(editingProvider.isFallback);
        setApiKey('');
      } else {
        setProvider('nvidia-nim');
        setLabel('');
        setApiKey('');
        setBaseUrl('');
        setModel('');
        setEmbeddingModel('');
        setIsActive(false);
        setIsFallback(false);
      }
    }
  }, [open, editingProvider]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data: Record<string, unknown> = {
      label,
      model,
      ...(baseUrl ? { baseUrl } : {}),
      ...(embeddingModel ? { embeddingModel } : {}),
      ...(apiKey ? { apiKey } : {}),
    };

    if (isEdit && editingProvider) {
      onUpdate(editingProvider.id, data);
    } else {
      data.provider = provider;
      data.isActive = isActive;
      data.isFallback = isFallback;
      onCreate(data);
    }
  };

  const showApiKey = provider !== 'ollama';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar Provedor' : 'Adicionar Provedor'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Provider type (only on create) */}
          {!isEdit && (
            <div className="space-y-2">
              <Label>Tipo de provedor</Label>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(PROVIDER_META).map(([key, meta]) => {
                  const Icon = meta.icon;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setProvider(key)}
                      className={cn(
                        'flex flex-col items-center gap-1.5 rounded-lg border p-3 text-xs transition-all',
                        provider === key
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-border text-foreground-secondary hover:bg-surface-elevated',
                      )}
                    >
                      <Icon className={cn('h-5 w-5', meta.color)} />
                      {meta.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Label */}
          <div className="space-y-2">
            <Label htmlFor="provider-label">Nome de exibição</Label>
            <Input
              id="provider-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ex: NVIDIA NIM, Ollama Local..."
              required
            />
          </div>

          {/* API Key */}
          {showApiKey && (
            <div className="space-y-2">
              <Label htmlFor="provider-api-key">
                API Key {isEdit && <span className="text-foreground-muted">(deixe vazio para manter)</span>}
              </Label>
              <Input
                id="provider-api-key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={isEdit ? '••••••••' : 'nvapi-...'}
                {...(!isEdit ? { required: true } : {})}
              />
            </div>
          )}

          {/* Base URL */}
          <div className="space-y-2">
            <Label htmlFor="provider-base-url">Base URL (opcional)</Label>
            <Input
              id="provider-base-url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={
                provider === 'nvidia-nim'
                  ? 'https://integrate.api.nvidia.com/v1'
                  : provider === 'openrouter'
                    ? 'https://openrouter.ai/api/v1'
                    : 'http://localhost:11434'
              }
            />
          </div>

          {/* Model */}
          <div className="space-y-2">
            <Label htmlFor="provider-model">Modelo de chat</Label>
            <Input
              id="provider-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={
                provider === 'nvidia-nim'
                  ? 'meta/llama-3.1-8b-instruct'
                  : provider === 'openrouter'
                    ? 'meta-llama/llama-3.3-70b-instruct'
                    : 'gemma3:12b'
              }
              required
            />
          </div>

          {/* Embedding Model */}
          <div className="space-y-2">
            <Label htmlFor="provider-embedding">Modelo de embeddings (opcional)</Label>
            <Input
              id="provider-embedding"
              value={embeddingModel}
              onChange={(e) => setEmbeddingModel(e.target.value)}
              placeholder="nvidia/llama-nemotron-embed-1b-v2"
            />
            <p className="text-xs text-foreground-muted">
              Usado para gerar embeddings de documentos. Padrão do servidor se vazio.
            </p>
          </div>

          {/* Active/Fallback toggles (only on create) */}
          {!isEdit && (
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="rounded border-border"
                />
                <span>Definir como provedor <strong>principal</strong></span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isFallback}
                  onChange={(e) => setIsFallback(e.target.checked)}
                  className="rounded border-border"
                />
                <span>Definir como <strong>fallback</strong> (usado se o principal estiver offline)</span>
              </label>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="gradient" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                isEdit ? 'Salvar' : 'Adicionar'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
