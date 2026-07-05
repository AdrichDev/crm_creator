'use client';
// Página de integraciones del negocio (/ajustes/integraciones).
// Es el destino del redirect del callback OAuth del back
// (?servicio=calendar&estado=conectado|error|scope_insuficiente): muestra el
// resultado en un banner y limpia la query de la URL. La gestión (estado,
// conectar, desconectar) vive en IntegracionesPanel, compartido con el tab
// "Integraciones" de Configuración.
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ModuleGuard } from '@/components/layout/module-guard';
import { PageHeader } from '@/components/ui/primitives';
import { IntegracionesPanel } from '@/components/config/integraciones-panel';

const SERVICIO_NOMBRE: Record<string, string> = { calendar: 'Google Calendar', gmail: 'Gmail' };

const RESULTADO: Record<string, { texto: string; ok: boolean }> = {
  conectado: { texto: 'conectado correctamente. La sincronización ya está activa.', ok: true },
  error: { texto: 'no se pudo conectar. Vuelve a intentarlo.', ok: false },
  scope_insuficiente: {
    texto: 'no se conectó: Google no concedió los permisos necesarios. Repite la conexión y acepta todos los permisos solicitados.',
    ok: false,
  },
};

// Lee el resultado del callback de la query y la limpia (router.replace).
// Separado en su propio componente: useSearchParams exige un límite de Suspense.
function CallbackResultBanner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [banner, setBanner] = useState<{ texto: string; ok: boolean } | null>(null);

  const servicio = searchParams.get('servicio');
  const estado = searchParams.get('estado');

  useEffect(() => {
    if (!servicio || !estado) return;
    const resultado = RESULTADO[estado];
    if (resultado) {
      const nombre = SERVICIO_NOMBRE[servicio] ?? servicio;
      setBanner({ texto: `${nombre} ${resultado.texto}`, ok: resultado.ok });
    }
    router.replace('/ajustes/integraciones');
  }, [servicio, estado, router]);

  if (!banner) return null;
  return (
    <div
      role="status"
      // Texto en var(--panel-text): legible en tema claro y oscuro; el color
      // semántico va solo en el tinte de fondo y el borde (patrón .tone-*).
      className={
        banner.ok
          ? 'mb-4 rounded-[10px] border border-green-500/50 bg-green-500/10 px-4 py-3 text-sm text-[var(--panel-text)]'
          : 'mb-4 rounded-[10px] border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-[var(--panel-text)]'
      }
    >
      {banner.texto}
    </div>
  );
}

export default function IntegracionesPage() {
  return (
    <ModuleGuard module="configuracion">
      <PageHeader
        title="Integraciones"
        subtitle="Conecta el negocio con Google Calendar y Gmail. Cada negocio usa su propia cuenta de Google."
      />
      <Suspense fallback={null}>
        <CallbackResultBanner />
      </Suspense>
      <IntegracionesPanel />
    </ModuleGuard>
  );
}
