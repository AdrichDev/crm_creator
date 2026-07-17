'use client';
// Panel admin-PLATAFORMA: credenciales de la app Google OAuth CENTRAL
// (crm-central-oauth-admin-config, T4). Superficie de OPERADOR (no de tenant):
// permite meter/probar el client_id, client_secret y redirect_uri de la app Google
// compartida por defecto, guardados cifrados en BD. El valor de una credencial NUNCA
// se recibe de vuelta (solo estado configurado sí/no). Vacío = se usa el env de
// deploy (legacy), sin romper el comportamiento actual.
import { useCallback, useEffect, useState } from 'react';
import { Card, CardBody, Badge, Button } from '@/components/ui/primitives';
import {
  getPlatformOAuthConfig,
  savePlatformOAuthConfig,
  testPlatformOAuthConfig,
  type PlatformOAuthField,
  type PlatformOAuthInput,
  type PlatformOAuthTestResult,
} from '@/lib/api/platform-oauth';

type FieldKey = 'clientId' | 'clientSecret' | 'redirectUri';

const FIELD_META: Array<{ key: FieldKey; label: string; placeholder: string; secret: boolean }> = [
  { key: 'clientId', label: 'Client ID', placeholder: '123-abc.apps.googleusercontent.com', secret: false },
  { key: 'clientSecret', label: 'Client Secret', placeholder: 'GOCSPX-…', secret: true },
  { key: 'redirectUri', label: 'Redirect URI', placeholder: 'https://tu-back/api/integrations/{servicio}/callback', secret: false },
];

export function PlatformOAuthPanel() {
  const [status, setStatus] = useState<PlatformOAuthField[]>([]);
  const [values, setValues] = useState<Record<FieldKey, string>>({ clientId: '', clientSecret: '', redirectUri: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<PlatformOAuthTestResult | null>(null);

  const load = useCallback(async () => {
    try {
      const cfg = await getPlatformOAuthConfig();
      setStatus(cfg.config);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar la configuración');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Solo se envían los campos con valor (vacío = no se toca; se mantiene lo guardado o el env).
  const buildInput = (): PlatformOAuthInput => {
    const input: PlatformOAuthInput = {};
    if (values.clientId.trim()) input.clientId = values.clientId.trim();
    if (values.clientSecret.trim()) input.clientSecret = values.clientSecret.trim();
    if (values.redirectUri.trim()) input.redirectUri = values.redirectUri.trim();
    return input;
  };

  const onSave = useCallback(async () => {
    setBusy(true); setError(null); setMsg(null); setTestResult(null);
    try {
      const cfg = await savePlatformOAuthConfig(buildInput());
      setStatus(cfg.config);
      setValues({ clientId: '', clientSecret: '', redirectUri: '' });
      setMsg('Configuración guardada.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la configuración');
    } finally {
      setBusy(false);
    }
  }, [values]);

  const onTest = useCallback(async () => {
    setBusy(true); setError(null); setMsg(null); setTestResult(null);
    try {
      setTestResult(await testPlatformOAuthConfig(buildInput()));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo probar la configuración');
    } finally {
      setBusy(false);
    }
  }, [values]);

  const configuredOf = (key: FieldKey): boolean => status.find((s) => s.field === key)?.configured ?? false;

  return (
    <Card>
      <CardBody>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-[var(--panel-text)]">Google OAuth (plataforma)</h2>
          <p className="text-sm text-[var(--panel-muted)]">
            Credenciales de la app Google central compartida por defecto. Se guardan cifradas en la base
            de datos. <strong>Vacío = se usa el env de deploy (legacy).</strong>
          </p>
        </div>

        <div className="mt-4 space-y-4">
          {FIELD_META.map((f) => (
            <label key={f.key} className="flex flex-col gap-1 text-sm">
              <span className="flex items-center gap-2 font-medium text-[var(--panel-text)]">
                {f.label}
                {configuredOf(f.key) ? (
                  <Badge>Configurado</Badge>
                ) : (
                  <span className="text-xs text-[var(--panel-muted)]">usa env legacy</span>
                )}
              </span>
              <input
                type={f.secret ? 'password' : 'text'}
                autoComplete="new-password"
                placeholder={configuredOf(f.key) ? '•••••• (dejar vacío para mantener)' : f.placeholder}
                value={values[f.key]}
                disabled={busy}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                className="rounded border border-[var(--line)] bg-[var(--panel-card)] px-2 py-1.5 text-sm text-[var(--panel-text)]"
              />
            </label>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={onSave} disabled={busy}>Guardar</Button>
          <Button variant="outline" onClick={onTest} disabled={busy}>Probar</Button>
        </div>

        {msg && <p className="mt-3 text-sm text-emerald-600">{msg}</p>}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {testResult && (
          <ul className="mt-3 space-y-1 text-sm">
            {testResult.results.map((r) => (
              <li key={r.field} className={r.ok ? 'text-emerald-600' : 'text-red-600'}>
                {r.field}: {r.ok ? 'formato válido' : `formato inválido${r.detail ? ` — ${r.detail}` : ''}`}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
