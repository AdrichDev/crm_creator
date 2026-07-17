'use client';
// Panel reutilizable de claves/secretos por-tenant (crm-onboarding-tenant-keys).
// Mismo componente para el onboarding (`businessId={editing.id}`) y para la Configuración de
// crm-tenant-keys-self-service (`businessId` de sesión) — misma llamada
// `apiFetch` a `/tenant-keys/:businessId/secrets`. Estructura calcada de
// `front/components/config/integraciones-panel.tsx`.
import { useCallback, useEffect, useState } from 'react';
import { ApiError, apiFetch } from '@/lib/api/client';
import { useDialog } from '@/components/ui/dialog-provider';
import { Card, CardBody, Badge, Button } from '@/components/ui/primitives';
import { Eye, EyeOff } from 'lucide-react';
import {
  listSecrets,
  upsertSecret,
  deleteSecret,
  testSecret,
  revealSecret,
  KNOWN_PRESET_NAMES,
  type TenantSecretName,
  type TenantSecretSlot,
} from '@/lib/api/tenant-keys';

type SlotGroup = 'ai' | 'maps' | 'database' | 'google' | 'mail';
type SlotKind = 'ai' | 'maps' | 'database' | 'supabase' | 'google' | 'mail';

const CATALOG: Array<{ name: TenantSecretName; label: string; group: SlotGroup; kind: SlotKind }> = [
  { name: 'OPENAI_API_KEY', label: 'OpenAI', group: 'ai', kind: 'ai' },
  { name: 'GEMINI_API_KEY', label: 'Gemini', group: 'ai', kind: 'ai' },
  { name: 'ANTHROPIC_API_KEY', label: 'Anthropic', group: 'ai', kind: 'ai' },
  { name: 'GOOGLE_MAPS_API_KEY', label: 'Google Maps', group: 'maps', kind: 'maps' },
  { name: 'DATABASE_URL', label: 'URL (BD)', group: 'database', kind: 'database' },
  { name: 'NEXT_PUBLIC_SUPABASE_URL', label: 'Supabase URL', group: 'database', kind: 'supabase' },
  { name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', label: 'Supabase anon key', group: 'database', kind: 'supabase' },
  // crm-tenant-oauth-creds: proyecto Google Cloud propio del tenant. Opt-in (grupo
  // 'google', excluido de la vista "todo" por defecto): solo se pinta cuando el caller
  // pide explícitamente `groups={['google', ...]}`.
  { name: 'GOOGLE_OAUTH_CLIENT_ID', label: 'Google OAuth Client ID', group: 'google', kind: 'google' },
  { name: 'GOOGLE_OAUTH_CLIENT_SECRET', label: 'Google OAuth Client Secret', group: 'google', kind: 'google' },
  // crm-tenant-oauth-creds-and-mail-connector (Fase 2): conector IMAP/SMTP genérico para
  // buzones fuera de Google/Microsoft. Opt-in (grupo 'mail'), mismo patrón que 'google'.
  { name: 'MAIL_ADDRESS', label: 'Dirección de correo', group: 'mail', kind: 'mail' },
  { name: 'MAIL_APP_PASSWORD', label: 'Contraseña de aplicación', group: 'mail', kind: 'mail' },
  { name: 'IMAP_HOST', label: 'Servidor IMAP', group: 'mail', kind: 'mail' },
  { name: 'IMAP_PORT', label: 'Puerto IMAP', group: 'mail', kind: 'mail' },
  { name: 'SMTP_HOST', label: 'Servidor SMTP', group: 'mail', kind: 'mail' },
  { name: 'SMTP_PORT', label: 'Puerto SMTP', group: 'mail', kind: 'mail' },
];

// crm-tenant-oauth-creds-and-mail-connector (Fase 2): proveedores de correo comunes
// FUERA de Google/Microsoft (esos usan el botón OAuth, no IMAP/SMTP) — autocompleta
// host/puerto a partir del dominio de `MAIL_ADDRESS`. cPanel no tiene un host fijo:
// se usa la convención habitual `mail.<dominio>` como fallback genérico.
interface MailProviderPreset {
  label: string;
  domains: string[];
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
}

export const COMMON_MAIL_PROVIDERS: MailProviderPreset[] = [
  { label: 'Hostinger', domains: ['hostinger.com'], imapHost: 'imap.hostinger.com', imapPort: 993, smtpHost: 'smtp.hostinger.com', smtpPort: 465 },
  { label: 'Zoho Mail', domains: ['zoho.com', 'zohomail.com', 'zoho.eu'], imapHost: 'imap.zoho.com', imapPort: 993, smtpHost: 'smtp.zoho.com', smtpPort: 465 },
  { label: 'IONOS', domains: ['ionos.com', 'ionos.es', '1and1.com'], imapHost: 'imap.ionos.com', imapPort: 993, smtpHost: 'smtp.ionos.com', smtpPort: 465 },
  { label: 'GoDaddy', domains: ['secureserver.net', 'godaddy.com'], imapHost: 'imap.secureserver.net', imapPort: 993, smtpHost: 'smtpout.secureserver.net', smtpPort: 465 },
];

// Dominios de Google/Microsoft: estos SIEMPRE deben usar el botón OAuth (Gmail/Outlook),
// nunca el conector IMAP/SMTP — devolver `null` para no autocompletar ni sugerirlos aquí.
const OAUTH_ONLY_DOMAINS = new Set(['gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com']);

export interface MailHostSuggestion {
  providerLabel: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
}

/**
 * Sugiere host/puerto de IMAP/SMTP a partir del dominio de un email. `null` si el
 * email es inválido o pertenece a un dominio de Google/Microsoft (esos van por OAuth).
 * Con dominio propio no reconocido, cae al patrón habitual de cPanel `mail.<dominio>`.
 */
export function suggestMailHosts(email: string): MailHostSuggestion | null {
  const at = email.lastIndexOf('@');
  if (at < 0 || at === email.length - 1) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  if (!domain || !domain.includes('.')) return null;
  if (OAUTH_ONLY_DOMAINS.has(domain)) return null;

  const known = COMMON_MAIL_PROVIDERS.find((p) => p.domains.includes(domain));
  if (known) {
    return { providerLabel: known.label, imapHost: known.imapHost, imapPort: known.imapPort, smtpHost: known.smtpHost, smtpPort: known.smtpPort };
  }
  return {
    providerLabel: 'cPanel / genérico',
    imapHost: `mail.${domain}`,
    imapPort: 993,
    smtpHost: `mail.${domain}`,
    smtpPort: 465,
  };
}

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
  if (kind === 'google') {
    if (name.includes('SECRET')) return 'GOCSPX-...';
    return '1234567890-xxxx.apps.googleusercontent.com';
  }
  if (kind === 'mail') {
    if (name === 'MAIL_ADDRESS') return 'nombre@tudominio.com';
    if (name === 'MAIL_APP_PASSWORD') return 'Contraseña de aplicación';
    if (name === 'IMAP_HOST') return 'imap.tudominio.com (vacío = autodetectar por dominio)';
    if (name === 'IMAP_PORT') return '993 (por defecto)';
    if (name === 'SMTP_HOST') return 'smtp.tudominio.com (vacío = autodetectar por dominio)';
    if (name === 'SMTP_PORT') return '465 (por defecto)';
  }
  return 'Pegar valor…';
}

