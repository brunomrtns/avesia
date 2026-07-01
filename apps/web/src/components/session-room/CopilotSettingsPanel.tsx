// ============================================================================
//  Web — CopilotSettingsPanel (Neural Calm redesign)
//
//  Refined settings panel with:
//  - Custom toggle switches with neural glow
//  - Intensity selector with descriptions
//  - Frequency selector with visual feedback
//  - Consistent with the design system identity
// ============================================================================

import { useState, useCallback } from 'react';
import { api, type CopilotSettings } from '@/lib/api-client';
import { cn } from '@/lib/utils';

interface CopilotSettingsPanelProps {
  sessionId: string;
  settings: CopilotSettings;
  onSettingsChange: (settings: CopilotSettings) => void;
}

const INTENSITY_OPTIONS: Array<{
  value: CopilotSettings['intensity'];
  label: string;
  description: string;
}> = [
  { value: 'low', label: 'Baixa', description: 'Conservador — apenas o mais relevante' },
  { value: 'medium', label: 'Média', description: 'Equilíbrio entre proatividade e concisão' },
  { value: 'high', label: 'Alta', description: 'Proativo e detalhado' },
];

const FREQUENCY_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 15_000, label: '15s' },
  { value: 30_000, label: '30s' },
  { value: 60_000, label: '60s' },
  { value: 120_000, label: '2min' },
];

// ── Neural Toggle ──────────────────────────────────────────────────────────
// Custom switch with glow effect when active — matches the AI identity.
function NeuralToggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}): React.JSX.Element {
  return (
    <button
      onClick={onChange}
      className={cn(
        'relative h-5 w-9 rounded-full transition-all duration-300 ease-out-expo',
        checked
          ? 'bg-primary shadow-[0_0_12px_-2px_hsl(var(--primary-glow)/0.5)]'
          : 'bg-muted border border-border',
      )}
      aria-label={label}
    >
      <span
        className={cn(
          'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-300 ease-out-expo',
          checked ? 'translate-x-4' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

export function CopilotSettingsPanel({
  sessionId,
  settings,
  onSettingsChange,
}: CopilotSettingsPanelProps): React.JSX.Element {
  const [saving, setSaving] = useState(false);

  const update = useCallback(
    async (partial: Partial<CopilotSettings>) => {
      const newSettings = { ...settings, ...partial };
      onSettingsChange(newSettings);
      setSaving(true);
      try {
        const saved = await api.sessions.updateCopilotSettings(sessionId, partial);
        onSettingsChange(saved);
      } catch {
        // Revert on error — keep the local state for UX.
      } finally {
        setSaving(false);
      }
    },
    [sessionId, settings, onSettingsChange],
  );

  return (
    <div className="space-y-4 bg-surface-elevated/30 p-4">
      {/* Enable / Disable */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1">
          <h4 className="text-xs font-semibold text-foreground">Co-piloto em tempo real</h4>
          <p className="mt-0.5 text-[11px] text-foreground-muted">
            Assistência clínica contínua durante a sessão
          </p>
        </div>
        <NeuralToggle
          checked={settings.enabled}
          onChange={() => update({ enabled: !settings.enabled })}
          label={settings.enabled ? 'Desativar co-piloto' : 'Ativar co-piloto'}
        />
      </div>

      {settings.enabled && (
        <>
          <div className="neural-divider" />

          {/* Auto-generate */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1">
              <h4 className="text-xs font-semibold text-foreground">Geração automática</h4>
              <p className="mt-0.5 text-[11px] text-foreground-muted">
                Processa conforme a conversa evolui
              </p>
            </div>
            <NeuralToggle
              checked={settings.autoGenerate}
              onChange={() => update({ autoGenerate: !settings.autoGenerate })}
              label={settings.autoGenerate ? 'Desativar geração automática' : 'Ativar geração automática'}
            />
          </div>

          {/* Intensity */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-foreground">Intensidade</h4>
            <div className="grid grid-cols-3 gap-1.5">
              {INTENSITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => update({ intensity: opt.value })}
                  className={cn(
                    'rounded-md border px-2 py-1.5 text-center transition-all duration-200',
                    settings.intensity === opt.value
                      ? 'border-primary/40 bg-primary/10 text-primary shadow-[0_0_16px_-8px_hsl(var(--primary-glow)/0.4)]'
                      : 'border-border text-foreground-secondary hover:border-border-hover hover:bg-surface-elevated',
                  )}
                  title={opt.description}
                >
                  <span className="text-xs font-medium">{opt.label}</span>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-foreground-muted">
              {INTENSITY_OPTIONS.find((o) => o.value === settings.intensity)?.description}
            </p>
          </div>

          {/* Max frequency */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-foreground">Frequência máxima</h4>
            <div className="flex gap-1.5">
              {FREQUENCY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => update({ maxFrequencyMs: opt.value })}
                  className={cn(
                    'flex-1 rounded-md border py-1.5 text-center text-xs font-medium transition-all duration-200',
                    settings.maxFrequencyMs === opt.value
                      ? 'border-primary/40 bg-primary/10 text-primary'
                      : 'border-border text-foreground-secondary hover:border-border-hover hover:bg-surface-elevated',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-foreground-muted">
              Intervalo mínimo entre ciclos de processamento
            </p>
          </div>
        </>
      )}

      {saving && (
        <div className="flex items-center gap-1.5 text-[11px] text-foreground-muted">
          <div className="h-1.5 w-1.5 rounded-full bg-primary animate-ai-pulse" />
          Salvando...
        </div>
      )}
    </div>
  );
}
