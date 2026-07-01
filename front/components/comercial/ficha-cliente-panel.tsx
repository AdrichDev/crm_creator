'use client';
import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/primitives';
import { useDialog } from '@/components/ui/dialog-provider';
import { Navigation, MapPin, Plus, Repeat } from 'lucide-react';
import type { ComercialCustomer, VisitStateDto, VisitDto, CustomerNoteDto, ReminderDto } from '@/lib/comercial/types';
import { EstadoVisitaBadge } from './estado-visita-badge';
import { AbcBadge } from './abc-badge';
import { buildRouteUrl } from '@/lib/comercial/maps-link';
import {
  fetchNotes, createNote, fetchVisits, createVisit, fetchReminders, createReminder, patchReminder,
  patchCustomer, convertProspect,
} from '@/lib/comercial/api';

interface Props {
  customer: ComercialCustomer | null;
  visitStates: VisitStateDto[];
  canWrite: boolean;
  onClose: () => void;
  onChanged: () => void;
}

type Tab = 'datos' | 'notas' | 'visitas' | 'recordatorios';

export function FichaClientePanel({ customer, visitStates, canWrite, onClose, onChanged }: Props) {
  const [tab, setTab] = useState<Tab>('datos');
  const [notes, setNotes] = useState<CustomerNoteDto[]>([]);
  const [visits, setVisits] = useState<VisitDto[]>([]);
  const [reminders, setReminders] = useState<ReminderDto[]>([]);
  const [notaTxt, setNotaTxt] = useState('');
  const [visitForm, setVisitForm] = useState({ resultado: '', nota: '', proximaAccion: '', estadoPosteriorId: '' });
  const [remForm, setRemForm] = useState({ titulo: '', descripcion: '', fechaPrevista: '' });
  const [busy, setBusy] = useState(false);
  const dialog = useDialog();

  // Envuelve mutaciones: ante error de API muestra aviso en vez de silenciarlo.
  async function safe(fn: () => Promise<void>): Promise<void> {
    try { await fn(); } catch (e) { void dialog.alert(e instanceof Error ? e.message : 'No se pudo completar la operación'); }
  }

  useEffect(() => {
    if (!customer) return;
    setTab('datos');
    void reload(customer.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.id]);

  async function reload(id: string) {
    const [n, v, r] = await Promise.all([fetchNotes(id), fetchVisits(id), fetchReminders(id)]);
    setNotes(n); setVisits(v); setReminders(r);
  }

  if (!customer) return null;
  const routeUrl = buildRouteUrl(customer);

  async function changeEstado(estadoVisitaId: string) {
    setBusy(true);
    await safe(async () => { await patchCustomer(customer!.id, { estadoVisitaId }); onChanged(); });
    setBusy(false);
  }
  async function changeAbc(categoriaAbc: string) {
    setBusy(true);
    await safe(async () => { await patchCustomer(customer!.id, { categoriaAbc: categoriaAbc || null }); onChanged(); });
    setBusy(false);
  }
  async function addNota() {
    if (!notaTxt.trim()) return;
    await safe(async () => { await createNote(customer!.id, notaTxt.trim()); setNotaTxt(''); await reload(customer!.id); });
  }
  async function addVisita() {
    await safe(async () => {
      await createVisit({ customerId: customer!.id, ...visitForm, estadoPosteriorId: visitForm.estadoPosteriorId || undefined });
      setVisitForm({ resultado: '', nota: '', proximaAccion: '', estadoPosteriorId: '' });
      await reload(customer!.id); onChanged();
    });
  }
  async function addRecordatorio() {
    if (!remForm.titulo.trim()) return;
    await safe(async () => {
      await createReminder({ customerId: customer!.id, ...remForm, fechaPrevista: remForm.fechaPrevista || undefined });
      setRemForm({ titulo: '', descripcion: '', fechaPrevista: '' });
      await reload(customer!.id);
    });
  }
  async function toggleReminder(r: ReminderDto) {
    await safe(async () => { await patchReminder(r.id, { estado: r.estado === 'DONE' ? 'PENDING' : 'DONE' }); await reload(customer!.id); });
  }
  async function convertir() {
    await safe(async () => { await convertProspect(customer!.id); onChanged(); });
  }

  const selCls = 'rounded-lg bg-black/30 border border-white/10 px-2 py-1 text-sm text-white';
  const inputCls = 'w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm text-white';

  return (
    <Modal open={!!customer} title={customer.nombre} onClose={onClose}
      footer={<Button variant="outline" onClick={onClose}>Cerrar</Button>}>
      <div className="space-y-4">
        {/* Cabecera: estado, ABC, tipo, ruta */}
        <div className="flex flex-wrap items-center gap-2">
          <EstadoVisitaBadge estado={customer.estadoVisita} />
          <AbcBadge categoria={customer.categoriaAbc} />
          {customer.tipoRegistro === 'PROSPECTO' && (
            <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400">Prospecto</span>
          )}
          {customer.geoEstado !== 'OK' && (
            <span className="inline-flex items-center gap-1 rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-xs text-red-400">
              <MapPin className="h-3 w-3" /> Sin geolocalizar
            </span>
          )}
          <div className="ml-auto">
            {routeUrl ? (
              <a href={routeUrl} target="_blank" rel="noopener noreferrer"
                 className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500">
                <Navigation className="h-4 w-4" /> Ir
              </a>
            ) : (
              <button disabled title="Falta dirección o coordenadas"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-[var(--panel-muted)] opacity-60 cursor-not-allowed">
                <Navigation className="h-4 w-4" /> Ir
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-white/10 text-sm">
          {(['datos', 'notas', 'visitas', 'recordatorios'] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-2 capitalize ${tab === t ? 'text-white border-b-2 border-[var(--acc)]' : 'text-[var(--panel-muted)]'}`}>
              {t}{t === 'notas' ? ` (${notes.length})` : t === 'visitas' ? ` (${visits.length})` : t === 'recordatorios' ? ` (${reminders.length})` : ''}
            </button>
          ))}
        </div>

        {tab === 'datos' && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              {([['email', 'Email'], ['telefono', 'Teléfono'], ['direccion', 'Dirección'], ['localidad', 'Localidad'], ['provincia', 'Provincia'], ['ultimaVisita', 'Última visita']] as const).map(([k, label]) => (
                <div key={k}>
                  <span className="text-[var(--panel-muted)]">{label}</span>
                  <p className="text-white">{String((customer as unknown as Record<string, unknown>)[k] ?? '') || '—'}</p>
                </div>
              ))}
            </div>
            {canWrite && (
              <div className="flex flex-wrap items-end gap-4 border-t border-white/10 pt-3">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-[var(--panel-muted)]">Estado de visita</span>
                  <select className={selCls} disabled={busy} value={customer.estadoVisitaId ?? ''} onChange={(e) => changeEstado(e.target.value)}>
                    <option value="">— Sin estado —</option>
                    {visitStates.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-[var(--panel-muted)]">Categoría ABC</span>
                  <select className={selCls} disabled={busy} value={customer.categoriaAbc ?? ''} onChange={(e) => changeAbc(e.target.value)}>
                    <option value="">— Sin categoría —</option>
                    <option value="A">Cliente A</option>
                    <option value="B">Cliente B</option>
                    <option value="C">Cliente C</option>
                  </select>
                </label>
                {customer.tipoRegistro === 'PROSPECTO' && (
                  <Button variant="outline" onClick={convertir}><Repeat className="h-4 w-4" /> Convertir en cliente</Button>
                )}
              </div>
            )}
          </div>
        )}

        {tab === 'notas' && (
          <div className="space-y-3">
            {canWrite && (
              <div className="flex gap-2">
                <input className={inputCls} placeholder="Nueva nota..." value={notaTxt} onChange={(e) => setNotaTxt(e.target.value)} />
                <Button onClick={addNota}><Plus className="h-4 w-4" /> Añadir</Button>
              </div>
            )}
            <ul className="space-y-2">
              {notes.length === 0 && <li className="text-sm text-[var(--panel-muted)]">Sin notas.</li>}
              {notes.map((n) => (
                <li key={n.id} className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm">
                  <p className="text-white whitespace-pre-wrap">{n.texto}</p>
                  <p className="mt-1 text-xs text-[var(--panel-muted)]">{new Date(n.createdAt).toLocaleString('es-ES')} · {n.origen.toLowerCase()}</p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {tab === 'visitas' && (
          <div className="space-y-3">
            {canWrite && (
              <div className="space-y-2 rounded-lg border border-white/10 p-3">
                <input className={inputCls} placeholder="Resultado de la visita" value={visitForm.resultado} onChange={(e) => setVisitForm({ ...visitForm, resultado: e.target.value })} />
                <input className={inputCls} placeholder="Nota (opcional)" value={visitForm.nota} onChange={(e) => setVisitForm({ ...visitForm, nota: e.target.value })} />
                <input className={inputCls} placeholder="Próxima acción (opcional)" value={visitForm.proximaAccion} onChange={(e) => setVisitForm({ ...visitForm, proximaAccion: e.target.value })} />
                <div className="flex items-center gap-2">
                  <select className={selCls} value={visitForm.estadoPosteriorId} onChange={(e) => setVisitForm({ ...visitForm, estadoPosteriorId: e.target.value })}>
                    <option value="">Estado tras la visita (opcional)</option>
                    {visitStates.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                  </select>
                  <Button onClick={addVisita}><Plus className="h-4 w-4" /> Registrar visita</Button>
                </div>
              </div>
            )}
            <ul className="space-y-2">
              {visits.length === 0 && <li className="text-sm text-[var(--panel-muted)]">Sin visitas registradas.</li>}
              {visits.map((v) => (
                <li key={v.id} className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm">
                  <p className="text-white">{v.resultado ?? 'Visita'}</p>
                  {v.nota && <p className="text-[var(--panel-muted)]">{v.nota}</p>}
                  {v.proximaAccion && <p className="text-xs text-amber-400">Próxima acción: {v.proximaAccion}</p>}
                  <p className="mt-1 text-xs text-[var(--panel-muted)]">{new Date(v.fecha).toLocaleString('es-ES')}</p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {tab === 'recordatorios' && (
          <div className="space-y-3">
            {canWrite && (
              <div className="space-y-2 rounded-lg border border-white/10 p-3">
                <input className={inputCls} placeholder="Título del recordatorio" value={remForm.titulo} onChange={(e) => setRemForm({ ...remForm, titulo: e.target.value })} />
                <input className={inputCls} placeholder="Descripción (opcional)" value={remForm.descripcion} onChange={(e) => setRemForm({ ...remForm, descripcion: e.target.value })} />
                <div className="flex items-center gap-2">
                  <input type="date" className={selCls} value={remForm.fechaPrevista} onChange={(e) => setRemForm({ ...remForm, fechaPrevista: e.target.value })} />
                  <Button onClick={addRecordatorio}><Plus className="h-4 w-4" /> Crear</Button>
                </div>
              </div>
            )}
            <ul className="space-y-2">
              {reminders.length === 0 && <li className="text-sm text-[var(--panel-muted)]">Sin recordatorios.</li>}
              {reminders.map((r) => {
                const vencido = r.estado === 'PENDING' && r.fechaPrevista && new Date(r.fechaPrevista) < new Date();
                return (
                  <li key={r.id} className="flex items-start gap-2 rounded-lg border border-white/10 bg-black/20 p-3 text-sm">
                    <input type="checkbox" checked={r.estado === 'DONE'} onChange={() => toggleReminder(r)} className="mt-1" disabled={!canWrite} />
                    <div className="flex-1">
                      <p className={`text-white ${r.estado === 'DONE' ? 'line-through opacity-60' : ''}`}>{r.titulo}</p>
                      {r.descripcion && <p className="text-[var(--panel-muted)]">{r.descripcion}</p>}
                      {r.fechaPrevista && (
                        <p className={`text-xs ${vencido ? 'text-red-400' : 'text-[var(--panel-muted)]'}`}>
                          {new Date(r.fechaPrevista).toLocaleDateString('es-ES')}{vencido ? ' · vencido' : ''}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}
