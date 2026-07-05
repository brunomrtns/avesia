import { useEffect, useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, ClipboardList, ChartLine, Sparkles } from 'lucide-react';

import { api } from '@/lib/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AudioConfigPanel } from '@/components/session-room/AudioConfigPanel';
import { BriefingDialog } from '@/components/session-room/BriefingDialog';
import { InsightsPanel } from '@/components/session-room/InsightsPanel';
import { PostSessionAnalysisDialog } from '@/components/session-room/PostSessionAnalysisDialog';
import { RecordingControls } from '@/components/session-room/RecordingControls';
import { ResizableSplit } from '@/components/session-room/ResizableSplit';
import { SOAPNoteDialog } from '@/components/session-room/SOAPNoteDialog';
import { TokenUsagePanel } from '@/components/session-room/TokenUsagePanel';
import { TranscriptPanel } from '@/components/session-room/TranscriptPanel';
import { useSessionStore } from '@/stores/session-store';
import type { ClinicalSession } from '@avesia/types';

const STATUS_LABELS: Record<string, { label: string; variant: 'warning' | 'success' | 'outline' }> = {
  IN_PROGRESS: { label: 'Em Progresso', variant: 'warning' },
  COMPLETED: { label: 'Finalizada', variant: 'success' },
  SCHEDULED: { label: 'Agendada', variant: 'outline' },
};

