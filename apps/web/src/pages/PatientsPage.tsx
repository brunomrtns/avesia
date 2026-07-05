import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useListQuery } from '@/hooks/use-list-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { ImportPatientsDialog } from '@/components/patients/ImportPatientsDialog';

const patientFormSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(300),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  dateOfBirth: z.string().optional().or(z.literal('')),
});

type PatientFormValues = z.infer<typeof patientFormSchema>;

export function PatientsPage(): React.ReactNode {
  const queryClient = useQueryClient();
  const {
    page, pageSize, prevPage, nextPage, totalPages,
    filters, setFilter, activeFilters,
  } = useListQuery<{ search: string; status: string }>({
    filterKeys: ['search', 'status'],
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const patientsQuery = useQuery({
    queryKey: ['patients', { page, search: filters.search, status: filters.status }],
    queryFn: () => {
      const q: Record<string, string | number> = { page, pageSize };
      if (activeFilters.search) q.search = activeFilters.search;
      if (activeFilters.status) q.status = activeFilters.status;
      return api.patients.list(q as any);
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: PatientFormValues) => {
      const payload: Record<string, string> = { name: data.name };
      if (data.email) payload.email = data.email;
      if (data.phone) payload.phone = data.phone;
      if (data.dateOfBirth) payload.dateOfBirth = data.dateOfBirth;
      return api.patients.create(payload as any);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['patients'] });
      setDialogOpen(false);
      toast.success('Paciente criado com sucesso');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Erro ao criar paciente'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: PatientFormValues }) => {
      const payload: Record<string, string | null> = {};
      if (data.name) payload.name = data.name;
      if (data.email !== undefined) payload.email = data.email || null;
      if (data.phone !== undefined) payload.phone = data.phone || null;
      if (data.dateOfBirth !== undefined) payload.dateOfBirth = data.dateOfBirth || null;
      return api.patients.update(id, payload as any);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['patients'] });
      setDialogOpen(false);
      setEditingId(null);
      toast.success('Paciente atualizado com sucesso');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Erro ao atualizar paciente'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.patients.delete(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['patients'] });
      toast.success('Paciente removido com sucesso');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Erro ao remover paciente'),
  });

  const handleDelete = (id: string, name: string) => {
    if (window.confirm(`Tem certeza que deseja remover o paciente "${name}"?`)) {
      deleteMutation.mutate(id);
    }
  };

  const handleEdit = (patient: Record<string, unknown>) => {
    setEditingId(patient.id as string);
    setDialogOpen(true);
  };

  const items = patientsQuery.data?.items ?? [];
  const total = patientsQuery.data?.total ?? 0;
  const pages = totalPages(total);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Pacientes</h1>
          <p className="text-sm text-foreground-secondary">Gerencie seus pacientes cadastrados</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 gap-3">
          <div className="relative max-w-xs flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted" />
            <Input
              type="text"
              placeholder="Buscar paciente..."
              className="pl-9"
              value={filters.search}
              onChange={(e) => {
                setFilter('search', e.target.value);
              }}
            />
          </div>

          <Select
            value={filters.status || 'all'}
            onValueChange={(v) => {
              setFilter('status', v === 'all' ? '' : v);
            }}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Todos os status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="ACTIVE">Ativo</SelectItem>
              <SelectItem value="ARCHIVED">Arquivado</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setImportOpen(true)}
          >
            <Upload className="h-4 w-4" />
            Importar CSV
          </Button>
          <Button
            onClick={() => {
              setEditingId(null);
              setDialogOpen(true);
            }}
            variant="gradient"
          >
            <Plus className="h-4 w-4" />
            Novo Paciente
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-surface shadow-sm">
        {patientsQuery.isLoading ? (
          <div className="space-y-3 p-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Users className="h-6 w-6 text-foreground-muted" />
            </div>
            <p className="text-sm font-medium text-foreground">Nenhum paciente encontrado</p>
            <p className="text-xs text-foreground-muted">Cadastre seu primeiro paciente para começar.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const p = item as unknown as Record<string, unknown>;
                return (
                  <TableRow key={p.id as string}>
                    <TableCell className="font-medium text-foreground">
                      {(p.fullName as string) ?? (p.name as string) ?? '—'}
                    </TableCell>
                    <TableCell className="text-foreground-secondary">
                      {(p.email as string) ?? '—'}
                    </TableCell>
                    <TableCell className="text-foreground-secondary">
                      {(p.phone as string) ?? '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.status === 'ACTIVE' ? 'success' : 'secondary'}>
                        {p.status === 'ACTIVE' ? 'Ativo' : 'Arquivado'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleEdit(p)}
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() =>
                            handleDelete(p.id as string, (p.fullName as string) ?? (p.name as string) ?? '')
                          }
                          title="Remover"
                          className="hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-border px-6 py-3">
            <p className="text-sm text-foreground-muted">
              {total} paciente{total !== 1 ? 's' : ''} encontrado{total !== 1 ? 's' : ''}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon-sm"
                disabled={page <= 1}
                onClick={prevPage}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-foreground-muted">
                {page} / {pages}
              </span>
              <Button
                variant="outline"
                size="icon-sm"
                disabled={page >= pages}
                onClick={nextPage}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Paciente' : 'Novo Paciente'}</DialogTitle>
          </DialogHeader>
          <PatientForm
            editingId={editingId}
            onSubmit={(data) => {
              if (editingId) {
                updateMutation.mutate({ id: editingId, data });
              } else {
                createMutation.mutate(data);
              }
            }}
            loading={createMutation.isPending || updateMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Import CSV Dialog */}
      <ImportPatientsDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}

interface PatientFormProps {
  editingId: string | null;
  onSubmit: (data: PatientFormValues) => void;
  loading: boolean;
}

function PatientForm({ editingId, onSubmit, loading }: PatientFormProps): React.ReactNode {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PatientFormValues>({
    resolver: zodResolver(patientFormSchema),
    defaultValues: { name: '', email: '', phone: '', dateOfBirth: '' },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="patient-name">Nome completo *</Label>
        <Input
          id="patient-name"
          type="text"
          placeholder="Nome do paciente"
          className={cn(errors.name && 'border-destructive')}
          {...register('name')}
        />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="patient-email">Email</Label>
        <Input id="patient-email" type="email" placeholder="email@exemplo.com" {...register('email')} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="patient-phone">Telefone</Label>
        <Input id="patient-phone" type="tel" placeholder="+55 11 99999-9999" {...register('phone')} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="patient-dob">Data de nascimento</Label>
        <Input id="patient-dob" type="date" {...register('dateOfBirth')} />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button type="submit" disabled={loading} variant="gradient">
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Salvando...
            </>
          ) : editingId ? (
            'Atualizar'
          ) : (
            'Criar Paciente'
          )}
        </Button>
      </div>
    </form>
  );
}
