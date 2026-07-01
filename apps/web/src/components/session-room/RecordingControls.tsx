import { motion } from 'motion/react';
import { Pause, Play, Settings, Square } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useSessionStore } from '@/stores/session-store';
import { SpeakerToggle } from '@/components/session-room/SpeakerToggle';

interface RecordingControlsProps {
  sessionStatus: string;
  onStart: () => void;
  onPauseToggle: () => void;
  onEnd: () => void;
}

export function RecordingControls({
  sessionStatus,
  onStart,
  onPauseToggle,
  onEnd,
}: RecordingControlsProps) {
  const isRecording = useSessionStore((s) => s.isRecording);
  const isPaused = useSessionStore((s) => s.isPaused);
  const isConfigOpen = useSessionStore((s) => s.isConfigOpen);
  const setIsConfigOpen = useSessionStore((s) => s.setIsConfigOpen);

  return (
    <div className="flex flex-wrap items-center gap-3">
      {sessionStatus === 'SCHEDULED' && !isRecording && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2 }}
        >
          <Button
            onClick={onStart}
            variant="gradient"
            className="h-10 gap-2 px-5 shadow-glow"
          >
            <Play className="h-4 w-4" />
            Iniciar Atendimento
          </Button>
        </motion.div>
      )}

      {isRecording && (
        <>
          <SpeakerToggle />

          <Button
            variant="outline"
            onClick={onPauseToggle}
            className="h-10 gap-2 shadow-sm"
          >
            {isPaused ? (
              <>
                <Play className="h-4 w-4 text-success" />
                Retomar
              </>
            ) : (
              <>
                <Pause className="h-4 w-4 text-warning" />
                Pausar
              </>
            )}
          </Button>

          <Button
            onClick={onEnd}
            variant="destructive"
            className="h-10 gap-2 shadow-sm"
          >
            <Square className="h-4 w-4" />
            Encerrar Sessão
          </Button>
        </>
      )}

      {sessionStatus !== 'COMPLETED' && (
        <Button
          variant="outline"
          size="icon"
          onClick={() => setIsConfigOpen(!isConfigOpen)}
          className={cn('h-10 w-10 shadow-sm', isConfigOpen && 'bg-surface-elevated')}
          title="Configurações de Áudio"
          aria-label="Configurações de áudio"
        >
          <Settings className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
