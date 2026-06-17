'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useProjects } from '@/lib/tenant-config-context';
import { MODULES } from '@/lib/config/modules';
import { VERTICAL_MAP } from '@/lib/config/verticals';
import { generateAndDownload } from '@/lib/generate/build';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { Plus, Download, Pencil, Trash2, FolderOpen, Loader2 } from 'lucide-react';

export default function Consola() {
  const { ready, projects, openProject, deleteProject, markGenerated } = useProjects();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  function nuevo() { router.push('/onboarding'); }
  function abrir(id: string) { openProject(id); router.push('/panel'); }
  // UC-1: "Editar" reabre el ONBOARDING en modo edición (pre-cargado con la config
  // del proyecto), no el editor campo-a-campo. `/configuracion` sigue disponible.
  function editar(id: string) { router.push(`/onboarding?projectId=${id}`); }
  async function generar(id: string) {
    const p = projects.find((x) => x.id === id); if (!p) return;
    setBusy(id);
    try { await generateAndDownload(p.config); markGenerated(id); }
    finally { setBusy(null); }
  }

  if (!ready) return <div className="grid min-h-screen place-items-center bg-ink text-gray-400">Cargando…</div>;

  return (
    <div className="crm-console">
      {/* Cabecera premium oscura */}
      <header className="bg-ink">
        <div className="mx-auto max-w-5xl px-6 py-7">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl gold-gradient text-ink shadow-lg">
                <span className="font-display text-lg font-bold">O</span>
              </div>
              <div>
                <p className="font-display text-xl font-semibold text-white">OperaOS · Consola</p>
                <p className="text-xs text-gray-400">Diseña y genera la app de gestión de cada cliente</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <button onClick={nuevo}
                className="inline-flex items-center gap-2 rounded-xl gold-gradient px-4 py-2.5 text-sm font-semibold text-ink shadow-md transition hover:opacity-90">
                <Plus className="h-4 w-4" /> Nuevo proyecto
              </button>
            </div>
          </div>
          <div className="mt-5 flex gap-6 text-sm">
            <div><span className="font-display text-2xl text-gold">{projects.length}</span><span className="ml-2 text-gray-400">proyectos</span></div>
            <div><span className="font-display text-2xl text-gold">{projects.filter((p) => p.generatedAt).length}</span><span className="ml-2 text-gray-400">generados</span></div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>Generar</strong> descarga la especificación del proyecto (manifest + esquema). Para crear el
          <strong> CRM completo (back + front) con su <code>.env</code></strong>, ejecuta en la raíz:
          <code className="ml-1 rounded bg-amber-100 px-1.5 py-0.5">node generar.mjs</code>
          (o <code className="rounded bg-amber-100 px-1.5 py-0.5">--from manifest.json</code> del paquete).
        </div>
        {projects.length === 0 ? (
          <div className="crm-console-card rounded-2xl border-dashed py-20 text-center">
            <p className="font-display text-lg text-[var(--panel-text)]">Aún no hay proyectos</p>
            <p className="mt-1 text-sm text-[var(--panel-muted)]">Crea el primero para un cliente y genera su paquete.</p>
            <button onClick={nuevo} className="mt-5 inline-flex items-center gap-2 rounded-xl gold-gradient px-4 py-2.5 text-sm font-semibold text-ink shadow">
              <Plus className="h-4 w-4" /> Nuevo proyecto
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {projects.map((p) => {
              const v = VERTICAL_MAP[p.config.business.vertical];
              const active = MODULES.filter((m) => p.config.modules[m.id] && !m.mandatory);
              return (
                <div key={p.id} className="crm-console-card group rounded-2xl p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                  <div className="flex items-start gap-3">
                    <div className="grid h-12 w-12 place-items-center rounded-xl text-sm font-bold text-white shadow"
                      style={{ background: `linear-gradient(135deg, ${p.config.branding.secondary}, ${p.config.branding.primary})` }}>
                      {p.config.branding.logoText}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display text-lg font-semibold text-[var(--panel-text)]">{p.config.business.name}</p>
                      <p className="text-xs text-[var(--panel-muted)]">{v.emoji} {v.label}</p>
                    </div>
                    {p.generatedAt && <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700">Generado</span>}
                  </div>
                  <p className="mt-3 text-xs text-[var(--panel-muted)]">{active.length} módulos: {active.slice(0, 4).map((m) => p.config.terminology[m.termKey] ?? m.defaultLabel).join(', ')}{active.length > 4 ? '…' : ''}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button onClick={() => abrir(p.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--panel-muted)] transition hover:border-[var(--acc)] hover:text-[var(--acc)]"><FolderOpen className="h-3.5 w-3.5" /> Abrir</button>
                    <button onClick={() => editar(p.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--panel-muted)] transition hover:border-[var(--acc)] hover:text-[var(--acc)]"><Pencil className="h-3.5 w-3.5" /> Editar</button>
                    <button onClick={() => generar(p.id)} disabled={busy === p.id} className="inline-flex items-center gap-1.5 rounded-lg gold-gradient px-3 py-1.5 text-xs font-semibold text-ink transition hover:opacity-90 disabled:opacity-50">
                      {busy === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Generar
                    </button>
                    <button onClick={() => { if (confirm('¿Eliminar proyecto?')) deleteProject(p.id); }} className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
