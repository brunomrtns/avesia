import { Settings } from 'lucide-react';

import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSessionStore } from '@/stores/session-store';

function VolumeMeter({ volume, color }: { volume: number; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] text-foreground-muted">
        <span>Nível de captação:</span>
        <span>{volume}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full ${color} transition-all duration-75`}
          style={{ width: `${volume}%` }}
        />
      </div>
    </div>
  );
}

export function AudioConfigPanel() {
  const {
    isDualMicMode,
    setIsDualMicMode,
    devices,
    therapistDeviceId,
    patientDeviceId,
    setTherapistDeviceId,
    setPatientDeviceId,
    therapistVolume,
    patientVolume,
    isRecording,
    isPaused,
  } = useSessionStore();

  const showMeters = isRecording && !isPaused;

  return (
    <div className="space-y-4 rounded-lg border border-border bg-surface p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Settings className="h-4 w-4 text-primary" />
            Configurações do Modo Multi-Microfone
          </h3>
          <p className="text-xs text-foreground-secondary">
            Configure canais separados para o profissional e para o paciente para obter 100% de precisão na classificação de falas.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="dual-mic" className="text-xs font-medium text-foreground-muted">
            Ativar Modo Multi-Microfone:
          </Label>
          <Checkbox
            id="dual-mic"
            checked={isDualMicMode}
            onCheckedChange={(v) => setIsDualMicMode(v === true)}
          />
        </div>
      </div>

      {isDualMicMode && (
        <div className="grid grid-cols-1 gap-6 border-t border-border pt-4 md:grid-cols-2">
          {/* Therapist Mic */}
          <div className="space-y-2">
            <Label className="block text-xs font-semibold text-foreground-secondary">
              🎙️ Microfone do Profissional
            </Label>
            <Select value={therapistDeviceId} onValueChange={setTherapistDeviceId}>
              <SelectTrigger className="text-xs">
                <SelectValue placeholder="Selecione o microfone" />
              </SelectTrigger>
              <SelectContent>
                {devices.length === 0 ? (
                  <SelectItem value="none">Nenhum dispositivo encontrado</SelectItem>
                ) : (
                  devices.map((d) => (
                    <SelectItem key={d.deviceId} value={d.deviceId}>
                      {d.label || `Microfone ${d.deviceId.slice(0, 5)}...`}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {showMeters && <VolumeMeter volume={therapistVolume} color="bg-success" />}
          </div>

          {/* Patient Mic */}
          <div className="space-y-2">
            <Label className="block text-xs font-semibold text-foreground-secondary">
              🎙️ Microfone do Paciente
            </Label>
            <Select value={patientDeviceId} onValueChange={setPatientDeviceId}>
              <SelectTrigger className="text-xs">
                <SelectValue placeholder="Selecione o microfone" />
              </SelectTrigger>
              <SelectContent>
                {devices.length === 0 ? (
                  <SelectItem value="none">Nenhum dispositivo encontrado</SelectItem>
                ) : (
                  devices.map((d) => (
                    <SelectItem key={d.deviceId} value={d.deviceId}>
                      {d.label || `Microfone ${d.deviceId.slice(0, 5)}...`}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {showMeters && <VolumeMeter volume={patientVolume} color="bg-primary" />}
          </div>
        </div>
      )}
    </div>
  );
}
