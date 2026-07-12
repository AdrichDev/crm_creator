'use client';
// Panel reutilizable de claves/secretos por-tenant (crm-onboarding-tenant-keys).
// Mismo componente para el onboarding (`businessId={editing.id}`) y para la Configuración de
// crm-tenant-keys-self-service (`businessId` de sesión) — misma llamada
// `apiFetch` a `/tenant-keys/:businessId/secrets`. Estructura calcada de
// `front/components/config/integraciones-panel.tsx`.
import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import { useDialog } from '@/components/ui/dialog-provider';
import { Card, CardBody, Badge, Button } from '@/components/ui/primitives';
import { Eye, EyeOff } from 'lucide-react';
import {
  listSecrets,
  upsertSecret,
  deleteSecret,
  testSecret,
  KNOWN_PRESET_NAMES,
  type TenantSecretName,
  type TenantSecretSlot,
} from '@/lib/api/tenant-keys';

type SlotGroup = 'ai' | 'maps' | 'database';
type SlotKind = 'ai' | 'maps' | 'database' | 'supabase';

const CATALOG: Array<{ name: TenantSecretName; label: string; group: SlotGroup; kind: SlotKind }> = [
  { name: 'OPENAI_API_KEY', label: 'OpenAI', group: 'ai', kind: 'ai' },
  { name: 'GEMINI_API_KEY', label: 'Gemini', group: 'ai', kind: 'ai' },
  { name: 'ANTHROPIC_API_KEY', label: 'Anthropic', group: 'ai', kind: 'ai' },
  { name: 'GOOGLE_MAPS_API_KEY', label: 'Google Maps', group: 'maps', kind: 'maps' },
  { name: 'DATABASE_URL', label: 'URL (BD)', group: 'database', kind: 'database' },
  { name: 'NEXT_PUBLIC_SUPABASE_URL', label: 'Supabase URL', group: 'database', kind: 'supabase' },
  { name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', label: 'Supabase anon key', group: 'database', kind: 'supabase' },
];

// crm-tenant-keys-freeform: mismo regex que back/src/lib/tenant-secrets/catalog.ts
// (ENV_KEY_NAME_PATTERN) — duplicado a propósito para no importar código de back en el bundle.
const ENV_KEY_NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/;

// crm-onboarding-db-keys-export-connect T5: placeholder de ejemplo por kind. Supabase tiene
// dos slots (URL / anon key) con formatos muy distintos, así que se distingue por el nombre.
function placeholderFor(kind: SlotKind, name: string): string {
  if (kind === 'database') return 'postgresql://usuario:password@host:puerto/basedatos';
  if (kind === 'supabase') {
    if (name.includes('URL')) return 'https://xxxx.supabase.co';
    if (name.includes('ANON')) return 'eyJhbGciOi...';
  }
  return 'Pegar valor…';
}

// Máscara de longitud FIJA para un slot ya configurado: el back nunca devuelve el
// valor ni su longitud, así que estos puntos NO reflejan la clave real — solo indican
// "hay un secreto guardado, oculto". No filtra nada del secreto.
const SAVED_MASK = '•'.repeat(20);

type CardStatus = 'idle' | 'saving' | 'testing' | 'deleting';
type TestOutcome = { tone: 'ok' | 'error'; texto: string } | null;

export interface TenantKeysPanelProps {
  businessId: string;
  groups?: SlotGroup[];
  // Las "Otras variables" (freeform, sin group) se muestran igual en cualquier
  // instancia sin importar `groups`. Cuando se montan varios paneles en la misma
  // pantalla (p.ej. onboarding paso "BD, API y Keys"), poner `showExtras={false}`
  // en todos salvo uno evita que la sección aparezca duplicada. Default: true.
  showExtras?: boolean;
}

export function TenantKeysPanel({ businessId, groups, showExtras = true }: TenantKeysPanelProps) {
  const dialog = useDialog();
  const [slots, setSlots] = useState<TenantSecretSlot[]>([]);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  // Mostrar/ocultar el valor tecleado por slot (inseguro a propósito: uso personal del admin).
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState<Record<string, CardStatus>>({});
  const [testResult, setTestResult] = useState<Record<string, TestOutcome>>({});
  const [loading, setLoading] = useState(true);
  const [draftKey, setDraftKey] = useState('');
  const [draftValue, setDraftValue] = useState('');
  const [draftStatus, setDraftStatus] = useState<'idle' | 'saving'>('idle');
  const [draftError, setDraftError] = useState<string | null>(null);

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
  // crm-tenant-keys-freeform: filas fuera de los 5 presets — no tienen `group`, así que se
  // muestran siempre en "Otras variables" sin importar el filtro `groups` de esta instancia.
  const extraSecrets = slots.filter((s) => !(KNOWN_PRESET_NAMES as readonly string[]).includes(s.name));
  const draftKeyTrimmed = draftKey.trim();
  const draftKeyValid = ENV_KEY_NAME_PATTERN.test(draftKeyTrimmed);

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
      // Se BORRA la clave del estado (undefined, no ''): tras recargar, el slot pasa a
      // `configured` y el campo vuelve a mostrar la máscara de puntos, no un input vacío.
      setInputs((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
      await load();
    } catch {
      setTestResult((prev) => ({ ...prev, [name]: { tone: 'error', texto: 'No se pudo guardar. Inténtalo de nuevo.' } }));
    } finally {
      setCardStatus(name, 'idle');
    }
  }

  async function probar(name: TenantSecretName, kind: SlotKind) {
    if (kind === 'maps') {
      // crm-onboarding-db-keys-export-connect (fix code-review): Maps es una clave NEXT_PUBLIC
      // de navegador — se restringe correctamente por HTTP-referrer, así que el back NO puede
      // validarla server-side (geocodificar sin referer devuelve REQUEST_DENIED aunque la clave
      // sea válida, marcando en rojo una clave correcta). "Probar" aquí solo confirma que el
      // slot está `configured` y sin edición pendiente sin guardar — `slots` viene de
      // listSecrets(businessId) (T1: businessId del PATH, correcto). Sin red, sin /test.
      const slot = slots.find((s) => s.name === name);
      const ok = Boolean(slot?.configured) && inputs[name] === undefined;
      setTestResult((prev) => ({
        ...prev,
        [name]: ok
          ? { tone: 'ok', texto: 'Clave guardada; se aplicará en el front y en el export.' }
          : { tone: 'error', texto: 'Guarda la clave primero.' },
      }));
      setCardStatus(name, 'idle');
      return;
    }
    setCardStatus(name, 'testing');
    setTestResult((prev) => ({ ...prev, [name]: null }));
    try {
      const pending = inputs[name]?.trim();
      const result = await testSecret(businessId, name, pending || undefined);
      setTestResult((prev) => ({
        ...prev,
        [name]: result.ok
          ? { tone: 'ok', texto: 'Conexión correcta.' }
          : { tone: 'error', texto: result.detail ?? 'No se pudo conectar.' },
      }));
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

  async function agregarLibre() {
    const key = draftKeyTrimmed;
    const value = draftValue.trim();
    if (!draftKeyValid || !value) return;
    setDraftStatus('saving');
    setDraftError(null);
    try {
      await upsertSecret(businessId, key, value);
      setDraftKey('');
      setDraftValue('');
      await load();
    } catch (e) {
      const texto =
        e instanceof ApiError && e.code === 'reserved_name'
          ? 'Ese nombre está reservado por el export.'
          : e instanceof ApiError && e.code === 'invalid_name'
            ? 'Nombre inválido: usa MAYÚSCULAS_CON_GUION_BAJO empezando por letra.'
            : 'No se pudo guardar.';
      setDraftError(texto);
    } finally {
      setDraftStatus('idle');
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
                {configured && inputs[name] === undefined ? (
                  // Slot ya configurado y sin tocar: campo lleno de puntos de longitud
                  // FIJA (no la real). Al hacer foco/clic se limpia para escribir uno nuevo.
                  <input
                    readOnly
                    type="text"
                    aria-label={`${label} (guardado, oculto)`}
                    value={SAVED_MASK}
                    onFocus={() => setInputs((prev) => ({ ...prev, [name]: '' }))}
                    onMouseDown={(e) => { e.preventDefault(); setInputs((prev) => ({ ...prev, [name]: '' })); }}
                    className="min-w-[220px] flex-1 cursor-text rounded-[8px] border border-white/10 bg-black/20 px-3 py-2 text-sm tracking-widest text-white/60"
                  />
                ) : (
                  <div className="relative min-w-[220px] flex-1">
                    <input
                      type={reveal[name] ? 'text' : 'password'}
                      aria-label={`Valor de ${label}`}
                      placeholder={placeholderFor(kind, name)}
                      value={inputs[name] ?? ''}
                      onChange={(e) => setInputs((prev) => ({ ...prev, [name]: e.target.value }))}
                      className="w-full rounded-[8px] border border-white/10 bg-black/20 px-3 py-2 pr-9 text-sm text-white"
                      autoComplete="new-password"
                      autoFocus={configured}
                    />
                    <button
                      type="button"
                      onClick={() => setReveal((p) => ({ ...p, [name]: !p[name] }))}
                      aria-label={reveal[name] ? 'Ocultar valor' : 'Mostrar valor'}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-white/50 hover:text-white"
                    >
                      {reveal[name] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                )}
                <Button onClick={() => void guardar(name)} disabled={st !== 'idle' || !(inputs[name]?.trim())}>
                  {st === 'saving'
                    ? 'Guardando…'
                    : configured && !inputs[name]?.trim()
                      ? 'Guardado'
                      : 'Guardar'}
                </Button>
                <Button variant="outline" onClick={() => void probar(name, kind)} disabled={st !== 'idle' || (!configured && !(inputs[name]?.trim()))}>
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

      {showExtras && (
      <div className="space-y-3 pt-2">
        <p className="text-sm font-medium text-white/80">Otras variables</p>
        <p className="text-xs text-white/50">
          Añade cualquier variable que tu app exportada necesite. Los nombres que empiezan por{' '}
          <code>NEXT_PUBLIC_</code> se hornean en el export del front; el resto quedan solo en el backend.
        </p>

        {extraSecrets.map((slot) => {
          const name = slot.name;
          const st = status[name] ?? 'idle';
          const outcome = testResult[name] ?? null;
          const editing = inputs[name] !== undefined;
          return (
            <Card key={name}>
              <CardBody className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <p className="font-medium text-white">{name}</p>
                    <Badge tone={slot.scope === 'FRONTEND_PUBLIC' ? 'blue' : 'gray'}>
                      {slot.scope === 'FRONTEND_PUBLIC' ? 'Pública' : 'Secreta'}
                    </Badge>
                    <Badge tone={slot.configured ? 'green' : 'gray'}>
                      {slot.configured ? 'configurado' : 'no configurado'}
                    </Badge>
                  </div>
                  <Button variant="outline" onClick={() => void quitar(name, name)} disabled={st !== 'idle'}>
                    {st === 'deleting' ? 'Quitando…' : 'Quitar'}
                  </Button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {slot.configured && !editing ? (
                    <input
                      readOnly
                      type="text"
                      aria-label={`${name} (guardado, oculto)`}
                      value={SAVED_MASK}
                      onFocus={() => setInputs((prev) => ({ ...prev, [name]: '' }))}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setInputs((prev) => ({ ...prev, [name]: '' }));
                      }}
                      className="min-w-[220px] flex-1 cursor-text rounded-[8px] border border-white/10 bg-black/20 px-3 py-2 text-sm tracking-widest text-white/60"
                    />
                  ) : (
                    <input
                      type="password"
                      aria-label={`Valor de ${name}`}
                      placeholder="Pegar valor…"
                      value={inputs[name] ?? ''}
                      onChange={(e) => setInputs((prev) => ({ ...prev, [name]: e.target.value }))}
                      className="min-w-[220px] flex-1 rounded-[8px] border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
                      autoComplete="new-password"
                    />
                  )}
                  <Button onClick={() => void guardar(name)} disabled={st !== 'idle' || !(inputs[name] ?? '').trim()}>
                    {st === 'saving' ? 'Guardando…' : 'Guardar'}
                  </Button>
                </div>

                {outcome && (
                  <p className={outcome.tone === 'ok' ? 'text-sm text-emerald-400' : 'text-sm text-red-400'}>
                    {outcome.texto}
                  </p>
                )}
              </CardBody>
            </Card>
          );
        })}

        <Card>
          <CardBody className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                aria-label="Nombre de la nueva variable"
                placeholder="NEXT_PUBLIC_SUPABASE_URL"
                value={draftKey}
                onChange={(e) => setDraftKey(e.target.value)}
                className="min-w-[220px] flex-1 rounded-[8px] border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
              />
              <input
                type="password"
                aria-label="Valor de la nueva variable"
                placeholder="Pegar valor…"
                value={draftValue}
                onChange={(e) => setDraftValue(e.target.value)}
                className="min-w-[220px] flex-1 rounded-[8px] border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
                autoComplete="new-password"
              />
              <Button
                onClick={() => void agregarLibre()}
                disabled={draftStatus !== 'idle' || !draftKeyValid || !draftValue.trim()}
              >
                {draftStatus === 'saving' ? 'Agregando…' : 'Agregar'}
              </Button>
            </div>
            {draftKeyTrimmed && (
              <p className="text-xs text-white/50">
                {draftKeyTrimmed.startsWith('NEXT_PUBLIC_')
                  ? 'Pública — va al bundle del export'
                  : 'Secreta — solo backend'}
              </p>
            )}
            {draftError && <p className="text-sm text-red-400">{draftError}</p>}
          </CardBody>
        </Card>
      </div>
      )}
    </div>
  );
}
