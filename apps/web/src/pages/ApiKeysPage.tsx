import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  AlertTriangle,
  Check,
  Copy,
  Key,
  KeyRound,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react';

import { api } from '@/lib/api-client';
import type { ApiKey } from '@/lib/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export function ApiKeysPage(): React.ReactNode {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [createdKey, setCreatedKey] = useState<{ apiKey: ApiKey; key: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const keysQuery = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => api.apiKeys.list(),
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; expiresAt?: string }) => api.apiKeys.create(data),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      setCreatedKey(data);
      toast.success('Chave de API criada com sucesso');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Erro ao criar chave de API'),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => api.apiKeys.revoke(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      toast.success('Chave revogada');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Erro ao revogar chave'),
  });

  const handleCopy = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      setCopied(true);
      toast.success('Chave copiada para a área de transferência');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Não foi possível copiar a chave');
    }
  };

  const handleRevoke = (key: ApiKey) => {
    if (window.confirm(`Tem certeza que deseja revogar a chave "${key.name}"? Esta ação não pode ser desfeita.`)) {
      revokeMutation.mutate(key.id);
    }
  };

  const keys = keysQuery.data ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="flex items-end justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Chaves de API</h1>
          <p className="text-sm text-foreground-secondary">Gerencie chaves para acesso programático à API</p>
        </div>
        <Button variant="gradient" size="sm" onClick={() => { setCreatedKey(null); setDialogOpen(true); }}>
          <Plus className="h-4 w-4" />
          Nova Chave
        </Button>
      </motion.div>

      {/* Warning banner */}
      <Card className="border-warning/20 bg-warning/5">
        <CardContent className="flex items-start gap-3 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          <div>
            <p className="text-sm font-medium text-foreground">Atenção</p>
            <p className="mt-1 text-xs text-foreground-secondary">
              A chave completa é exibida apenas uma vez no momento da criação. Guarde-a em local seguro.
              Não compartilhe suas chaves de API publicamente.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Created key display */}
      {createdKey && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Card className="border-success/20 bg-success/5">
            <CardContent className="space-y-3 p-5">
              <div className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-success" />
                <h3 className="text-sm font-semibold text-foreground">Chave Criada — copie agora!</h3>
              </div>
              <p className="text-xs text-foreground-muted">
                Esta é a única vez que a chave completa será exibida. Copie-a e armazene em local seguro.
              </p>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={createdKey.key}
                  className="font-mono text-xs"
                  onFocus={(e) => e.target.select()}
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handleCopy(createdKey.key)}
                  title="Copiar chave"
                >
                  {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setCreatedKey(null)}>
                Fechar
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Keys table */}
      <div className="rounded-lg border border-border bg-surface shadow-sm">
        {keysQuery.isLoading ? (
          <div className="space-y-3 p-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : keys.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Key className="h-6 w-6 text-foreground-muted" />
            </div>
            <p className="text-sm font-medium text-foreground">Nenhuma chave de API</p>
            <p className="text-xs text-foreground-muted">Crie sua primeira chave para acessar a API programaticamente.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Prefixo</TableHead>
                <TableHead>Último Uso</TableHead>
                <TableHead>Criada em</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((key: ApiKey) => {
                const isRevoked = !!key.revokedAt;
                const isExpired = key.expiresAt ? new Date(key.expiresAt) < new Date() : false;
                return (
                  <TableRow key={key.id} className={isRevoked ? 'opacity-50' : ''}>
                    <TableCell className="font-medium text-foreground">{key.name}</TableCell>
                    <TableCell className="font-mono text-xs text-foreground-secondary">
                      {key.keyPrefix}••••••••
                    </TableCell>
                    <TableCell className="text-foreground-secondary">
                      {key.lastUsedAt
                        ? format(new Date(key.lastUsedAt), 'dd/MM/yyyy', { locale: ptBR })
                        : 'Nunca'}
                    </TableCell>
                    <TableCell className="text-foreground-secondary">
                      {format(new Date(key.createdAt), 'dd/MM/yyyy', { locale: ptBR })}
                    </TableCell>
                    <TableCell>
                      {isRevoked ? (
                        <Badge variant="destructive" className="text-[10px]">Revogada</Badge>
                      ) : isExpired ? (
                        <Badge variant="warning" className="text-[10px]">Expirada</Badge>
                      ) : (
                        <Badge variant="success" className="text-[10px]">Ativa</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {!isRevoked && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleRevoke(key)}
                          disabled={revokeMutation.isPending}
                          className="hover:bg-destructive/10 hover:text-destructive"
                          title="Revogar chave"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Create dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setCreatedKey(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Chave de API</DialogTitle>
          </DialogHeader>
          <ApiKeyForm
            onSubmit={(data) => createMutation.mutate(data)}
            loading={createMutation.isPending}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface ApiKeyFormProps {
  readonly onSubmit: (data: { name: string; expiresAt?: string }) => void;
  readonly loading: boolean;
}

function ApiKeyForm({ onSubmit, loading }: ApiKeyFormProps): React.ReactNode {
  const [name, setName] = useState('');
  const [expiresAt, setExpiresAt] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }
    const payload: { name: string; expiresAt?: string } = { name: name.trim() };
    if (expiresAt) payload.expiresAt = expiresAt;
    onSubmit(payload);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="api-key-name">Nome *</Label>
        <Input
          id="api-key-name"
          type="text"
          placeholder="Ex: Integração CRM"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <p className="text-xs text-foreground-muted">Um nome descritivo para identificar esta chave</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="api-key-expires">Data de Expiração (opcional)</Label>
        <Input
          id="api-key-expires"
          type="date"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
        />
        <p className="text-xs text-foreground-muted">Deixe em branco para uma chave sem expiração</p>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button type="submit" disabled={loading} variant="gradient">
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Criando...
            </>
          ) : (
            <>
              <KeyRound className="h-4 w-4" />
              Criar Chave
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
