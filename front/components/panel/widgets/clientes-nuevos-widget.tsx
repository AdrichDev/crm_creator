'use client';
import { useTerm } from '@/lib/tenant-config-context';
import { useCollection } from '@/lib/data/use-collection';
import { clientes as seedClientes, type Cliente } from '@/lib/mock/data';
import { WidgetShell } from './widget-shell';

const MAX_ITEMS = 5;

/** Últimas altas de clientes/socios (orden por id descendente: más reciente primero). */
export function ClientesNuevosWidget() {
  const termClientes = useTerm('clientes', 'Clientes');
  const { items } = useCollection<Cliente>('clientes', seedClientes);

  const recientes = [...items].sort((a, b) => b.id - a.id).slice(0, MAX_ITEMS);

  return (
    <WidgetShell icon="UserPlus" label={`${termClientes} nuevos`}>
      {recientes.length === 0 ? (
        <p className="text-xs text-[var(--panel-muted)]">Sin {termClientes.toLowerCase()} todavía.</p>
      ) : (
        <ul className="space-y-1.5">
          {recientes.map((c) => (
            <li key={c.id} className="truncate text-xs text-white">{c.nombre}</li>
          ))}
        </ul>
      )}
    </WidgetShell>
  );
}