export function SessionRoomPage(): React.ReactNode {
  const { id, orgSlug } = useParams<{ id: string; orgSlug: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const store = useSessionStore();

  // Dialog state
  const [briefingOpen, setBriefingOpen] = useState(false);
  const [soapOpen, setSoapOpen] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);

  // Refs for audio context
  const audioContextRef = useRef<AudioContext | null>(null);
  const therapistStreamRef = useRef<MediaStream | null>(null);
  const patientStreamRef = useRef<MediaStream | null>(null);
  const therapistAnimationRef = useRef<number | null>(null);
  const patientAnimationRef = useRef<number | null>(null);
  const recognitionRef = useRef<any>(null);

  // Refs for speech recognition callback
  const activeSpeakerRef = useRef(store.activeSpeaker);
  const isDualMicModeRef = useRef(store.isDualMicMode);
  const therapistVolumeRef = useRef(0);
  const patientVolumeRef = useRef(0);
  const isRecordingRef = useRef(store.isRecording);
  const isPausedRef = useRef(store.isPaused);

  useEffect(() => {
    activeSpeakerRef.current = store.activeSpeaker;
  }, [store.activeSpeaker]);
  useEffect(() => {
    isDualMicModeRef.current = store.isDualMicMode;
  }, [store.isDualMicMode]);
  useEffect(() => {
    therapistVolumeRef.current = store.therapistVolume;
  }, [store.therapistVolume]);
  useEffect(() => {
    patientVolumeRef.current = store.patientVolume;
  }, [store.patientVolume]);
  useEffect(() => {
    isRecordingRef.current = store.isRecording;
  }, [store.isRecording]);
  useEffect(() => {
    isPausedRef.current = store.isPaused;
  }, [store.isPaused]);

  // Load session
  const sessionQuery = useQuery({
    queryKey: ['session', id],
    queryFn: () => api.sessions.get(id!),
    enabled: !!id,
    refetchInterval: store.isRecording && !store.isPaused ? 5000 : false,
  });

  const session = sessionQuery.data as (ClinicalSession & {
    patient?: { fullName?: string };
    professional?: { fullName?: string };
    transcripts?: Array<{ segments: Array<{ id: string; text: string; speaker: string; startTime: number }> }>;
  }) | undefined;
  const segments = session?.transcripts?.[0]?.segments ?? [];

  // Mutations
  const updateStatusMutation = useMutation({
    mutationFn: (status: 'IN_PROGRESS' | 'COMPLETED') =>
      api.sessions.update(id!, { status }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['session', id] }),
  });

  const addSegmentMutation = useMutation({
    mutationFn: (data: { text: string; speaker: string }) =>
      api.sessions.addSegment(id!, data),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['session', id] }),
  });

  const transcribeChunkMutation = useMutation({
    mutationFn: () => api.sessions.transcribeChunk(id!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['session', id] });
      toast.success('Simulação de fala inserida');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Falha ao simular fala'),
  });

  const diarizeMutation = useMutation({
    mutationFn: () => api.sessions.diarize(id!),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['session', id] });
      void queryClient.invalidateQueries({ queryKey: ['session-tokens', id] });
      const tokenInfo = data.tokensUsed ? ` • ${data.tokensUsed} tokens` : '';
      toast.success(`Diarização concluída. ${data.updatedCount} falas corrigidas${tokenInfo}.`);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Falha na diarização'),
  });

  const getInsightsMutation = useMutation({
    mutationFn: () => api.sessions.getInsights(id!),
    onMutate: () => store.setIsGeneratingInsights(true),
    onSuccess: (data) => {
      store.setInsightsContent(data.content);
      store.setInsightsSources(data.sources ?? []);
      store.setInsightsCommunity(data.community ?? null);
      store.setIsGeneratingInsights(false);
      void queryClient.invalidateQueries({ queryKey: ['session-tokens', id] });
      toast.success('Parecer atualizado');
    },
    onError: (err) => {
      store.setIsGeneratingInsights(false);
      toast.error(err instanceof Error ? err.message : 'Falha ao gerar insights');
    },
  });

  // Reset store when leaving the session room (prevents stale state from a previous session)
  useEffect(() => {
    return () => {
      // Only reset recording state — keep copilot settings (loaded per session)
      store.setIsRecording(false);
      store.setIsPaused(false);
      store.setSeconds(0);
      store.clearCopilotItems();
      store.setCopilotError(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load audio devices on mount (without requesting mic permission)
  useEffect(() => {
    async function loadDevices() {
      try {
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = allDevices.filter((d) => d.kind === 'audioinput');
        store.setDevices(audioInputs);
        const first = audioInputs[0];
        const second = audioInputs[1];
        if (first) {
          store.setTherapistDeviceId(first.deviceId);
          store.setPatientDeviceId(second?.deviceId ?? first.deviceId);
        }
      } catch (e) {
        console.error('Error loading audio devices:', e);
      }
    }
    void loadDevices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Timer
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (store.isRecording && !store.isPaused) {
      interval = setInterval(() => store.setSeconds((s: number) => s + 1), 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.isRecording, store.isPaused]);

  // Cleanup audio context
  const cleanupAudioContext = () => {
    if (therapistAnimationRef.current) {
      cancelAnimationFrame(therapistAnimationRef.current);
      therapistAnimationRef.current = null;
    }
    if (patientAnimationRef.current) {
      cancelAnimationFrame(patientAnimationRef.current);
      patientAnimationRef.current = null;
    }
    if (therapistStreamRef.current) {
      therapistStreamRef.current.getTracks().forEach((t) => t.stop());
      therapistStreamRef.current = null;
    }
    if (patientStreamRef.current) {
      patientStreamRef.current.getTracks().forEach((t) => t.stop());
      patientStreamRef.current = null;
    }
    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }
  };

  // Audio volume monitoring
  useEffect(() => {
    if (!store.isRecording || store.isPaused || !store.isDualMicMode) {
      cleanupAudioContext();
      store.setTherapistVolume(0);
      store.setPatientVolume(0);
      return;
    }

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    audioContextRef.current = ctx;

    const monitorMic = (
      deviceId: string,
      streamRef: React.RefObject<MediaStream | null>,
      animRef: React.RefObject<number | null>,
      setVolume: (v: number) => void,
    ) => {
      navigator.mediaDevices
        .getUserMedia({ audio: { deviceId: { exact: deviceId } } })
        .then((stream) => {
          streamRef.current = stream;
          if (ctx.state === 'closed') return;
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          source.connect(analyser);
          const bufferLength = analyser.frequencyBinCount;
          const dataArray = new Uint8Array(bufferLength);
          const updateVolume = () => {
            if (ctx.state === 'closed') return;
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < bufferLength; i++) {
              const val = dataArray[i];
              if (val !== undefined) sum += val;
            }
            setVolume(Math.min(100, Math.round((sum / bufferLength / 128) * 100)));
            animRef.current = requestAnimationFrame(updateVolume);
          };
          updateVolume();
        })
        .catch((err) => console.error('Error accessing mic stream:', err));
    };

    if (store.therapistDeviceId)
      monitorMic(store.therapistDeviceId, therapistStreamRef, therapistAnimationRef, store.setTherapistVolume);
    if (store.patientDeviceId)
      monitorMic(store.patientDeviceId, patientStreamRef, patientAnimationRef, store.setPatientVolume);

    return cleanupAudioContext;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.isRecording, store.isPaused, store.isDualMicMode, store.therapistDeviceId, store.patientDeviceId]);

  // Speech recognition
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      store.setSpeechSupported(false);
      return;
    }

    if (!store.isRecording || store.isPaused) {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
      }
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'pt-BR';

    recognition.onresult = (event: any) => {
      const result = event.results[event.results.length - 1];
      if (result.isFinal) {
        const text = result[0].transcript.trim();
        if (text) {
          let speaker = activeSpeakerRef.current === 'AUTO' ? 'UNKNOWN' : activeSpeakerRef.current;
          if (isDualMicModeRef.current && activeSpeakerRef.current === 'AUTO') {
            speaker = therapistVolumeRef.current >= patientVolumeRef.current ? 'THERAPIST' : 'PATIENT';
          }
          addSegmentMutation.mutate({ text, speaker });
        }
      }
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      if (event.error === 'not-allowed') {
        toast.error('Acesso ao microfone foi negado.');
        store.setIsRecording(false);
      }
    };

    recognition.onend = () => {
      // Use refs to avoid stale closure — prevents infinite restart loop
      if (isRecordingRef.current && !isPausedRef.current) {
        try { recognition.start(); } catch (e) { console.warn('Speech restart error:', e); }
      }
    };

    recognitionRef.current = recognition;
    try { recognition.start(); } catch (e) { console.error('Speech start error:', e); }

    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
      }
      recognitionRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.isRecording, store.isPaused]);

  // Handlers
  const handleStart = async () => {
    // Request microphone permission with user gesture
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      toast.error('Acesso ao microfone é necessário para a gravação. Permita o acesso e tente novamente.');
      return;
    }
    const isResuming = session?.status === 'IN_PROGRESS';
    updateStatusMutation.mutate('IN_PROGRESS');
    store.setIsRecording(true);
    store.setIsPaused(false);
    if (!isResuming) store.setSeconds(0);
    toast.success(isResuming ? 'Atendimento retomado! Escutando microfone...' : 'Sessão iniciada! Escutando microfone...');
  };

  const handlePauseToggle = () => {
    const next = !store.isPaused;
    store.setIsPaused(next);
    toast.info(next ? 'Gravação pausada.' : 'Gravação retomada.');
  };

  const handleEnd = () => {
    store.setIsRecording(false);
    updateStatusMutation.mutate('COMPLETED');
    toast.success('Sessão encerrada com sucesso!');
    navigate(`/${orgSlug}/sessions`);
  };

  if (sessionQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full" />
        <div className="flex gap-6">
          <Skeleton className="h-[500px] flex-1" />
          <Skeleton className="h-[500px] w-[380px]" />
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center text-center">
        <h2 className="text-xl font-bold text-destructive">Sessão não encontrada</h2>
        <Link to={`/${orgSlug}/sessions`} className="mt-4 text-primary hover:underline">
          Voltar para sessões
        </Link>
      </div>
    );
  }

  const statusInfo = STATUS_LABELS[session.status] ?? { label: session.status, variant: 'outline' as const };

  return (
    <div className="flex h-[calc(100vh-80px)] flex-col gap-4 overflow-hidden">
      {/* Header */}
      <div className="flex flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link
            to={`/${orgSlug}/sessions`}
            className="rounded-lg p-2 text-foreground-secondary transition-colors hover:bg-surface-elevated hover:text-foreground"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-foreground">
              Sessão de Atendimento
              <Badge variant={statusInfo.variant} className={store.isRecording && !store.isPaused ? 'animate-pulse' : ''}>
                {statusInfo.label}
              </Badge>
            </h1>
            <p className="text-sm text-foreground-secondary">
              Paciente: <strong className="text-foreground">{session.patient?.fullName}</strong> • Médico:{' '}
              {session.professional?.fullName}
            </p>
          </div>
        </div>

        <RecordingControls
          sessionStatus={session.status}
          onStart={handleStart}
          onPauseToggle={handlePauseToggle}
          onEnd={handleEnd}
        />

        {/* AI action buttons — visible when there's a transcript or session is scheduled */}
        <div className="flex items-center gap-2">
          <TokenUsagePanel sessionId={session.id} />
          {session.status === 'SCHEDULED' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBriefingOpen(true)}
            >
              <Sparkles className="h-4 w-4 text-primary" />
              Briefing
            </Button>
          )}
          {segments.length > 0 && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSoapOpen(true)}
              >
                <ClipboardList className="h-4 w-4 text-primary" />
                Nota SOAP
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAnalysisOpen(true)}
              >
                <ChartLine className="h-4 w-4 text-primary" />
                Análise
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Audio config */}
      {store.isConfigOpen && <AudioConfigPanel />}

      {/* Main workspace — resizable 50/50 split */}
      <ResizableSplit
        left={
          <TranscriptPanel
            segments={segments}
            isRecording={store.isRecording}
            isPaused={store.isPaused}
            seconds={store.seconds}
            speechSupported={store.speechSupported}
            sessionStatus={session.status}
            onSimulateSpeech={() => transcribeChunkMutation.mutate()}
            onDiarize={() => diarizeMutation.mutate()}
            isSimulating={transcribeChunkMutation.isPending}
            isDiarizing={diarizeMutation.isPending}
          />
        }
        right={
          <InsightsPanel
            sessionId={session.id}
            hasSegments={segments.length > 0}
            onGenerate={() => getInsightsMutation.mutate()}
          />
        }
      />

      {/* AI dialogs */}
      <BriefingDialog
        sessionId={session.id}
        patientName={session.patient?.fullName ?? 'Paciente'}
        open={briefingOpen}
        onOpenChange={setBriefingOpen}
      />
      <SOAPNoteDialog
        sessionId={session.id}
        patientName={session.patient?.fullName ?? 'Paciente'}
        open={soapOpen}
        onOpenChange={setSoapOpen}
      />
      <PostSessionAnalysisDialog
        sessionId={session.id}
        patientName={session.patient?.fullName ?? 'Paciente'}
        open={analysisOpen}
        onOpenChange={setAnalysisOpen}
      />
    </div>
  );
}
