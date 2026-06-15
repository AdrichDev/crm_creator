'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { Sidebar } from './sidebar';
import { useProjects } from '@/lib/tenant-config-context';
import { ArrowLeft, Download } from 'lucide-react';
import { generateAndDownload } from '@/lib/generate/build';

export function AppShell({ children }: { children: ReactNode }) {
  const { config, ready, hasActive, closeProject } = useProjects();
  const router = useRouter();

  // Si no hay proyecto activo, vuelve a la consola.
  useEffect(() => {
    if (ready && !hasActive) router.replace('/');
  }, [ready, hasActive, router]);

  if (!ready || !hasActive) return <div className="grid min-h-screen place-items-center text-gray-400">Cargando…</div>;

  function volver() { closeProject(); router.push('/'); }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-gray-200 bg-white/80 px-5 backdrop-blur">
          <button onClick={volver}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 transition hover:border-gray-900 hover:text-gray-900">
            <ArrowLeft className="h-4 w-4" /> Todos los proyectos
          </button>
          <div className="flex items-center gap-3">
            <button onClick={() => generateAndDownload(config)}
              className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, var(--gold-light), var(--gold))' }}>
              <Download className="h-4 w-4" /> Generar paquete
            </button>
            <div className="grid h-8 w-8 place-items-center rounded-full bg-ink text-xs font-medium text-gold">TÚ</div>
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
