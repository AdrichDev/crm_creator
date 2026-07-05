'use client';
import { useTerm } from '@/lib/tenant-config-context';
import { isApiEnabled } from '@/lib/api/client';
import { usePaginatedApi } from '@/lib/data/use-paginated-api';
import { useCollection } from '@/lib/data/use-collection';
import { CONTACTOS_SEED, type ContactoRow } from '@/components/crm/contactos-lista';
import { WidgetShell } from './widget-shell';

const MAX_ITEMS = 5;

/**
 * Últimos leads/prospectos del módulo Contactos. Mismo patrón dual que la
 * página /contactos: API paginada (orden server-side, más reciente primero) o
 * colección localStorage en modo generador (orden por createdAt descendente).
 */
export function ContactosNuevosWidget() {
  const term = useTerm('contactos', 'Contactos');
  const apiEnabled = isApiEnabled();
  const paged = usePaginatedApi<ContactoRow>('/contactos', MAX_ITEMS, apiEnabled);
  const { items: mockItems } = useCollection<ContactoRow>('contactos', CONTACTOS_SEED);

  const recientes = apiEnabled
    ? paged.items.slice(0, MAX_ITEMS)
    : [...mockItems].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')).slice(0, MAX_ITEMS);

  return (
    <WidgetShell icon="Contact" label={`${term} nuevos`}>
      {recientes.length === 0 ? (
        <p className="text-xs text-[var(--panel-muted)]">Sin {term.toLowerCase()} todavía.</p>
      ) : (
        <ul className="space-y-1.5">
          {recientes.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate text-white">{c.nombre}</span>
              <span className="shrink-0 text-[var(--panel-muted)]">{c.tipo === 'lead' ? 'Lead' : 'Prospecto'}</span>
            </li>
          ))}
        </ul>
      )}
    </WidgetShell>
  );
}
