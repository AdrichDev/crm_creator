'use client';
// Panel de integraciones OAuth del negocio (Google Calendar / Gmail).
// Lee GET /integrations, lanza el consentimiento con POST /:servicio/connect
// (misma pestaña: el callback del back redirige de vuelta a /ajustes/integraciones)
// y desconecta con POST /:servicio/revoke. Si el servidor no tiene GOOGLE_OAUTH_*
// configurado, el connect devuelve 503 oauth_no_configurado → aviso específico.
import { useCallback, useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api/client';
import { useDialog } from '@/components/ui/dialog-provider';
import { Card, CardBody, Badge, Button } from '@/components/ui/primitives';

export type EstadoIntegracion = 'connected' | 'reauth_required' | 'revoked' | null;

export interface IntegracionEstado {
  servicio: 'gmail' | 'calendar';
  estado: EstadoIntegracion;
  connectedAt?: string;
  scopesOauth?: string[];
}

const SERVICIOS: Array<{ id: 'calendar' | 'gmail'; nombre: string; descripcion: string }> = [
  {
    id: 'calendar',
    nombre: 'Google Calendar',
    descripcion: 'Sincroniza las citas del CRM con el calendario de Google del negocio (bidireccional, cada 5 minutos).',
  },
  {
    id: 'gmail',
    nombre: 'Gmail',
    descripcion: 'Envía notificaciones y recordatorios desde la cuenta de Gmail del negocio.',
  },
];

export function estadoLabel(estado: EstadoIntegracion): { texto: string; tone: 'gray' | 'green' | 'amber' | 'red' } {
  switch (estado) {
    case 'connected': return { texto: 'Conectada', tone: 'green' };
    case 'reauth_required': return { texto: 'Requiere reconexión', tone: 'amber' };
    case 'revoked': return { texto: 'Desconectada', tone: 'red' };
    default: return { texto: 'Nunca conectada', tone: 'gray' };
  }
}

const fmtFecha = (iso?: string) => (iso ? iso.slice(0, 16).replace('T', ' ') : null);

export function IntegracionesPanel() {
  const dialog = useDialog();
  const [items, setItems] = useState<IntegracionEstado[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null); // servicio con acción en vuelo
  const [aviso, setAviso] = useState<{ tipo: 'config' | 'error'; texto: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch<{ items: IntegracionEstado[] }>('/integrations');
      setItems(r.items ?? []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function conectar(servicio: 'gmail' | 'calendar') {
    setBusy(servicio); setAviso(null);
    try {
      const { url } = await apiFetch<{ url: string }>(`/integrations/${servicio}/connect`, { method: 'POST' });
      // Consentimiento en la MISMA pestaña: Google redirige al callback del back,
      // que vuelve a /ajustes/integraciones con ?servicio=&estado=.
      window.location.href = url;
    } catch (e) {
      if (e instanceof ApiError && e.code === 'oauth_no_configurado') {
        setAviso({
          tipo: 'config',
          texto: 'El administrador aún no ha configurado las credenciales de Google (GOOGLE_OAUTH_*) en el servidor. Hasta entonces no se puede conectar.',
        });
      } else {
        setAviso({ tipo: 'error', texto: 'No se pudo iniciar la conexión. Inténtalo de nuevo.' });
      }
      setBusy(null);
    }
  }

  async function desconectar(servicio: 'gmail' | 'calendar', nombre: string) {
    const ok = await dialog.confirm({
      message: `¿Desconectar ${nombre}? El CRM dejará de sincronizar con este servicio hasta que vuelvas a conectarlo.`,
      danger: true,
    });
    if (!ok) return;
    setBusy(servicio); setAviso(null);
    try {
      await apiFetch(`/integrations/${servicio}/revoke`, { method: 'POST' });
      await load();
    } catch {
      setAviso({ tipo: 'error', texto: 'No se pudo desconectar. Inténtalo de nuevo.' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {aviso && (
        <div
          role="alert"
          // Texto en var(--panel-text): legible en tema claro y oscuro; el color
          // semántico va solo en el tinte de fondo y el borde (patrón .tone-*).
          className={
            aviso.tipo === 'config'
              ? 'rounded-[10px] border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm text-[var(--panel-text)]'
              : 'rounded-[10px] border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-[var(--panel-text)]'
          }
        >
          {aviso.texto}
        </div>
      )}

      {SERVICIOS.map(({ id, nombre, descripcion }) => {
        const item = items.find((i) => i.servicio === id);
        const estado = item?.estado ?? null;
        const { texto, tone } = estadoLabel(estado);
        const conectada = estado === 'connected';
        const fecha = conectada ? fmtFecha(item?.connectedAt) : null;
        return (
          <Card key={id}>
            <CardBody className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3">
                  <p className="font-medium text-white">{nombre}</p>
                  <Badge tone={tone}>{loading ? 'Cargando…' : texto}</Badge>
                </div>
                <p className="mt-1 text-sm text-[var(--panel-muted)]">{descripcion}</p>
                {fecha && <p className="mt-1 text-xs text-[var(--panel-muted)]">Última conexión: {fecha}</p>}
              </div>
              <div className="flex shrink-0 gap-2">
                {!conectada && (
                  <Button onClick={() => void conectar(id)} disabled={busy !== null || loading}>
                    {busy === id ? 'Conectando…' : estado === null ? 'Conectar' : 'Reconectar'}
                  </Button>
                )}
                {conectada && (
                  <Button variant="outline" onClick={() => void desconectar(id, nombre)} disabled={busy !== null}>
                    {busy === id ? 'Desconectando…' : 'Desconectar'}
                  </Button>
                )}
              </div>
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}
