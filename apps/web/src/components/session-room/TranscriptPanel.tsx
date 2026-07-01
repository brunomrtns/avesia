import { AnimatePresence, motion } from 'motion/react';
import { Mic, Shield, Sparkles, Volume2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface Segment {
  id: string;
  text: string;
  speaker: string;
  startTime: number;
}

interface TranscriptPanelProps {
  segments: Segment[];
  isRecording: boolean;
  isPaused: boolean;
  seconds: number;
  speechSupported: boolean;
  sessionStatus: string;
  onSimulateSpeech: () => void;
  onDiarize: () => void;
  isSimulating: boolean;
  isDiarizing: boolean;
}

function formatTime(totalSecs: number) {
  const hrs = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;
  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function SpeakerBubble({ segment, index }: { segment: Segment; index: number }) {
  const isTherapist = segment.speaker === 'THERAPIST';
  const isPatient = segment.speaker === 'PATIENT';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.02, 0.1), ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        'flex max-w-[85%] flex-col rounded-2xl border p-4 shadow-sm',
        isTherapist && 'mr-auto rounded-tl-none border-accent/20 bg-accent/5',
        isPatient && 'ml-auto rounded-tr-none border-primary/20 bg-primary/5',
        !isTherapist && !isPatient && 'mx-auto rounded-t-none border-border bg-surface-elevated',
      )}
    >
      <div className="mb-1 flex items-center justify-between gap-6 text-xs font-semibold">
        <span
          className={cn(
            isTherapist && 'text-accent',
            isPatient && 'text-primary',
            !isTherapist && !isPatient && 'text-foreground-muted',
          )}
        >
          {isTherapist ? 'Psicólogo' : isPatient ? 'Paciente' : 'Voz Indefinida'}
        </span>
        <span className="text-[10px] text-foreground-muted">
          {Math.floor(segment.startTime / 60)}m {Math.floor(segment.startTime % 60)}s
        </span>
      </div>
      <p className="text-sm leading-relaxed text-foreground">{segment.text}</p>
    </motion.div>
  );
}

export function TranscriptPanel({
  segments,
  isRecording,
  isPaused,
  seconds,
  speechSupported,
  sessionStatus,
  onSimulateSpeech,
  onDiarize,
  isSimulating,
  isDiarizing,
}: TranscriptPanelProps) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-sm min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-surface-elevated/50 px-5 py-3.5">
        <div className="flex items-center gap-2">
          <Volume2 className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Transcrição em Tempo Real</h2>
        </div>

        <div className="flex items-center gap-3">
          {/* Live timer */}
          {isRecording && (
            <div
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold',
                isPaused
                  ? 'border-warning/30 bg-warning/10 text-warning'
                  : 'border-success/30 bg-success/10 text-success',
              )}
            >
              <span
                className={cn(
                  'h-2 w-2 rounded-full',
                  isPaused ? 'bg-warning' : 'animate-ping bg-success',
                )}
              />
              {formatTime(seconds)}
            </div>
          )}

          {/* Simulate speech */}
          {sessionStatus !== 'COMPLETED' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onSimulateSpeech}
              disabled={isSimulating}
              className="h-7 gap-1 text-xs text-primary hover:bg-primary/10"
            >
              <Sparkles className="h-3 w-3" />
              Simular Fala
            </Button>
          )}

          {/* Diarize */}
          {segments.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={onDiarize}
              disabled={isDiarizing}
              className="h-7 gap-1 text-xs"
            >
              <Shield className="h-3 w-3 text-accent" />
              Diarizar
            </Button>
          )}
        </div>
      </div>

      {/* Transcript content */}
      <ScrollArea className="flex-1">
        <div className="space-y-4 p-5">
          {!speechSupported && (
            <div className="rounded-lg border border-warning/30 bg-warning/10 p-3.5 text-xs leading-relaxed text-warning">
              <strong>Nota:</strong> Este navegador não suporta reconhecimento de voz nativo.
              Use <strong>"Simular Fala"</strong> para testar a IA.
            </div>
          )}

          {segments.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center p-8 text-center">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                <Mic className="h-7 w-7 text-foreground-muted" />
              </div>
              <h3 className="font-semibold text-foreground-secondary">Nenhuma fala registrada</h3>
              <p className="mt-1 max-w-sm text-xs text-foreground-muted">
                {sessionStatus === 'SCHEDULED'
                  ? 'Inicie a sessão e fale no microfone para transcrever.'
                  : 'Clique em "Simular Fala" ou comece a falar no microfone.'}
              </p>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {segments.map((seg, idx) => (
                <SpeakerBubble key={seg.id} segment={seg} index={idx} />
              ))}
            </AnimatePresence>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
