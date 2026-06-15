'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useTenantConfig, useTerm } from '@/lib/tenant-config-context';
import { MODULES, MODULE_MAP } from '@/lib/config/modules';
import { MAX_FAVORITES, type Favorite } from '@/lib/config/tenant-config';
import { Icon } from '@/components/ui/icon';
import { PageHeader, Stat, Card, CardBody, Badge } from '@/components/ui/primitives';
import { X, Star } from 'lucide-react';
import * as mock from '@/lib/mock/data';

// Opciones genéricas que se pueden añadir a una tarjeta favorita.
const FAV_OPTIONS = ['Ver todo', 'Nuevo', 'Hoy', 'Pendientes', 'Buscar'];
const uid = () => 'f_' + Math.random().toString(36).slice(2, 8);

export default function Dashboard() {
  const { config, update } = useTenantConfig();
  const termClientes = useTerm('clientes', 'clientes');
  const termCitas = useTerm('citas', 'Citas');
  const m = config.modules;
  const [adding, setAdding] = useState('');

  const stats = [
    { label: 'Ingresos hoy', value: '€226', hint: '8 tickets', show: m.ventas },
    { label: `${termCitas} hoy`, value: '5', hint: '3 confirmadas', show: m.citas },
    { label: `${termClientes}`, value: String(mock.clientes.length), hint: '2 nuevos esta semana', show: m.clientes },
    { label: 'Stock bajo', value: '2', hint: 'productos a reponer', show: m.productos },
  ].filter((s) => s.show);

  const favorites: Favorite[] = config.favorites ?? [];
  const activeModules = MODULES.filter((mm) => config.modules[mm.id] && mm.id !== 'dashboard' && mm.id !== 'configuracion');
  const addable = activeModules.filter((mm) => !favorites.some((f) => f.target === mm.id));

  function setFavorites(next: Favorite[]) { update({ favorites: next }); }
  function addFavorite(target: string) {
    if (!target || favorites.length >= MAX_FAVORITES) return;
    setFavorites([...favorites, { id: uid(), target: target as Favorite['target'], options: [] }]);
    setAdding('');
  }
  function removeFavorite(id: string) { setFavorites(favorites.filter((f) => f.id !== id)); }
  function addOption(id: string, option: string) {
    if (!option) return;
    setFavorites(favorites.map((f) => (f.id === id && !f.options.includes(option) ? { ...f, options: [...f.options, option] } : f)));
  }
  function removeOption(id: string, option: string) {
    setFavorites(favorites.map((f) => (f.id === id ? { ...f, options: f.options.filter((o) => o !== option) } : f)));
  }

  const label = (id: string) => config.terminology[MODULE_MAP[id as Favorite['target']].termKey] ?? MODULE_MAP[id as Favorite['target']].defaultLabel;

  return (
    <div>
      <PageHeader title={`Hola, ${config.business.name}`} subtitle="Resumen de tu actividad." />

      {stats.length > 0 && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((s) => <Stat key={s.label} label={s.label} value={s.value} hint={s.hint} />)}
        </div>
      )}

      {/* Favoritos (máx. 6 tarjetas grandes) */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-gray-900">
          <Star className="h-5 w-5 text-[var(--gold)]" /> Favoritos
        </h2>
        {favorites.length < MAX_FAVORITES && addable.length > 0 && (
          <div className="flex items-center gap-2">
            <select value={adding} onChange={(e) => addFavorite(e.target.value)}
              className="rounded-xl border border-gray-300 px-3 py-1.5 text-sm">
              <option value="">+ Añadir favorito…</option>
              {addable.map((mm) => <option key={mm.id} value={mm.id}>{label(mm.id)}</option>)}
            </select>
          </div>
        )}
      </div>

      {favorites.length === 0 ? (
        <Card className="mb-6"><CardBody className="py-10 text-center text-sm text-gray-400">
          Aún no tienes favoritos. Añade hasta {MAX_FAVORITES} accesos grandes desde el selector de arriba.
        </CardBody></Card>
      ) : (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {favorites.map((f) => {
            const def = MODULE_MAP[f.target];
            const used = new Set(f.options);
            const free = FAV_OPTIONS.filter((o) => !used.has(o));
            return (
              <Card key={f.id} className="relative overflow-hidden">
                <button onClick={() => removeFavorite(f.id)} className="absolute right-2 top-2 rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><X className="h-4 w-4" /></button>
                <CardBody className="p-5">
                  <Link href={def.href} className="flex items-center gap-3">
                    <div className="grid h-12 w-12 place-items-center rounded-xl text-white shadow"
                      style={{ background: 'linear-gradient(135deg, var(--brand-secondary), var(--brand-primary))' }}>
                      <Icon name={def.icon} className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-display text-lg font-semibold text-gray-900">{f.label ?? label(f.target)}</p>
                      <p className="text-xs text-gray-400">{def.description}</p>
                    </div>
                  </Link>

                  {/* Opciones del favorito */}
                  <div className="mt-4 flex flex-wrap items-center gap-1.5">
                    {f.options.map((o) => (
                      <span key={o} className="inline-flex items-center gap-1 rounded-full bg-[var(--brand-primary)]/10 px-2.5 py-0.5 text-xs font-medium text-[var(--brand-primary)]">
                        {o}<button onClick={() => removeOption(f.id, o)} className="hover:text-red-600"><X className="h-3 w-3" /></button>
                      </span>
                    ))}
                    {free.length > 0 && (
                      <select value="" onChange={(e) => addOption(f.id, e.target.value)}
                        className="rounded-full border border-dashed border-gray-300 px-2 py-0.5 text-xs text-gray-500">
                        <option value="">+ opción</option>
                        {free.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    )}
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      {/* Plan / módulos activos */}
      <Card><CardBody>
        <h2 className="mb-3 font-semibold text-gray-900">Tu plan</h2>
        <p className="text-sm text-gray-500">Módulos activos en esta plataforma:</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {activeModules.map((mm) => <Badge key={mm.id} tone="brand">{label(mm.id)}</Badge>)}
        </div>
        <Link href="/configuracion" className="mt-4 inline-block text-sm text-[var(--brand-primary)] hover:underline">Gestionar módulos →</Link>
      </CardBody></Card>
    </div>
  );
}
