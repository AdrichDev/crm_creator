'use client';
// Panel reutilizable de claves/secretos por-tenant (crm-onboarding-tenant-keys).
// Mismo componente para el onboarding (`businessId={editing.id}`) y para la Configuración de
// crm-tenant-keys-self-service (`businessId` de sesión) — misma llamada
// `apiFetch` a `/tenant-keys/:businessId/secrets`. Estructura calcada de
// `front/components/config/integraciones-panel.tsx`.
import { useCallback, useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api/client';
import { useDialog } from '@/components/ui/dialog-provider';
import { Card, CardBody, Badge, Button } from '@/components/ui/primitives';
import {
  listSecrets,
  upsertSecret,
  deleteSecret,
  testSecret,
  type TenantSecretName,
  type TenantSecretSlot,
} from '@/lib/api/tenant-keys';

type SlotGroup = 'ai' | 'maps' | 'database';

const CATALOG: Array<{ name: TenantSecretName; label: string; group: SlotGroup; kind: 'ai' | 'maps' | 'database' }> = [
  { name: 'OPENAI_API_KEY', label: 'OpenAI', group: 'ai', kind: 'ai' },
  { name: 'GEMINI_API_KEY', label: 'Gemini', group: 'ai', kind: 'ai' },
  { name: 'ANTHROPIC_API_KEY', label: 'Anthropic', group: 'ai', kind: 'ai' },
  { name: 'GOOGLE_MAPS_API_KEY', label: 'Google Maps', group: 'maps', kind: 'maps' },
  { name: 'DATABASE_URL', label: 'URL (BD)', group: 'database', kind: 'database' },
];

type CardStatus = 'idle' | 'saving' | 'testing' | 'deleting';
type TestOutcome = { tone: 'ok' | 'error'; texto: string } | null;

export interface TenantKeysPanelProps {
  businessId: string;
  groups?: SlotGroup[];
}

export function TenantKeysPanel({ businessId, groups }: TenantKeysPanelProps) {
  const dialog = useDialog();
  const [slots, setSlots] = useState<TenantSecretSlot[]>([]);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Record<string, CardStatus>>({});
  const [testResult, setTestResult] = useState<Record<string, TestOutcome>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await listSecrets(businessId);
      setSlots(r.secrets ?? []);
    } catch {
      setSlots([]);
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => { void load(); }, [load]);

  const visible = groups ? CATALOG.filter((c) => groups.includes(c.group)) : CATALOG;

  function setCardStatus(name: string, s: CardStatus) {
    setStatus((prev) => ({ ...prev, [name]: s }));
  }

  async function guardar(name: TenantSecretName) {
    const value = inputs[name]?.trim();
    if (!value) return;
    setCardStatus(name, 'saving');
    setTestResult((prev) => ({ ...prev, [name]: null }));
    try {
      await upsertSecret(businessId, name, value);
      setInputs((prev) => ({ ...prev, [name]: '' }));
      await load();
    } catch {
      setTestResult((prev) => ({ ...prev, [name]: { tone: 'error', texto: 'No se pudo guardar. Inténtalo de nuevo.' } }));
    } finally {
      setCardStatus(name, 'idle');
    }
  }

  async function probar(name: TenantSecretName, kind: 'ai' | 'maps' | 'database') {
    setCardStatus(name, 'testing');
    setTestResult((prev) => ({ ...prev, [name]: null }));
    try {
      if (kind === 'maps') {
        // Maps es FRONTEND_PUBLIC: se verifica propagación runtime vía /tenant-config,
        // NO .../test — ver design.md §6/§8.
        const config = await apiFetch<{ publicEnvSecrets?: Record<string, string> }>('/tenant-config');
        const propagated = config.publicEnvSecrets?.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
        const ok = Boolean(propagated);
        setTestResult((prev) => ({
          ...prev,
          [name]: ok
            ? { tone: 'ok', texto: 'Clave activa en el runtime del front.' }
            : { tone: 'error', texto: 'La clave aún no se refleja en el front. Guarda primero.' },
        }));
      } else {
        const pending = inputs[name]?.trim();
        const result = await testSecret(businessId, name, pending || undefined);
        setTestResult((prev) => ({
          ...prev,
          [name]: result.ok
            ? { tone: 'ok', texto: 'Conexión correcta.' }
            : { tone: 'error', texto: result.detail ?? 'No se pudo conectar.' },
        }));
      }
    } catch (e) {
      const texto = e instanceof ApiError && e.code === 'no_value' ? 'Pega un valor o guarda uno antes de probar.' : 'No se pudo probar la conexión.';
      setTestResult((prev) => ({ ...prev, [name]: { tone: 'error', texto } }));
    } finally {
      setCardStatus(name, 'idle');
    }
  }

  async function quitar(name: TenantSecretName, label: string) {
    const ok = await dialog.confirm({
      message: `¿Quitar la clave de ${label}? Las funciones que dependen de ella dejarán de operar hasta que la vuelvas a configurar.`,
      danger: true,
    });
    if (!ok) return;
    setCardStatus(name, 'deleting');
    try {
      await deleteSecret(businessId, name);
      await load();
    } catch {
      setTestResult((prev) => ({ ...prev, [name]: { tone: 'error', texto: 'No se pudo quitar. Inténtalo de nuevo.' } }));
    } finally {
      setCardStatus(name, 'idle');
    }
  }

  return (
    <div className="space-y-4">
      {visible.map(({ name, label, kind }) => {
        const slot = slots.find((s) => s.name === name);
        const configured = slot?.configured ?? false;
        const st = status[name] ?? 'idle';
        const outcome = testResult[name] ?? null;
        const tone = st === 'testing' ? 'amber' : configured ? 'green' : 'gray';
        const badgeText = st === 'testing' ? 'probando…' : configured ? 'configurado' : 'no configurado';

        return (
          <Card key={name}>
            <CardBody className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <p className="font-medium text-white">{label}</p>
                  <Badge tone={tone}>{loading ? 'Cargando…' : badgeText}</Badge>
                </div>
                {configured && (
                  <Button
                    variant="outline"
                    onClick={() => void quitar(name, label)}
                    disabled={st !== 'idle'}
                  >
                    {st === 'deleting' ? 'Quitando…' : 'Quitar'}
                  </Button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="password"
                  aria-label={`Valor de ${label}`}
                  placeholder={configured ? 'Sustituir valor guardado…' : 'Pegar valor…'}
                  value={inputs[name] ?? ''}
                  onChange={(e) => setInputs((prev) => ({ ...prev, [name]: e.target.value }))}
                  className="min-w-[220px] flex-1 rounded-[8px] border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
                  autoComplete="new-password"
                />
                <Button onClick={() => void guardar(name)} disabled={st !== 'idle' || !(inputs[name]?.trim())}>
                  {st === 'saving' ? 'Guardando…' : 'Guardar'}
                </Button>
                <Button variant="outline" onClick={() => void probar(name, kind)} disabled={st !== 'idle' || (kind !== 'maps' && !configured && !(inputs[name]?.trim()))}>
                  {st === 'testing' ? 'Probando…' : 'Probar conexión'}
                </Button>
              </div>

              {outcome && (
                <p role="status" className={outcome.tone === 'ok' ? 'text-sm text-emerald-400' : 'text-sm text-red-400'}>
                  {outcome.texto}
                </p>
              )}
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}
