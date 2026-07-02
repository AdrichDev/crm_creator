'use client';
// crm-citas-google-calendar (WU4.1): sección "Calendario" en Mi Cuenta.
// URL ICS (mostrada solo al generar/regenerar, con copiar), regenerar, revocar,
// toggle de push y aviso de latencia de refresco de Google/Outlook/Apple.
import { useEffect, useState } from 'react';
import { Card, CardBody, Button, Toggle } from '@/components/ui/primitives';
import { isApiEnabled } from '@/lib/api/client';
import {
  getCalendarStatus,
  generateCalendarToken,
  revokeCalendarToken,
  updateCalendarPushEnabled,
  calendarFeedUrl,
  type CalendarStatus,
} from '@/lib/api/calendar';

export function CalendarSection() {
  const apiOn = isApiEnabled();

  const [status, setStatus] = useState<CalendarStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // La URL en claro SOLO existe justo tras generar/regenerar — nunca se recupera después.
  const [revealedUrl, setRevealedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!apiOn) { setLoading(false); return; }
    getCalendarStatus()
      .then(setStatus)
      .catch((e) => setError(e instanceof Error ? e.message : 'No se pudo cargar el estado del calendario'))
      .finally(() => setLoading(false));
  }, [apiOn]);

  async function handleGenerate() {
    setBusy(true); setError(null); setCopied(false);
    try {
      const result = await generateCalendarToken();
      setRevealedUrl(calendarFeedUrl(result.path));
      setStatus({ hasToken: true, pushEnabled: status?.pushEnabled ?? false });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo generar la URL del calendario');
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke() {
    setBusy(true); setError(null);
    try {
      await revokeCalendarToken();
      setRevealedUrl(null);
      setStatus((s) => (s ? { ...s, hasToken: false } : s));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo revocar la URL del calendario');
    } finally {
      setBusy(false);
    }
  }

  async function handleTogglePush(next: boolean) {
    setBusy(true); setError(null);
    try {
      const result = await updateCalendarPushEnabled(next);
      setStatus((s) => (s ? { ...s, pushEnabled: result.pushEnabled } : s));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo actualizar la preferencia');
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    if (!revealedUrl) return;
    try {
      await navigator.clipboard.writeText(revealedUrl);
      setCopied(true);
    } catch {
      /* clipboard no disponible — el usuario puede seleccionar el texto manualmente */
    }
  }

  if (!apiOn) return null;
  if (loading) {
    return <Card><CardBody><p className="text-sm text-[var(--panel-muted)]">Cargando calendario…</p></CardBody></Card>;
  }

  return (
    <Card>
      <CardBody className="space-y-4">
        <div>
          <p className="font-medium text-white">Calendario</p>
          <p className="mt-1 text-sm text-[var(--panel-muted)]">
            Ve tus citas y recordatorios del CRM en Google Calendar, Outlook o Apple Calendar.
          </p>
        </div>

        <div className="max-w-lg space-y-3">
          <div>
            <p className="opera-label">URL de suscripción (ICS)</p>
            {revealedUrl ? (
              <div className="space-y-2">
                <input className="opera-control" type="text" readOnly value={revealedUrl} onFocus={(e) => e.target.select()} />
                <div className="flex items-center gap-3">
                  <Button variant="outline" onClick={handleCopy}>{copied ? 'Copiada ✓' : 'Copiar URL'}</Button>
                </div>
                <p className="text-xs text-[var(--panel-muted)]">
                  Guarda esta URL ahora: por seguridad no se puede volver a mostrar. Si la
                  pierdes, genera una nueva (invalida esta).
                </p>
              </div>
            ) : (
              <p className="text-sm text-[var(--panel-muted)]">
                {status?.hasToken
                  ? 'Ya tienes una URL configurada. Por seguridad no se muestra de nuevo — regenera si la perdiste.'
                  : 'Aún no has generado una URL de calendario.'}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            <Button onClick={handleGenerate} disabled={busy}>
              {status?.hasToken ? 'Regenerar URL' : 'Generar URL'}
            </Button>
            {status?.hasToken && (
              <Button variant="outline" onClick={handleRevoke} disabled={busy}>Revocar</Button>
            )}
          </div>

          <p className="text-xs text-[var(--panel-muted)]">
            Google Calendar puede tardar varias horas en reflejar cambios del feed (no es en
            tiempo real). Para citas urgentes, activa el envío directo abajo.
          </p>

          <div className="flex items-center justify-between border-t border-white/10 pt-3">
            <div>
              <p className="text-sm text-white">Enviar citas confirmadas a mi calendario</p>
              <p className="text-xs text-[var(--panel-muted)]">
                Además del feed ICS, cada cita confirmada o recordatorio con fecha se envía
                directamente a tu Google Calendar.
              </p>
            </div>
            <Toggle checked={status?.pushEnabled ?? false} onChange={handleTogglePush} disabled={busy} />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
      </CardBody>
    </Card>
  );
}
