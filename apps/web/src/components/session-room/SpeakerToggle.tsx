import { cn } from '@/lib/utils';
import { useSessionStore } from '@/stores/session-store';

export function SpeakerToggle() {
  const activeSpeaker = useSessionStore((s) => s.activeSpeaker);
  const setActiveSpeaker = useSessionStore((s) => s.setActiveSpeaker);

  const options = [
    { value: 'AUTO' as const, label: 'Auto', activeClass: 'bg-primary text-primary-foreground' },
    { value: 'THERAPIST' as const, label: 'Terapeuta', activeClass: 'bg-accent text-accent-foreground' },
    { value: 'PATIENT' as const, label: 'Paciente', activeClass: 'bg-primary text-primary-foreground' },
  ];

  return (
    <div className="flex items-center rounded-lg border border-border bg-surface p-1 shadow-sm h-10">
      <span className="px-2 text-xs font-medium text-foreground-muted">Gravar como:</span>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => setActiveSpeaker(opt.value)}
          className={cn(
            'rounded-md px-2.5 py-1 text-xs font-semibold transition-all duration-200',
            activeSpeaker === opt.value
              ? opt.activeClass
              : 'text-foreground-muted hover:bg-surface-elevated hover:text-foreground',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
