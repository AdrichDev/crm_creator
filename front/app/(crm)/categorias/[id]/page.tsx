'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useDialog } from '@/components/ui/dialog-provider';
import { ModuleGuard } from '@/components/layout/module-guard';
import { useRole } from '@/lib/tenant-config-context';
import { canWrite } from '@/lib/config/roles';
import { Badge, Button, EmptyState, IconButton } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/modal';
import { ImageCell } from '@/components/ui/image-cell';
import { EditMemberModal, type EditMemberTarget, type EditMemberValues } from '@/components/categorias/edit-member-modal';
import { isApiEnabled, apiFetch } from '@/lib/api/client';
import { ArrowLeft, Plus, Info, Pencil, Trash2, UserPlus, LayoutGrid, List } from 'lucide-react';
import {
  DEPORTE_LABELS,
  SPORT_POSITIONS,
  STAFF_ROLES,
  memberBorderColor,
  type DeporteType,
} from '@/lib/config/sport-positions';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ContactoEmergencia = {
  nombre: string;
  telefono: string;
  relacion: string;
};

type EmployeeInfo = {
  id: string;
  nombre: string;
  apellido?: string | null;
  rol?: string | null;
  imagenUrl?: string | null;
};

type CustomerInfo = {
  id: string;
  nombre: string;
  apellido?: string | null;
  fechaNacimiento?: string | null;
  telefono?: string | null;
  email?: string | null;
  direccion?: string | null;
  imagenUrl?: string | null;
};

type TeamMember = {
  id: string;
  rol: string;
  dorsal?: string | null;
  posicion?: string | null;
  activoDesde?: string | null;
  contactosEmergencia: ContactoEmergencia[];
  employee?: EmployeeInfo | null;
  customer?: CustomerInfo | null;
};

type Team = {
  id: string;
  nombre: string;
  deporte: DeporteType;
  temporada?: string | null;
  descripcion?: string | null;
  color?: string | null;
  members: TeamMember[];
};

type CustomerSearchRow = {
  id: string;
  nombre: string;
  apellido?: string | null;
  fechaNacimiento?: string | null;
};

type EmployeeSearchRow = {
  id: string;
  nombre: string;
  apellido?: string | null;
  rol?: string | null;
};

type Tab = 'todos' | 'jugadores' | 'staff';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function calcEdad(fechaNacimiento?: string | null): number | null {
  if (!fechaNacimiento) return null;
  return Math.floor(
    (Date.now() - new Date(fechaNacimiento).getTime()) / (365.25 * 24 * 60 * 60 * 1000),
  );
}

function initiales(nombre: string, apellido?: string | null): string {
  return ((nombre[0] ?? '') + (apellido?.[0] ?? '')).toUpperCase() || '?';
}

function nombreCompleto(nombre: string, apellido?: string | null): string {
  return [nombre, apellido].filter(Boolean).join(' ');
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'jugadores', label: 'Jugadores' },
  { key: 'staff', label: 'Entrenadores y staff' },
];

