import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Building2,
  Copy,
  Check,
  Loader2,
  Plus,
  Shield,
  Users,
  UserPlus,
  Ban,
  CheckCircle2,
  Eye,
  EyeOff,
} from 'lucide-react';

import { api } from '@/lib/api-client';
import type { AdminOrganization, AdminUser } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export function AdminPage(): React.ReactNode {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const [createOrgOpen, setCreateOrgOpen] = useState(false);
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [selectedOrgName, setSelectedOrgName] = useState<string>('');
  const [createdResult, setCreatedResult] = useState<{ tempPassword: string; email: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [showTempPassword, setShowTempPassword] = useState(false);

  // Create org form state
  const [orgName, setOrgName] = useState('');
  const [orgSlug, setOrgSlug] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  // Create user form state
  const [userEmail, setUserEmail] = useState('');
  const [userRole, setUserRole] = useState<'OWNER' | 'ADMIN' | 'PROFESSIONAL'>('ADMIN');
  const [userPassword, setUserPassword] = useState('');

  const orgsQuery = useQuery({
    queryKey: ['admin-organizations'],
    queryFn: () => api.admin.listOrganizations(),
  });

  const orgUsersQuery = useQuery({
    queryKey: ['admin-org-users', selectedOrgId],
    queryFn: () => api.admin.listOrgUsers(selectedOrgId!),
    enabled: !!selectedOrgId,
  });

  const createOrgMutation = useMutation({
    mutationFn: (data: { name: string; slug?: string; adminEmail: string; adminPassword?: string }) =>
      api.admin.createOrganization(data),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['admin-organizations'] });
      setCreateOrgOpen(false);
      setOrgName('');
      setOrgSlug('');
      setAdminEmail('');
      setAdminPassword('');
      setCreatedResult({ tempPassword: data.tempPassword, email: data.adminUser.email as string });
      toast.success('Organização criada com sucesso');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Erro ao criar organização'),
  });

  const createUserMutation = useMutation({
    mutationFn: (data: { orgId: string; email: string; role: 'OWNER' | 'ADMIN' | 'PROFESSIONAL'; password?: string }) => {
      const { orgId, ...rest } = data;
      return api.admin.createOrgUser(orgId, rest);
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['admin-org-users', selectedOrgId] });
      setCreateUserOpen(false);
      setUserEmail('');
      setUserRole('ADMIN');
      setUserPassword('');
      setCreatedResult({ tempPassword: data.tempPassword, email: data.user.email as string });
      toast.success('Usuário criado com sucesso');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Erro ao criar usuário'),
  });

  const updateOrgStatusMutation = useMutation({
    mutationFn: (data: { orgId: string; status: 'ACTIVE' | 'SUSPENDED' }) =>
      api.admin.updateOrgStatus(data.orgId, data.status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-organizations'] });
      toast.success('Status da organização atualizado');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Erro ao atualizar status'),
  });

  const handleCopy = (text: string) => {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Redirect non-super-admins
  if (user?.role !== 'SUPER_ADMIN') {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="text-center">
          <Shield className="mx-auto mb-3 h-10 w-10 text-foreground-muted" />
          <p className="text-foreground-secondary">Acesso restrito a super administradores.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="font-clinical text-2xl font-bold">Administração</h1>
          <p className="text-sm text-foreground-secondary">
            Gerencie organizações, clínicas e usuários da plataforma
          </p>
        </div>
        <Button onClick={() => setCreateOrgOpen(true)}>
          <Plus className="h-4 w-4" />
          Nova Organização
        </Button>
      </motion.div>

      {/* Stats overview */}
      {orgsQuery.data && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="glass-card">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-primary/10 p-2.5">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{orgsQuery.data.organizations.length}</p>
                <p className="text-xs text-foreground-secondary">Organizações</p>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-success/10 p-2.5">
                <CheckCircle2 className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {orgsQuery.data.organizations.filter((o) => o.status === 'ACTIVE').length}
                </p>
                <p className="text-xs text-foreground-secondary">Ativas</p>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-accent/10 p-2.5">
                <Users className="h-5 w-5 text-accent" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {orgsQuery.data.organizations.reduce((sum, o) => sum + o.userCount, 0)}
                </p>
                <p className="text-xs text-foreground-secondary">Usuários totais</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Organizations table */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4 text-primary" />
            Organizações
          </CardTitle>
        </CardHeader>
        <CardContent>
          {orgsQuery.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : orgsQuery.data?.organizations.length === 0 ? (
            <p className="py-8 text-center text-sm text-foreground-muted">
              Nenhuma organização cadastrada.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Usuários</TableHead>
                  <TableHead className="text-center">Pacientes</TableHead>
                  <TableHead className="text-center">Sessões</TableHead>
                  <TableHead>Criado em</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orgsQuery.data?.organizations.map((org: AdminOrganization) => (
                  <TableRow key={org.id}>
                    <TableCell className="font-medium">{org.name}</TableCell>
                    <TableCell className="font-mono text-xs text-foreground-secondary">{org.slug}</TableCell>
                    <TableCell>
                      <Badge variant={org.status === 'ACTIVE' ? 'default' : 'warning'}>
                        {org.status === 'ACTIVE' ? 'Ativa' : 'Suspensa'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">{org.userCount}</TableCell>
                    <TableCell className="text-center">{org.patientCount}</TableCell>
                    <TableCell className="text-center">{org.sessionCount}</TableCell>
                    <TableCell className="text-xs text-foreground-secondary">
                      {format(new Date(org.createdAt), 'dd/MM/yyyy', { locale: ptBR })}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedOrgId(org.id);
                            setSelectedOrgName(org.name);
                          }}
                        >
                          <Users className="h-3.5 w-3.5" />
                          Usuários
                        </Button>
                        {org.status === 'ACTIVE' ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => updateOrgStatusMutation.mutate({ orgId: org.id, status: 'SUSPENDED' })}
                          >
                            <Ban className="h-3.5 w-3.5" />
                            Suspender
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => updateOrgStatusMutation.mutate({ orgId: org.id, status: 'ACTIVE' })}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Ativar
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Users for selected org */}
      {selectedOrgId && (
        <Card className="glass-card">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4 text-primary" />
                Usuários — {selectedOrgName}
              </CardTitle>
              <Button size="sm" onClick={() => setCreateUserOpen(true)}>
                <UserPlus className="h-3.5 w-3.5" />
                Novo Usuário
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {orgUsersQuery.isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : orgUsersQuery.data?.users.length === 0 ? (
              <p className="py-6 text-center text-sm text-foreground-muted">
                Nenhum usuário nesta organização.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Senha</TableHead>
                    <TableHead>Último login</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orgUsersQuery.data?.users.map((u: AdminUser) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.email}</TableCell>
                      <TableCell>
                        <Badge variant={u.role === 'OWNER' ? 'default' : u.role === 'ADMIN' ? 'accent' : 'secondary'}>
                          {u.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={u.status === 'ACTIVE' ? 'default' : 'warning'}>
                          {u.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {u.mustChangePassword ? (
                          <Badge variant="warning">Temporária</Badge>
                        ) : (
                          <Badge variant="secondary">Definitiva</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-foreground-secondary">
                        {u.lastLoginAt
                          ? format(new Date(u.lastLoginAt), 'dd/MM/yyyy HH:mm', { locale: ptBR })
                          : 'Nunca'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Create Organization Dialog */}
      <Dialog open={createOrgOpen} onOpenChange={setCreateOrgOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              Nova Organização
            </DialogTitle>
            <DialogDescription>
              Crie uma nova clínica/organização e seu usuário administrador.
              Uma senha temporária será gerada se não for informada.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="org-name">Nome da organização</Label>
              <Input
                id="org-name"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="Ex: Clínica Psicologia Sul"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="org-slug">Slug (opcional)</Label>
              <Input
                id="org-slug"
                value={orgSlug}
                onChange={(e) => setOrgSlug(e.target.value)}
                placeholder="Ex: clinica-psicologia-sul"
              />
              <p className="text-xs text-foreground-muted">
                Será gerado automaticamente a partir do nome se não informado.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admin-email">Email do administrador</Label>
              <Input
                id="admin-email"
                type="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="admin@clinica.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admin-password">Senha temporária (opcional)</Label>
              <Input
                id="admin-password"
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="Gerada automaticamente se vazio"
              />
              <p className="text-xs text-foreground-muted">
                O usuário será obrigado a trocar a senha no primeiro login.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCreateOrgOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => createOrgMutation.mutate({
                name: orgName,
                ...(orgSlug ? { slug: orgSlug } : {}),
                adminEmail,
                ...(adminPassword ? { adminPassword } : {}),
              })}
              disabled={!orgName || !adminEmail || createOrgMutation.isPending}
            >
              {createOrgMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Criar organização
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create User Dialog */}
      <Dialog open={createUserOpen} onOpenChange={setCreateUserOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" />
              Novo Usuário — {selectedOrgName}
            </DialogTitle>
            <DialogDescription>
              Adicione um usuário à organização. Uma senha temporária será gerada se não for informada.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="user-email">Email</Label>
              <Input
                id="user-email"
                type="email"
                value={userEmail}
                onChange={(e) => setUserEmail(e.target.value)}
                placeholder="usuario@clinica.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="user-role">Role</Label>
              <Select value={userRole} onValueChange={(v) => setUserRole(v as 'OWNER' | 'ADMIN' | 'PROFESSIONAL')}>
                <SelectTrigger id="user-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OWNER">Owner (acesso total)</SelectItem>
                  <SelectItem value="ADMIN">Admin (gerencia clínínica)</SelectItem>
                  <SelectItem value="PROFESSIONAL">Professional (atende pacientes)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="user-password">Senha temporária (opcional)</Label>
              <Input
                id="user-password"
                type="password"
                value={userPassword}
                onChange={(e) => setUserPassword(e.target.value)}
                placeholder="Gerada automaticamente se vazio"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCreateUserOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => createUserMutation.mutate({
                orgId: selectedOrgId!,
                email: userEmail,
                role: userRole,
                ...(userPassword ? { password: userPassword } : {}),
              })}
              disabled={!userEmail || !selectedOrgId || createUserMutation.isPending}
            >
              {createUserMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
              Criar usuário
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Temp Password Result Dialog */}
      <Dialog open={!!createdResult} onOpenChange={() => setCreatedResult(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-success" />
              Credenciais Criadas
            </DialogTitle>
            <DialogDescription>
              Compartilhe estas credenciais com o usuário. A senha deverá ser trocada no primeiro login.
            </DialogDescription>
          </DialogHeader>
          {createdResult && (
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <Label className="text-xs text-foreground-muted">Email</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-md bg-surface-elevated px-3 py-2 text-sm">
                    {createdResult.email}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopy(createdResult.email)}
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-foreground-muted">Senha temporária</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-md bg-surface-elevated px-3 py-2 text-sm font-mono">
                    {showTempPassword ? createdResult.tempPassword : '••••••••••••'}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowTempPassword(!showTempPassword)}
                  >
                    {showTempPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopy(createdResult.tempPassword)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
          <div className="flex justify-end">
            <Button onClick={() => setCreatedResult(null)}>
              Concluir
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
