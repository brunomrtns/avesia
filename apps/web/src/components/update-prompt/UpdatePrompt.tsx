import { useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { motion } from 'motion/react';
import { RefreshCw, Sparkles, X } from 'lucide-react';

import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { NeuralIndicator } from '@/components/ui/neural-indicator';
import { BRAND } from '@/components/branding/BrandLogo';

/**
 * Detects when a new service worker version is available and prompts
 * the user to refresh. Uses vite-plugin-pwa's useRegisterSW hook.
 *
 * The SW is configured with `registerType: 'autoUpdate'`, so the new
 * version is downloaded in the background. When it's ready, this
 * component shows a modal asking the user to reload.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, _registration) {
      // SW registered — updates are checked automatically by the browser
      // via the update cycle. No manual polling needed.
    },
    onRegisterError(error) {
      console.error('SW registration failed:', error);
    },
  });

  const [updating, setUpdating] = useState(false);

  const handleUpdate = async () => {
    setUpdating(true);
    await updateServiceWorker(true);
  };

  const handleDismiss = () => {
    setNeedRefresh(false);
  };

  return (
    <Dialog open={needRefresh} onOpenChange={(open) => { if (!open) handleDismiss(); }}>
      <DialogContent
        showCloseButton={false}
        className="max-w-sm gap-0 overflow-hidden p-0"
      >
        {/* Top accent bar */}
        <div className="h-1 bg-gradient-to-r from-primary via-accent to-primary" />

        <div className="p-6">
          {/* Icon + close */}
          <div className="mb-4 flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <NeuralIndicator state="active" size="sm" />
            </div>
            <button
              onClick={handleDismiss}
              className="rounded-md p-1.5 text-foreground-muted transition-colors hover:bg-surface-elevated hover:text-foreground"
              aria-label="Dispensar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Content */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <h2 className="text-base font-semibold text-foreground">
              Atualização disponível
            </h2>
            <p className="mt-1.5 text-sm text-foreground-secondary">
              Uma nova versão do {BRAND.name} está pronta. Atualize para
              acessar as melhorias mais recentes e correções.
            </p>
          </motion.div>

          {/* Actions */}
          <div className="mt-5 flex gap-2">
            <Button
              variant="gradient"
              className="flex-1"
              onClick={handleUpdate}
              disabled={updating}
            >
              {updating ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Atualizando...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Atualizar agora
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={handleDismiss}
              disabled={updating}
            >
              Mais tarde
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
