import { useCallback, useEffect, useState } from 'react';
import { Loader2, Lock, AlertCircle, CheckCircle2, Eye, EyeOff } from 'lucide-react';

import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface ForcePasswordChangeDialogProps {
  readonly mustChangePassword: boolean;
  readonly onChanged: () => void;
}

const PASSWORD_RULES = {
  MIN_LENGTH: 8,
  MAX_LENGTH: 128,
};

export function ForcePasswordChangeDialog({
  mustChangePassword,
  onChanged,
}: ForcePasswordChangeDialogProps): React.ReactNode {
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setOpen(mustChangePassword && !success);
  }, [mustChangePassword, success]);

  const passwordsMatch = newPassword === confirmPassword;
  const passwordLongEnough = newPassword.length >= PASSWORD_RULES.MIN_LENGTH;
  const canSubmit = currentPassword.length > 0 && passwordLongEnough && passwordsMatch && !loading;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      await api.auth.changePassword({ currentPassword, newPassword });
      setSuccess(true);
      setOpen(false);
      onChanged();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao alterar senha';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [canSubmit, currentPassword, newPassword, onChanged]);

  return (
    <Dialog open={open} onOpenChange={() => { /* prevent close */ }}>
      <DialogContent
        className="max-w-md p-0"
        showCloseButton={false}
      >
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Lock className="h-5 w-5 text-primary" />
            Alteração de Senha Obrigatória
          </DialogTitle>
          <DialogDescription>
            Por segurança, é necessário definir uma nova senha antes de continuar
            utilizando a plataforma.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-6 py-5">
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5">
              <AlertCircle className="h-4 w-4 shrink-0 text-destructive mt-0.5" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground-secondary">
              Senha atual
            </label>
            <div className="relative">
              <Input
                type={showCurrent ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Digite sua senha atual"
                className="pr-10"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-foreground-muted hover:text-foreground"
              >
                {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground-secondary">
              Nova senha
            </label>
            <div className="relative">
              <Input
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mínimo de 8 caracteres"
                className={cn(
                  'pr-10',
                  newPassword.length > 0 && !passwordLongEnough && 'border-warning',
                )}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-foreground-muted hover:text-foreground"
              >
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {newPassword.length > 0 && !passwordLongEnough && (
              <p className="text-xs text-warning">A senha deve ter no mínimo 8 caracteres</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground-secondary">
              Confirmar nova senha
            </label>
            <Input
              type={showNew ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repita a nova senha"
              className={cn(
                confirmPassword.length > 0 && !passwordsMatch && 'border-destructive',
              )}
              autoComplete="new-password"
            />
            {confirmPassword.length > 0 && !passwordsMatch && (
              <p className="text-xs text-destructive">As senhas não coincidem</p>
            )}
            {confirmPassword.length > 0 && passwordsMatch && passwordLongEnough && (
              <p className="flex items-center gap-1 text-xs text-success">
                <CheckCircle2 className="h-3 w-3" />
                Senhas coincidem
              </p>
            )}
          </div>
        </div>

        <div className="border-t border-border px-6 py-4">
          <Button
            className="w-full"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Lock className="h-4 w-4" />
            )}
            Alterar senha e continuar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