// crm-tenant-oauth-creds-and-mail-connector (Fase 2): los 6 slots del conector, en el
// orden en que se prueban/autocompletan.
const MAIL_SLOT_NAMES = ['MAIL_ADDRESS', 'MAIL_APP_PASSWORD', 'IMAP_HOST', 'IMAP_PORT', 'SMTP_HOST', 'SMTP_PORT'] as const;

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
  // Valor descifrado de un slot YA guardado, cargado bajo demanda al pulsar "ver".
  const [revealedValue, setRevealedValue] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Record<string, CardStatus>>({});
  const [testResult, setTestResult] = useState<Record<string, TestOutcome>>({});
  const [loading, setLoading] = useState(true);
  const [draftKey, setDraftKey] = useState('');
  const [draftValue, setDraftValue] = useState('');
  const [draftStatus, setDraftStatus] = useState<'idle' | 'saving'>('idle');
  const [draftError, setDraftError] = useState<string | null>(null);
  // crm-tenant-oauth-creds: estado del botón "Conectar Google Calendar" (grupo google).
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setRevealedValue({}); // al recargar, se ocultan de nuevo los valores revelados
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

  // Los grupos 'google' y 'mail' son opt-in: se excluyen de la vista "todo" (sin
  // `groups`) para no sumar tarjetas a las instancias que no los piden — solo aparecen
  // con `groups` explícito.
  const visible = groups
    ? CATALOG.filter((c) => groups.includes(c.group))
    : CATALOG.filter((c) => c.group !== 'google' && c.group !== 'mail');
  const showGoogleConnect = visible.some((c) => c.group === 'google');
  const showMailGroup = visible.some((c) => c.group === 'mail');
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

  // Ver/ocultar el valor de un secreto YA guardado (carga descifrada bajo demanda).
  async function toggleRevealSaved(name: TenantSecretName) {
    if (revealedValue[name] != null) {
      setRevealedValue((p) => { const c = { ...p }; delete c[name]; return c; });
      return;
    }
    try {
      const value = await revealSecret(businessId, name);
      setRevealedValue((p) => ({ ...p, [name]: value }));
    } catch {
      setTestResult((prev) => ({ ...prev, [name]: { tone: 'error', texto: 'No se pudo mostrar la clave.' } }));
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

  // crm-tenant-oauth-creds-and-mail-connector (Fase 2): el conector necesita los 6
  // campos juntos (dirección+contraseña+hosts/puertos), pero el endpoint de test solo
  // admite UN `value` por slot — se serializan los 6 en JSON y se prueban contra el
  // slot ancla 'MAIL_ADDRESS' (provider 'mail' en el catálogo). Los campos no editados
  // pero ya guardados se resuelven vía `revealSecret` (nunca se re-piden al usuario).
  // Estado reusado de `status`/`testResult` bajo la clave 'MAIL_ADDRESS'.
  async function probarCorreo() {
    setCardStatus('MAIL_ADDRESS', 'testing');
    setTestResult((prev) => ({ ...prev, MAIL_ADDRESS: null }));
    try {
      const fields: Record<string, string> = {};
      for (const name of MAIL_SLOT_NAMES) {
        const pending = inputs[name]?.trim();
        if (pending) {
          fields[name] = pending;
          continue;
        }
        const slot = slots.find((s) => s.name === name);
        if (slot?.configured) {
          fields[name] = await revealSecret(businessId, name);
        }
      }
      const cfg = {
        address: fields.MAIL_ADDRESS ?? '',
        appPassword: fields.MAIL_APP_PASSWORD ?? '',
        imapHost: fields.IMAP_HOST || undefined,
        imapPort: fields.IMAP_PORT ? Number(fields.IMAP_PORT) : undefined,
        smtpHost: fields.SMTP_HOST || undefined,
        smtpPort: fields.SMTP_PORT ? Number(fields.SMTP_PORT) : undefined,
      };
      const result = await testSecret(businessId, 'MAIL_ADDRESS', JSON.stringify(cfg));
      setTestResult((prev) => ({
        ...prev,
        MAIL_ADDRESS: result.ok
          ? { tone: 'ok', texto: 'Conexión correcta (IMAP y SMTP).' }
          : { tone: 'error', texto: result.detail ?? 'No se pudo conectar.' },
      }));
    } catch {
      setTestResult((prev) => ({ ...prev, MAIL_ADDRESS: { tone: 'error', texto: 'No se pudo probar la conexión.' } }));
    } finally {
      setCardStatus('MAIL_ADDRESS', 'idle');
    }
  }

  // crm-tenant-oauth-creds-and-mail-connector (Fase 2): al escribir la dirección de
  // correo, autocompleta host/puerto de IMAP/SMTP por dominio (solo si esos campos aún
  // no tienen valor propio ni guardado) — nunca pisa un valor ya configurado.
  function onMailAddressBlur(value: string) {
    const suggestion = suggestMailHosts(value.trim());
    if (!suggestion) return;
    setInputs((prev) => {
      const next = { ...prev };
      const setIfEmpty = (name: string, val: string) => {
        const slot = slots.find((s) => s.name === name);
        if (!slot?.configured && !(prev[name] ?? '').trim()) next[name] = val;
      };
      setIfEmpty('IMAP_HOST', suggestion.imapHost);
      setIfEmpty('IMAP_PORT', String(suggestion.imapPort));
      setIfEmpty('SMTP_HOST', suggestion.smtpHost);
      setIfEmpty('SMTP_PORT', String(suggestion.smtpPort));
      return next;
    });
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

  // Lanza el consentimiento OAuth de Google Calendar reutilizando el flujo ya existente
  // (POST /integrations/calendar/connect). El back resuelve las creds del tenant si las
  // configuró, o cae a la app central del operador (nota UX debajo del botón).
  async function conectarCalendar() {
    setConnecting(true);
    setConnectError(null);
    try {
      const { url } = await apiFetch<{ url: string }>('/integrations/calendar/connect', { method: 'POST' });
      // Consentimiento en la MISMA pestaña: Google redirige al callback del back.
      window.location.href = url;
    } catch (e) {
      const texto =
        e instanceof ApiError && e.code === 'oauth_no_configurado'
          ? 'No hay credenciales OAuth configuradas (ni propias ni centrales). Pega tu client_id/secret o pide al operador que configure la app central.'
          : 'No se pudo iniciar la conexión. Inténtalo de nuevo.';
      setConnectError(texto);
      setConnecting(false);
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
                  <div className="relative min-w-[220px] flex-1">
                    <input
                      readOnly
                      type="text"
                      aria-label={revealedValue[name] != null ? `${label} (guardado)` : `${label} (guardado, oculto)`}
                      value={revealedValue[name] ?? SAVED_MASK}
                      onFocus={() => setInputs((prev) => ({ ...prev, [name]: '' }))}
                      onMouseDown={(e) => { e.preventDefault(); setInputs((prev) => ({ ...prev, [name]: '' })); }}
                      className={`w-full cursor-text rounded-[8px] border border-white/10 bg-black/20 px-3 py-2 pr-9 text-sm ${revealedValue[name] != null ? 'text-white' : 'tracking-widest text-white/60'}`}
                    />
                    {/* El ojo carga y muestra el valor guardado (descifrado en el back). preventDefault
                        para no convertir el campo en editable al pulsarlo. */}
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => void toggleRevealSaved(name)}
                      aria-label={revealedValue[name] != null ? 'Ocultar valor' : 'Mostrar valor'}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-white/50 hover:text-white"
                    >
                      {revealedValue[name] != null ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                ) : (
                  <div className="relative min-w-[220px] flex-1">
                    <input
                      type={reveal[name] ? 'text' : 'password'}
                      aria-label={`Valor de ${label}`}
                      placeholder={placeholderFor(kind, name)}
                      value={inputs[name] ?? ''}
                      onChange={(e) => setInputs((prev) => ({ ...prev, [name]: e.target.value }))}
                      onBlur={(e) => { if (name === 'MAIL_ADDRESS') onMailAddressBlur(e.target.value); }}
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
                {/* crm-tenant-oauth-creds-and-mail-connector (Fase 2): el conector necesita los
                    6 campos juntos — el test se hace desde el botón dedicado más abajo, no
                    por-campo aquí (probar un solo host/puerto suelto no dice nada). */}
                {kind !== 'mail' && (
                  <Button variant="outline" onClick={() => void probar(name, kind)} disabled={st !== 'idle' || (!configured && !(inputs[name]?.trim()))}>
                    {st === 'testing' ? 'Probando…' : 'Probar conexión'}
                  </Button>
                )}
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

      {showMailGroup && (
        <Card>
          <CardBody className="space-y-3">
            <p className="font-medium text-white">Correo (IMAP/SMTP)</p>
            <p className="text-xs text-amber-400">
              Gmail y Outlook/Hotmail → usa el botón OAuth (Google Calendar/Gmail), NO este
              conector IMAP/SMTP.
            </p>
            <p className="text-xs text-white/60">
              Para buzones propios (Hostinger, Zoho, cPanel, IONOS, GoDaddy…): rellena la
              dirección y la contraseña de aplicación; el servidor y puerto de IMAP/SMTP se
              autocompletan por el dominio del correo (editable si tu proveedor usa otros).
            </p>
            <Button
              variant="outline"
              onClick={() => void probarCorreo()}
              disabled={status.MAIL_ADDRESS === 'testing'}
            >
              {status.MAIL_ADDRESS === 'testing' ? 'Probando…' : 'Probar conexión de correo'}
            </Button>
            {testResult.MAIL_ADDRESS && (
              <p role="status" className={testResult.MAIL_ADDRESS.tone === 'ok' ? 'text-sm text-emerald-400' : 'text-sm text-red-400'}>
                {testResult.MAIL_ADDRESS.texto}
              </p>
            )}
          </CardBody>
        </Card>
      )}

      {showGoogleConnect && (
        <Card>
          <CardBody className="space-y-3">
            <p className="font-medium text-white">Google Calendar</p>
            <p className="text-xs text-white/60">
              Deja el Client ID y el Client Secret vacíos para usar la app central de la plataforma.
              Rellénalos solo si quieres conectar con tu propio proyecto de Google Cloud.
            </p>
            <Button onClick={() => void conectarCalendar()} disabled={connecting}>
              {connecting ? 'Conectando…' : 'Conectar Google Calendar'}
            </Button>
            {connectError && <p className="text-sm text-red-400">{connectError}</p>}
          </CardBody>
        </Card>
      )}

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
