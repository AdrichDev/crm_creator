'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDialog } from '@/components/ui/dialog-provider';
import { ModuleGuard } from '@/components/layout/module-guard';
import { useTerm, useRole } from '@/lib/tenant-config-context';
import { canWrite } from '@/lib/config/roles';
import { PageHeader, Stat, Badge, Button, EmptyState } from '@/components/ui/primitives';
import { TeamModal, type TeamModalValues } from '@/components/categorias/team-modal';
import { isApiEnabled, apiFetch } from '@/lib/api/client';
import { usePaginatedApi } from '@/lib/data/use-paginated-api';
import { SearchInput } from '@/components/ui/search-input';
import { Pagination } from '@/components/ui/pagination';
import { Plus, Users, Pencil, Trash2, Trophy } from 'lucide-react';
import { DEPORTE_LABELS, type DeporteType } from '@/lib/config/sport-positions';

// Shape that the back returns for /categories (paginated).
type Team = {
  id: string;
  nombre: string;
  deporte: DeporteType;
  temporada?: string | null;
  descripcion?: string | null;
  color?: string | null;
  colorVisitante?: string | null;
  totalMiembros: number;
};

function getInitialValues(team: Team | null): TeamModalValues | null {
  if (!team) return null;
  return {
    nombre: team.nombre,
    deporte: team.deporte,
    temporada: team.temporada ?? '',
    descripcion: team.descripcion ?? '',
    color: team.color ?? '#1b431c',
    colorVisitante: team.colorVisitante ?? '#ffffff',
  };
}

export default function Page() {
  const term = useTerm('categorias', 'Categorías');
  const router = useRouter();
  const { role } = useRole();
  const puedeEditar = canWrite(role, 'categorias');
  const apiEnabled = isApiEnabled();

  const dialog = useDialog();
  const paged = usePaginatedApi<Team>('/categories', 20, apiEnabled);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Team | null>(null);

  function onSubmit(v: TeamModalValues) {
    const req = editing
      ? apiFetch(`/categories/${editing.id}`, { method: 'PATCH', body: JSON.stringify(v) })
      : apiFetch('/categories', { method: 'POST', body: JSON.stringify(v) });

    void req.then(() => {
      setOpen(false);
      paged.refresh();
    });
  }

  async function onDelete(team: Team) {
    const ok = await dialog.confirm({ message: `¿Eliminar el equipo "${team.nombre}"?`, danger: true });
    if (!ok) return;
    void apiFetch(`/categories/${team.id}`, { method: 'DELETE' }).then(() => paged.refresh());
  }

  return (
    <ModuleGuard module="categorias">
      <PageHeader
        title={term}
        subtitle="Equipos y categorías del club deportivo."
        action={
          <Button onClick={() => { setEditing(null); setOpen(true); }}>
            <Plus className="h-4 w-4" /> Nuevo equipo
          </Button>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Equipos" value={paged.total} accent />
      </div>

      {!apiEnabled && (
        <EmptyState
          title="Módulo disponible solo en modo CRM"
          hint="Configura NEXT_PUBLIC_API_URL para activar el módulo de categorías."
        />
      )}

      {apiEnabled && (
        <>
          <div className="mb-4">
            <SearchInput
              value={paged.search}
              onChange={paged.setSearch}
              placeholder="Buscar equipo..."
            />
          </div>

          {paged.loading && (
            <p className="text-[var(--panel-muted)] p-4">Cargando equipos...</p>
          )}

          {!paged.loading && paged.items.length === 0 && (
            <EmptyState
              title="Sin equipos aún"
              hint='Crea el primer equipo con "Nuevo equipo".'
            />
          )}

          {paged.items.length > 0 && (
            <div className="equipo-grid">
              {paged.items.map((team) => (
                <div key={team.id} className="equipo-card">
                  <div className="flex items-start justify-between mb-3">
                    <Badge tone="blue">
                      {DEPORTE_LABELS[team.deporte] ?? team.deporte}
                    </Badge>
                    {team.color && (
                      <span
                        className="inline-block h-4 w-4 rounded-full border border-white/20 flex-shrink-0"
                        style={{ background: team.color }}
                        title={team.color}
                      />
                    )}
                  </div>

                  <h3 className="font-semibold text-white mb-1">{team.nombre}</h3>

                  {team.temporada && (
                    <p className="text-sm text-[var(--panel-muted)] mb-2">{team.temporada}</p>
                  )}

                  <div className="flex items-center gap-1 text-sm text-[var(--panel-muted)] mb-4">
                    <Users className="h-4 w-4" />
                    <span>{team.totalMiembros} miembros</span>
                  </div>

                  <div className="equipo-actions">
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => router.push(`/categorias/${team.id}`)}
                    >
                      <Trophy className="h-3 w-3 mr-1" />
                      Ver equipo
                    </button>

                    {puedeEditar && (
                      <>
                        <button
                          className="btn btn-outline btn-sm"
                          title="Editar equipo"
                          onClick={() => { setEditing(team); setOpen(true); }}
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          className="btn btn-outline btn-sm"
                          title="Eliminar equipo"
                          onClick={() => onDelete(team)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <Pagination
            page={paged.page}
            totalPages={paged.totalPages}
            total={paged.total}
            limit={paged.limit}
            onChange={paged.setPage}
          />
        </>
      )}

      <TeamModal
        open={open}
        initial={getInitialValues(editing)}
        onSubmit={onSubmit}
        onClose={() => setOpen(false)}
      />
    </ModuleGuard>
  );
}