const EMPTY_CONTACT: ContactoEmergencia = { nombre: '', telefono: '', relacion: '' };

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Page() {
  const params = useParams();
  const teamId = String(params?.id ?? '');
  const router = useRouter();
  const { role } = useRole();
  const puedeEditar = canWrite(role, 'categorias');
  const apiEnabled = isApiEnabled();
  const dialog = useDialog();

  // Team state
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);

  // Tab filter
  const [tab, setTab] = useState<Tab>('todos');

  // Vista: tarjetas o tabla
  const [view, setView] = useState<'cards' | 'table'>('cards');

  // Editar miembro (lápiz)
  const [editMemberId, setEditMemberId] = useState<string | null>(null);
  const editingMember = team?.members.find((m) => m.id === editMemberId) ?? null;

  // Member drawer: stores just the ID; derived from team.members for auto-sync
  const [drawerMemberId, setDrawerMemberId] = useState<string | null>(null);
  const drawerMember = team?.members.find((m) => m.id === drawerMemberId) ?? null;

  // Add contact inline form
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [newContact, setNewContact] = useState<ContactoEmergencia>(EMPTY_CONTACT);

  // Add member modal
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [memberType, setMemberType] = useState<'customer' | 'employee'>('customer');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<(CustomerSearchRow | EmployeeSearchRow)[]>([]);
  const [selectedPerson, setSelectedPerson] = useState<CustomerSearchRow | EmployeeSearchRow | null>(null);
  const [newMemberPosicion, setNewMemberPosicion] = useState('');
  const [newMemberDorsal, setNewMemberDorsal] = useState('');
  const [newMemberActivoDesde, setNewMemberActivoDesde] = useState('');
  const [newMemberContacts, setNewMemberContacts] = useState<ContactoEmergencia[]>([]);
  const [newContactField, setNewContactField] = useState<ContactoEmergencia>(EMPTY_CONTACT);

  // ---------------------------------------------------------------------------
  // Fetch
  // ---------------------------------------------------------------------------

  const fetchTeam = useCallback(async () => {
    if (!apiEnabled || !teamId) { setLoading(false); return; }
    try {
      const data = await apiFetch<Team>(`/categories/${teamId}`);
      setTeam(data);
    } catch {
      setTeam(null);
    } finally {
      setLoading(false);
    }
  }, [teamId, apiEnabled]);

  useEffect(() => { void fetchTeam(); }, [fetchTeam]);

  // Search customers / employees (debounced 300 ms)
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      const path =
        memberType === 'customer'
          ? `/customers?search=${encodeURIComponent(searchQuery)}&limit=10`
          : `/employees?search=${encodeURIComponent(searchQuery)}&limit=10`;
      try {
        const data = await apiFetch<{ items: (CustomerSearchRow | EmployeeSearchRow)[] }>(path);
        setSearchResults(data.items ?? []);
      } catch {
        setSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery, memberType]);

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------

  function filteredMembers(): TeamMember[] {
    if (!team) return [];
    if (tab === 'jugadores') return team.members.filter((m) => m.customer);
    if (tab === 'staff') return team.members.filter((m) => m.employee);
    return team.members;
  }

  const positions = team ? SPORT_POSITIONS[team.deporte] : null;

  // Minor check for selected person in add-member modal
  const selectedCustomer =
    memberType === 'customer' ? (selectedPerson as CustomerSearchRow | null) : null;
  const selectedEdad = selectedCustomer ? calcEdad(selectedCustomer.fechaNacimiento) : null;
  const selectedEsMenor = selectedEdad !== null && selectedEdad < 18;
  const canSubmitMember = !selectedEsMenor || newMemberContacts.length > 0;

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  async function deleteMember(memberId: string) {
    const ok = await dialog.confirm({ message: '¿Eliminar este miembro del equipo?', danger: true });
    if (!ok) return;
    await apiFetch(`/categories/${teamId}/members/${memberId}`, { method: 'DELETE' });
    void fetchTeam();
  }

  async function patchMember(memberId: string, values: EditMemberValues) {
    await apiFetch(`/categories/${teamId}/members/${memberId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        posicion: values.posicion || null,
        dorsal: values.dorsal || null,
        activoDesde: values.activoDesde || null,
      }),
    });
    setEditMemberId(null);
    void fetchTeam();
  }

  async function addContact() {
    if (!drawerMember || !newContact.nombre || !newContact.telefono) return;
    const updated: ContactoEmergencia[] = [
      ...(drawerMember.contactosEmergencia ?? []),
      newContact,
    ];
    await apiFetch(`/categories/${teamId}/members/${drawerMember.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ contactosEmergencia: updated }),
    });
    setNewContact(EMPTY_CONTACT);
    setAddContactOpen(false);
    void fetchTeam();
  }

  async function removeContact(idx: number) {
    if (!drawerMember) return;
    const updated = drawerMember.contactosEmergencia.filter((_, i) => i !== idx);
    await apiFetch(`/categories/${teamId}/members/${drawerMember.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ contactosEmergencia: updated }),
    });
    void fetchTeam();
  }

  async function addMember() {
    if (!selectedPerson) { await dialog.alert('Selecciona una persona'); return; }
    const isCustomer = memberType === 'customer';
    const payload: Record<string, unknown> = {
      ...(isCustomer ? { customerId: selectedPerson.id } : { employeeId: selectedPerson.id }),
      rol: isCustomer ? 'jugador' : 'staff',
      ...(newMemberPosicion ? { posicion: newMemberPosicion } : {}),
      ...(newMemberDorsal ? { dorsal: newMemberDorsal } : {}),
      ...(newMemberActivoDesde ? { activoDesde: newMemberActivoDesde } : {}),
      contactosEmergencia: newMemberContacts,
    };
    await apiFetch(`/categories/${teamId}/members`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setAddMemberOpen(false);
    resetAddMemberForm();
    void fetchTeam();
  }

  function resetAddMemberForm() {
    setMemberType('customer');
    setSearchQuery('');
    setSearchResults([]);
    setSelectedPerson(null);
    setNewMemberPosicion('');
    setNewMemberDorsal('');
    setNewMemberActivoDesde('');
    setNewMemberContacts([]);
    setNewContactField(EMPTY_CONTACT);
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <ModuleGuard module="categorias">
      {/* Page header */}
      <div className="panel-header mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => router.push('/categorias')}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Categorías
          </button>
          {team && (
            <>
              <h1 className="text-xl font-bold text-white">{team.nombre}</h1>
              <Badge tone="blue">{DEPORTE_LABELS[team.deporte] ?? team.deporte}</Badge>
              {team.temporada && (
                <span className="text-sm text-[var(--panel-muted)]">{team.temporada}</span>
              )}
            </>
          )}
        </div>
        {puedeEditar && (
          <Button
            onClick={() => { resetAddMemberForm(); setAddMemberOpen(true); }}
          >
            <UserPlus className="h-4 w-4" /> Añadir miembro
          </Button>
        )}
      </div>

      {/* States */}
      {!apiEnabled && (
        <EmptyState
          title="Módulo disponible solo en modo CRM"
          hint="Configura NEXT_PUBLIC_API_URL para activar el módulo de categorías."
        />
      )}

      {apiEnabled && loading && (
        <p className="text-[var(--panel-muted)] p-4">Cargando equipo...</p>
      )}

      {apiEnabled && !loading && !team && (
        <EmptyState
          title="Equipo no encontrado"
          hint="El equipo no existe o no tienes acceso."
        />
      )}

      {apiEnabled && team && (
        <>
          {/* Tab bar + toggle de vista */}
          <div className="flex items-center justify-between mb-6 border-b border-white/10">
            <div className="flex gap-1">
              {TABS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  className={`px-4 py-2 text-sm font-medium transition border-b-2 -mb-px ${
                    tab === key
                      ? 'text-white border-[var(--acc)]'
                      : 'text-[var(--panel-muted)] border-transparent hover:text-[var(--hover-text)]'
                  }`}
                  onClick={() => setTab(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex gap-1 mb-2">
              <button
                type="button"
                title="Vista de tarjetas"
                className={`btn btn-sm ${view === 'cards' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setView('cards')}
              >
                <LayoutGrid className="h-3 w-3" />
              </button>
              <button
                type="button"
                title="Vista de tabla"
                className={`btn btn-sm ${view === 'table' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setView('table')}
              >
                <List className="h-3 w-3" />
              </button>
            </div>
          </div>

          {/* Members */}
          {filteredMembers().length === 0 ? (
            <EmptyState
              title="Sin miembros en esta categoría"
              hint='Usa "Añadir miembro" para incorporar jugadores o staff.'
            />
          ) : view === 'cards' ? (
            <div className="equipo-grid">
              {filteredMembers().map((member) => {
                const person = member.customer ?? member.employee;
                const isStaff = !!member.employee;
                const nombre = person?.nombre ?? '—';
                const apellido = person?.apellido;
                const edad =
                  member.customer ? calcEdad(member.customer.fechaNacimiento) : null;
                const esMenor = edad !== null && edad < 18;
                const borderColor = memberBorderColor(isStaff, member.posicion);

                return (
                  <div
                    key={member.id}
                    className="equipo-card"
                    style={{ borderColor, borderWidth: 2 }}
                  >
                    <div className="flex justify-center mb-2">
                      <ImageCell
                        kind={isStaff ? 'employee' : 'customer'}
                        id={person?.id ?? ''}
                        imagenUrl={person?.imagenUrl}
                        enabled={puedeEditar}
                        shape="circle"
                        size={64}
                        initials={initiales(nombre, apellido)}
                        onUploaded={() => void fetchTeam()}
                      />
                    </div>

                    <h3>{nombreCompleto(nombre, apellido)}</h3>
                    <p className="role">{member.posicion ?? member.rol ?? '—'}</p>

                    {member.dorsal && (
                      <div className="mb-2">
                        <Badge tone="gray">#{member.dorsal}</Badge>
                      </div>
                    )}

                    {esMenor && (
                      <div className="mb-2">
                        <Badge tone="amber">Menor de edad</Badge>
                      </div>
                    )}

                    <div className="equipo-actions">
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => {
                          setAddContactOpen(false);
                          setNewContact(EMPTY_CONTACT);
                          setDrawerMemberId(member.id);
                        }}
                      >
                        <Info className="h-3 w-3 mr-1" />
                        Info
                      </button>
                      {puedeEditar && (
                        <>
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            title="Editar miembro"
                            onClick={() => setEditMemberId(member.id)}
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            title="Eliminar miembro"
                            onClick={() => void deleteMember(member.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-white/10">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left text-[var(--panel-muted)]">
                    <th className="p-2">Foto</th>
                    <th className="p-2">#</th>
                    <th className="p-2">Nombre</th>
                    <th className="p-2">Posición</th>
                    <th className="p-2 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMembers().map((member) => {
                    const person = member.customer ?? member.employee;
                    const isStaff = !!member.employee;
                    const nombre = person?.nombre ?? '—';
                    const apellido = person?.apellido;
                    const borderColor = memberBorderColor(isStaff, member.posicion);

                    return (
                      <tr key={member.id} className="border-b border-white/5">
                        <td className="p-2" style={{ borderLeft: `3px solid ${borderColor}` }}>
                          <ImageCell
                            kind={isStaff ? 'employee' : 'customer'}
                            id={person?.id ?? ''}
                            imagenUrl={person?.imagenUrl}
                            enabled={puedeEditar}
                            shape="circle"
                            size={36}
                            initials={initiales(nombre, apellido)}
                            onUploaded={() => void fetchTeam()}
                          />
                        </td>
                        <td className="p-2 text-white">{member.dorsal ? `#${member.dorsal}` : '—'}</td>
                        <td className="p-2 text-white">{nombreCompleto(nombre, apellido)}</td>
                        <td className="p-2 text-[var(--panel-muted)]">{member.posicion ?? member.rol ?? '—'}</td>
                        <td className="p-2">
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              title="Info"
                              onClick={() => {
                                setAddContactOpen(false);
                                setNewContact(EMPTY_CONTACT);
                                setDrawerMemberId(member.id);
                              }}
                            >
                              <Info className="h-3 w-3" />
                            </button>
                            {puedeEditar && (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-outline btn-sm"
                                  title="Editar miembro"
                                  onClick={() => setEditMemberId(member.id)}
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-outline btn-sm"
                                  title="Eliminar miembro"
                                  onClick={() => void deleteMember(member.id)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Member Drawer (as Modal)                                             */}
      {/* ------------------------------------------------------------------ */}
      <Modal
        open={!!drawerMemberId}
        title="Ficha de miembro"
        onClose={() => {
          setDrawerMemberId(null);
          setAddContactOpen(false);
          setNewContact(EMPTY_CONTACT);
        }}
        footer={
          <Button
            variant="outline"
            onClick={() => {
              setDrawerMemberId(null);
              setAddContactOpen(false);
              setNewContact(EMPTY_CONTACT);
            }}
          >
            Cerrar
          </Button>
        }
      >
        {drawerMember && (
          <DrawerContent
            member={drawerMember}
            puedeEditar={puedeEditar}
            addContactOpen={addContactOpen}
            newContact={newContact}
            onToggleAddContact={() => setAddContactOpen((v) => !v)}
            onNewContactChange={setNewContact}
            onAddContact={() => void addContact()}
            onCancelContact={() => { setAddContactOpen(false); setNewContact(EMPTY_CONTACT); }}
            onRemoveContact={(i) => void removeContact(i)}
          />
        )}
      </Modal>

      {/* ------------------------------------------------------------------ */}
      {/* Add member modal                                                     */}
      {/* ------------------------------------------------------------------ */}
      <Modal
        open={addMemberOpen}
        title="Añadir miembro al equipo"
        onClose={() => { setAddMemberOpen(false); resetAddMemberForm(); }}
        footer={
          <>
            <Button variant="outline" onClick={() => { setAddMemberOpen(false); resetAddMemberForm(); }}>
              Cancelar
            </Button>
            <Button
              disabled={!canSubmitMember}
              onClick={() => void addMember()}
            >
              Añadir
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {/* Type selector */}
          <div className="opera-field">
            <label className="opera-label">Tipo de miembro</label>
            <div className="flex gap-2">
              <button
                type="button"
                className={`btn btn-sm ${memberType === 'customer' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => {
                  setMemberType('customer');
                  setSelectedPerson(null);
                  setSearchQuery('');
                  setSearchResults([]);
                }}
              >
                Jugador (socio)
              </button>
              <button
                type="button"
                className={`btn btn-sm ${memberType === 'employee' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => {
                  setMemberType('employee');
                  setSelectedPerson(null);
                  setSearchQuery('');
                  setSearchResults([]);
                }}
              >
                Entrenador / Staff
              </button>
            </div>
          </div>

          {/* Person search */}
          <div className="opera-field">
            <label className="opera-label">
              {memberType === 'customer' ? 'Buscar socio' : 'Buscar empleado'}
            </label>
            {selectedPerson ? (
              <div className="flex items-center justify-between rounded-lg bg-white/5 p-2 text-sm">
                <span className="text-white">
                  {nombreCompleto(selectedPerson.nombre, selectedPerson.apellido)}
                </span>
                <button
                  type="button"
                  className="text-[var(--panel-muted)] hover:text-[var(--hover-text)] text-xs ml-3"
                  onClick={() => { setSelectedPerson(null); setSearchQuery(''); }}
                >
                  Cambiar
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  className="opera-control"
                  placeholder="Escribe al menos 2 caracteres para buscar..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchResults.length > 0 && (
                  <ul className="absolute z-10 w-full mt-1 rounded-lg border border-white/10 bg-[var(--panel-card)] overflow-auto max-h-40">
                    {searchResults.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm text-white hover:bg-[var(--hover-bg)]"
                          onClick={() => {
                            setSelectedPerson(p);
                            setSearchQuery('');
                            setSearchResults([]);
                          }}
                        >
                          {nombreCompleto(p.nombre, p.apellido)}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* Minor age warning */}
          {selectedEsMenor && (
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-amber-400 text-sm">
              ⚠️ Socio menor de edad ({selectedEdad} años). Añade al menos un contacto de
              emergencia antes de continuar.
            </div>
          )}

          {/* Position / role */}
          <div className="opera-field">
            <label className="opera-label">
              {memberType === 'employee' ? 'Rol de staff' : 'Posición'}
            </label>
            {memberType === 'employee' ? (
              <select
                className="opera-control"
                value={newMemberPosicion}
                onChange={(e) => setNewMemberPosicion(e.target.value)}
              >
                <option value="">— Seleccionar rol —</option>
                {STAFF_ROLES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            ) : positions ? (
              <select
                className="opera-control"
                value={newMemberPosicion}
                onChange={(e) => setNewMemberPosicion(e.target.value)}
              >
                <option value="">— Seleccionar posición —</option>
                {positions.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                className="opera-control"
                placeholder="Posición (texto libre)"
                value={newMemberPosicion}
                onChange={(e) => setNewMemberPosicion(e.target.value)}
              />
            )}
          </div>

          {/* Dorsal (players only) */}
          {memberType === 'customer' && (
            <div className="opera-field">
              <label className="opera-label">Dorsal (opcional)</label>
              <input
                type="text"
                className="opera-control"
                placeholder="Número de dorsal"
                value={newMemberDorsal}
                onChange={(e) => setNewMemberDorsal(e.target.value)}
              />
            </div>
          )}

          {/* Fecha de alta */}
          <div className="opera-field">
            <label className="opera-label">Fecha de alta (opcional)</label>
            <input
              type="date"
              className="opera-control"
              value={newMemberActivoDesde}
              onChange={(e) => setNewMemberActivoDesde(e.target.value)}
            />
          </div>

          {/* Emergency contacts — always shown if minor, optional otherwise */}
          {memberType === 'customer' && (selectedEsMenor || newMemberContacts.length > 0) && (
            <div className="border-t border-white/10 pt-4 space-y-3">
              <h4 className="text-sm font-medium text-white">Contactos de emergencia</h4>

              {newMemberContacts.map((c, i) => (
                <div
                  key={i}
                  className="flex items-start justify-between rounded-lg bg-white/5 p-2 text-sm"
                >
                  <div>
                    <p className="text-white">{c.nombre}</p>
                    <p className="text-[var(--panel-muted)]">
                      {c.relacion} · {c.telefono}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="text-red-400 hover:text-red-300 text-xs ml-3"
                    onClick={() =>
                      setNewMemberContacts((cs) => cs.filter((_, j) => j !== i))
                    }
                  >
                    Quitar
                  </button>
                </div>
              ))}

              <div className="rounded-lg bg-white/5 p-3 space-y-2">
                <div className="opera-field">
                  <label className="opera-label">Nombre del contacto</label>
                  <input
                    type="text"
                    className="opera-control"
                    value={newContactField.nombre}
                    onChange={(e) =>
                      setNewContactField((c) => ({ ...c, nombre: e.target.value }))
                    }
                  />
                </div>
                <div className="opera-field">
                  <label className="opera-label">Teléfono</label>
                  <input
                    type="text"
                    className="opera-control"
                    value={newContactField.telefono}
                    onChange={(e) =>
                      setNewContactField((c) => ({ ...c, telefono: e.target.value }))
                    }
                  />
                </div>
                <div className="opera-field">
                  <label className="opera-label">Relación</label>
                  <input
                    type="text"
                    className="opera-control"
                    placeholder="Padre, madre, tutor..."
                    value={newContactField.relacion}
                    onChange={(e) =>
                      setNewContactField((c) => ({ ...c, relacion: e.target.value }))
                    }
                  />
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (!newContactField.nombre || !newContactField.telefono) return;
                    setNewMemberContacts((cs) => [...cs, newContactField]);
                    setNewContactField(EMPTY_CONTACT);
                  }}
                >
                  <Plus className="h-3 w-3 mr-1" /> Añadir contacto
                </Button>
              </div>
            </div>
          )}

          {/* Hard block: minor + 0 contacts */}
          {selectedEsMenor && newMemberContacts.length === 0 && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-red-400 text-sm">
              No se puede añadir: el socio es menor de edad y no tiene contactos de
              emergencia.
            </div>
          )}
        </div>
      </Modal>

      {/* ------------------------------------------------------------------ */}
      {/* Edit member modal                                                    */}
      {/* ------------------------------------------------------------------ */}
      <EditMemberModal
        open={!!editMemberId}
        deporte={team?.deporte ?? 'OTRO'}
        target={
          editingMember
            ? (() => {
                const person = editingMember.customer ?? editingMember.employee;
                return {
                  id: person?.id ?? '',
                  isStaff: !!editingMember.employee,
                  nombre: person?.nombre ?? '—',
                  apellido: person?.apellido,
                  imagenUrl: person?.imagenUrl,
                  posicion: editingMember.posicion,
                  dorsal: editingMember.dorsal,
                  activoDesde: editingMember.activoDesde,
                } satisfies EditMemberTarget;
              })()
            : null
        }
        onSubmit={(values) => editMemberId && void patchMember(editMemberId, values)}
        onUploaded={() => void fetchTeam()}
        onClose={() => setEditMemberId(null)}
      />
    </ModuleGuard>
  );
}

// ---------------------------------------------------------------------------
// DrawerContent — extracted to avoid IIFE in JSX
// ---------------------------------------------------------------------------

type DrawerContentProps = {
  member: TeamMember;
  puedeEditar: boolean;
  addContactOpen: boolean;
  newContact: ContactoEmergencia;
  onToggleAddContact: () => void;
  onNewContactChange: (c: ContactoEmergencia) => void;
  onAddContact: () => void;
  onCancelContact: () => void;
  onRemoveContact: (i: number) => void;
};

function DrawerContent({
  member,
  puedeEditar,
  addContactOpen,
  newContact,
  onToggleAddContact,
  onNewContactChange,
  onAddContact,
  onCancelContact,
  onRemoveContact,
}: DrawerContentProps) {
  const person = member.customer ?? member.employee;
  const nombre = person?.nombre ?? '—';
  const apellido = person?.apellido;
  const edad = member.customer ? calcEdad(member.customer.fechaNacimiento) : null;
  const esMenor = edad !== null && edad < 18;
  const contactos = member.contactosEmergencia ?? [];

  return (
    <div className="space-y-4">
      {/* Avatar + name */}
      <div className="flex items-center gap-4">
        <div className="h-20 w-20 rounded-full bg-[var(--acc)]/20 flex items-center justify-center text-2xl font-bold text-white border border-white/10 overflow-hidden flex-shrink-0">
          {person?.imagenUrl ? (
            <img
              src={person.imagenUrl}
              alt={nombre}
              className="h-full w-full object-cover"
            />
          ) : (
            initiales(nombre, apellido)
          )}
        </div>
        <div>
          <h3 className="text-lg font-bold text-white">{nombreCompleto(nombre, apellido)}</h3>
          <p className="text-sm text-[var(--panel-muted)]">{member.rol}</p>
        </div>
      </div>

      {/* Minor age banner */}
      {esMenor && (
        <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-amber-400 text-sm">
          ⚠️ Menor de edad — {edad} años
        </div>
      )}

      {/* Customer details */}
      {member.customer && (
        <div className="grid grid-cols-2 gap-3 text-sm">
          {edad !== null && (
            <div>
              <span className="text-[var(--panel-muted)]">Edad</span>
              <p className="text-white">{edad} años</p>
            </div>
          )}
          {member.customer.fechaNacimiento && (
            <div>
              <span className="text-[var(--panel-muted)]">Fecha de nacimiento</span>
              <p className="text-white">
                {new Date(member.customer.fechaNacimiento).toLocaleDateString('es-ES')}
              </p>
            </div>
          )}
          {member.customer.telefono && (
            <div>
              <span className="text-[var(--panel-muted)]">Teléfono</span>
              <p className="text-white">{member.customer.telefono}</p>
            </div>
          )}
          {member.customer.email && (
            <div>
              <span className="text-[var(--panel-muted)]">Email</span>
              <p className="text-white">{member.customer.email}</p>
            </div>
          )}
          {member.customer.direccion && (
            <div className="col-span-2">
              <span className="text-[var(--panel-muted)]">Dirección</span>
              <p className="text-white">{member.customer.direccion}</p>
            </div>
          )}
        </div>
      )}

      {/* Employee details */}
      {member.employee && member.employee.rol && (
        <div className="text-sm">
          <span className="text-[var(--panel-muted)]">Rol</span>
          <p className="text-white">{member.employee.rol}</p>
        </div>
      )}

      {/* Position & dorsal */}
      {(member.posicion || member.dorsal) && (
        <div className="grid grid-cols-2 gap-3 text-sm">
          {member.posicion && (
            <div>
              <span className="text-[var(--panel-muted)]">Posición</span>
              <p className="text-white">{member.posicion}</p>
            </div>
          )}
          {member.dorsal && (
            <div>
              <span className="text-[var(--panel-muted)]">Dorsal</span>
              <p className="text-white">#{member.dorsal}</p>
            </div>
          )}
        </div>
      )}

      {/* Emergency contacts */}
      <div className="border-t border-white/10 pt-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-medium text-white">
            Contactos de emergencia
            <span className="ml-2 text-[var(--panel-muted)] font-normal">
              ({contactos.length})
            </span>
          </h4>
          {puedeEditar && (
            <Button variant="outline" onClick={onToggleAddContact}>
              <Plus className="h-3 w-3 mr-1" /> Añadir
            </Button>
          )}
        </div>

        {/* Warning: minor + 0 contacts */}
        {esMenor && contactos.length === 0 && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-red-400 text-sm mb-3">
            Este jugador es menor de edad y no tiene contactos de emergencia.
          </div>
        )}

        {/* Contact list */}
        {contactos.map((c, i) => (
          <div
            key={i}
            className="flex items-start justify-between rounded-lg bg-white/5 p-3 mb-2 text-sm"
          >
            <div>
              <p className="font-medium text-white">{c.nombre}</p>
              <p className="text-[var(--panel-muted)]">
                {c.relacion} · {c.telefono}
              </p>
            </div>
            {puedeEditar && (
              <IconButton title="Eliminar contacto" danger onClick={() => onRemoveContact(i)}>
                <Trash2 className="h-3 w-3" />
              </IconButton>
            )}
          </div>
        ))}

        {/* Inline add contact form */}
        {addContactOpen && (
          <div className="rounded-lg bg-white/5 p-3 space-y-2 mt-2">
            <div className="opera-field">
              <label className="opera-label">Nombre *</label>
              <input
                type="text"
                className="opera-control"
                value={newContact.nombre}
                onChange={(e) =>
                  onNewContactChange({ ...newContact, nombre: e.target.value })
                }
              />
            </div>
            <div className="opera-field">
              <label className="opera-label">Teléfono *</label>
              <input
                type="text"
                className="opera-control"
                value={newContact.telefono}
                onChange={(e) =>
                  onNewContactChange({ ...newContact, telefono: e.target.value })
                }
              />
            </div>
            <div className="opera-field">
              <label className="opera-label">Relación</label>
              <input
                type="text"
                className="opera-control"
                placeholder="Padre, madre, tutor..."
                value={newContact.relacion}
                onChange={(e) =>
                  onNewContactChange({ ...newContact, relacion: e.target.value })
                }
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={onAddContact}>Guardar</Button>
              <Button variant="outline" onClick={onCancelContact}>Cancelar</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
