'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/primitives';
import { apiFetch, isApiEnabled } from '@/lib/api/client';
import type { Cliente, Pedido } from '@/lib/mock/data';

const eur = (n: number) => n.toFixed(2) + ' €';
const toNum = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/** Nombre COMERCIAL del cliente (razón social del tenant); cae a `nombre` (persona de
 *  contacto) si el cliente no tiene razón social registrada. El combobox de vinculación
 *  debe mostrar/buscar por este nombre, no por la persona de contacto. */
const nombreComercial = (c: Pick<Cliente, 'nombre' | 'razonSocial'>): string => c.razonSocial || c.nombre || '';

/** Dirección completa en una sola línea, separada por comas: calle, número, CP, localidad.
 *  Ej. "Avenida Canillejas a Vicálvaro, 120, 28022, Madrid". Omite partes vacías. */
function direccionCompleta(c: Pick<Cliente, 'direccion' | 'numero' | 'codigoPostal' | 'localidad'>): string {
  return [c.direccion, c.numero, c.codigoPostal, c.localidad].filter((p) => p && String(p).trim()).join(', ');
}

/** Fila de servicio del back (GET /services → crm.servicio) usada como concepto. */
interface ServiceApiRow { id: string; nombre: string; descripcion?: string | null; categoria?: string | null; precio: number | string; }

/** Servicio real → ConceptoRow: precio único como pago único (precioImpl); la columna
 *  mensual (precioMant) queda a 0 — el modelo Service no lleva precio recurrente. */
function serviceToConcepto(s: ServiceApiRow): ConceptoRow {
  return {
    id: String(s.id), nombre: s.nombre, descripcion: s.descripcion ?? s.categoria ?? '',
    precioImpl: Number(s.precio) || 0, precioMant: 0, selected: false, cantidad: 1,
  };
}

/** Funde el catálogo del back con las líneas ya seleccionadas del draft (edición):
 *  preserva selected/cantidad/precios/nombre de las marcadas y añade las líneas
 *  manuales del draft que no existan en el catálogo del negocio. */
function mergeCatalog(catalog: ConceptoRow[], draft: ConceptoRow[]): ConceptoRow[] {
  const selectedById = new Map(draft.filter((c) => c.selected).map((c) => [c.id, c]));
  const merged = catalog.map((c) => {
    const sel = selectedById.get(c.id);
    return sel ? { ...c, selected: true, cantidad: sel.cantidad, precioImpl: sel.precioImpl, precioMant: sel.precioMant, nombre: sel.nombre, descripcion: sel.descripcion || c.descripcion } : c;
  });
  const catalogIds = new Set(catalog.map((c) => c.id));
  for (const sel of selectedById.values()) if (!catalogIds.has(sel.id)) merged.push(sel);
  return merged;
}

/** Emisor (datos fiscales) persistidos por el negocio; espejo de `IssuerData` de AA. */
export interface Emisor { empresa: string; cif: string; direccion: string; email: string; telefono: string; }

/** Concepto seleccionable (catálogo de servicios adaptado al modelo de líneas de AA). */
export interface ConceptoRow { id: string; nombre: string; descripcion: string; precioImpl: number; precioMant: number; selected: boolean; cantidad: number; }

/** Estado inicial del formulario (alta nueva o edición de un presupuesto existente). */
export interface PedidoDraft {
  linkedClientId: string;
  clientName: string;
  clientRazonSocial: string;
  clientCif: string;
  clientAddress: string;
  clientEmail: string;
  clientPhone: string;
  clientContact: string;
  numero: string;
  conceptos: ConceptoRow[];
}

interface PedidoFormProps {
  draft: PedidoDraft;
  clientsList: Cliente[];
  emisor: Emisor;
  saving: boolean;
  /** true → edición de un presupuesto existente (PATCH); false/undefined → alta (POST). */
  editing?: boolean;
  onSaveEmisor: (e: Emisor) => void;
  onCancel: () => void;
  onGenerate: (pedido: Omit<Pedido, 'id'>) => void;
}

const IVA = 0.21;

/**
 * Alta de pedido/presupuesto para CRM (crm-paridad-facturas-pedidos-aa, Fase 3, tasks 3.1/3.2).
 *
 * Espejo VISUAL y FUNCIONAL de `agents-agency/front/components/facturacion/BudgetForm.tsx`
 * (design.md § decisión 4), adaptado al sistema de diseño del CRM (clases `opera-*`, `panel`,
 * primitivas): emisor con edición inline, combobox de vinculación de cliente, datos del cliente,
 * conceptos con cantidad y totales pago único + mensualidad con IVA. El catálogo del CRM
 * (`servicios`) es de precio único → se usa como "pago único" (precioImpl); la columna mensual
 * se conserva por paridad de modelo. Los totales se calculan también en cliente para el
 * preview inmediato; en modo API el back los RECALCULA server-side (fuente de verdad).
 */
export function PedidoForm({ draft, clientsList, emisor, saving, editing, onSaveEmisor, onCancel, onGenerate }: PedidoFormProps) {
  // Emisor (edición inline).
  const [editingEmisor, setEditingEmisor] = useState(false);
  const [tmp, setTmp] = useState<Emisor>(emisor);

  // Cliente.
  const [linkedClientId, setLinkedClientId] = useState(draft.linkedClientId);
  const [clientName, setClientName] = useState(draft.clientName);
  const [clientRazonSocial, setClientRazonSocial] = useState(draft.clientRazonSocial);
  const [clientCif, setClientCif] = useState(draft.clientCif);
  const [clientAddress, setClientAddress] = useState(draft.clientAddress);
  const [clientEmail, setClientEmail] = useState(draft.clientEmail);
  const [clientPhone, setClientPhone] = useState(draft.clientPhone);
  const [clientContact, setClientContact] = useState(draft.clientContact);
  const [numero, setNumero] = useState(draft.numero);

  // Combobox de vinculación (búsqueda filtrable). Busca/muestra el nombre COMERCIAL
  // (razón social del tenant), no la persona de contacto.
  const initialLinked = clientsList.find((c) => String(c.id) === draft.linkedClientId);
  const [clientSearch, setClientSearch] = useState(initialLinked ? nombreComercial(initialLinked) : '');
  const [showList, setShowList] = useState(false);
  const filtered = clientSearch.trim()
    ? clientsList.filter((c) => {
        const q = clientSearch.toLowerCase();
        return nombreComercial(c).toLowerCase().includes(q) || (c.cif ?? '').toLowerCase().includes(q);
      })
    : clientsList;

  // Conceptos.
  const [conceptos, setConceptos] = useState<ConceptoRow[]>(draft.conceptos);

  // En modo API el catálogo de conceptos son los servicios REALES del negocio
  // (GET /services → crm.servicio), no la colección localStorage `servicios` que sólo
  // vive en modo generador. Sin esto, los 22 servicios sembrados (interiorismo/paisajismo)
  // no eran seleccionables al construir un presupuesto en modo API. En edición, se preservan
  // las líneas ya marcadas del draft. En modo generador/mock se conserva draft.conceptos.
  useEffect(() => {
    if (!isApiEnabled()) return;
    let cancelled = false;
    apiFetch<{ items: ServiceApiRow[] }>('/services?limit=100')
      .then((r) => { if (!cancelled) setConceptos(mergeCatalog((r.items ?? []).map(serviceToConcepto), draft.conceptos)); })
      .catch(() => { /* fallback: se mantiene draft.conceptos */ });
    return () => { cancelled = true; };
  }, [draft]);

  const linkClient = (id: string) => {
    setLinkedClientId(id);
    if (!id) { setClientSearch(''); return; }
    const c = clientsList.find((cl) => String(cl.id) === id);
    if (!c) return;
    setClientName(c.nombre || '');
    setClientRazonSocial(c.razonSocial || c.nombre || '');
    setClientCif(c.cif || '');
    // Dirección completa (calle, número, CP, localidad) en una sola línea, separada por
    // comas — cae a `c.direccion` sola si el cliente no tiene los campos estructurados.
    setClientAddress(direccionCompleta(c) || c.direccion || '');
    setClientEmail(c.email || '');
    setClientPhone(c.telefono || '');
    setClientContact(c.contacto || c.nombre || '');
    setClientSearch(nombreComercial(c));
    setShowList(false);
  };

  const toggle = (id: string) => setConceptos((cs) => cs.map((c) => (c.id === id ? { ...c, selected: !c.selected } : c)));
  const setQty = (id: string, q: number) => setConceptos((cs) => cs.map((c) => (c.id === id ? { ...c, cantidad: Math.max(1, toNum(q) || 1) } : c)));

  const selected = conceptos.filter((c) => c.selected);
  const subtotalImpl = selected.reduce((a, c) => a + toNum(c.precioImpl) * toNum(c.cantidad), 0);
  const subtotalMant = selected.reduce((a, c) => a + toNum(c.precioMant) * toNum(c.cantidad), 0);
  const totalImpl = subtotalImpl * (1 + IVA);
  const totalMant = subtotalMant * (1 + IVA);

  const canGenerate = clientName.trim().length > 0 && selected.length > 0 && numero.trim().length > 0;

  const saveEmisor = () => { onSaveEmisor(tmp); setEditingEmisor(false); };

  const handleGenerate = () => {
    if (!canGenerate) return;
    const pedido: Omit<Pedido, 'id'> = {
      numero,
      customerId: linkedClientId || null,
      clienteSnapshot: { nombre: clientName, razonSocial: clientRazonSocial, cif: clientCif, direccion: clientAddress, email: clientEmail, telefono: clientPhone, contacto: clientContact },
      emisorSnapshot: { empresa: emisor.empresa, cif: emisor.cif, direccion: emisor.direccion, email: emisor.email, telefono: emisor.telefono },
      estado: 'generada',
      subtotalImpl, subtotalMant, totalImpl, totalMant,
      tasaIva: IVA,
      diasValidez: 30,
      notas: null,
      lines: selected.map((c) => ({ servicioId: c.id, nombre: c.nombre, descripcion: c.descripcion, cantidad: c.cantidad, precioImpl: c.precioImpl, precioMant: c.precioMant })),
      createdAt: new Date().toISOString(),
    };
    onGenerate(pedido);
  };

  return (
    <div className="w-full">
      <div className="panel-header">
        <div>
          <h1>{editing ? 'Editar presupuesto' : 'Nuevo presupuesto'}</h1>
          <p className="subtitle">Presupuesto comercial documental, con vista previa imprimible.</p>
        </div>
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Emisor — UI/UX espejo de agents-agency BudgetForm (mismo layout/iconos,
            adaptado a los tokens de tema del CRM en vez de los colores fijos de AA). */}
        <div className="panel flex flex-col gap-5 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--panel-muted)]">Datos del emisor</h2>
            {!editingEmisor && (
              <button className="text-xs font-semibold text-[var(--acc)] transition hover:opacity-80"
                onClick={() => { setTmp(emisor); setEditingEmisor(true); }}>✏️ Editar</button>
            )}
          </div>
          {editingEmisor ? (
            <div className="space-y-3">
              {([['empresa', 'Empresa'], ['cif', 'NIF/CIF'], ['direccion', 'Dirección'], ['email', 'Email'], ['telefono', 'Teléfono']] as const).map(([k, label]) => (
                <div key={k}>
                  <label className="mb-0.5 block text-[10px] font-medium text-[var(--panel-muted)]">{label}</label>
                  <input className="opera-control !py-1.5 text-xs" value={tmp[k]} onChange={(e) => setTmp({ ...tmp, [k]: e.target.value })} />
                </div>
              ))}
              <div className="flex gap-2 pt-1">
                <Button variant="primary" onClick={saveEmisor}>Guardar</Button>
                <Button variant="outline" onClick={() => setEditingEmisor(false)}>Cancelar</Button>
              </div>
            </div>
          ) : emisor.empresa ? (
            <div className="divide-y divide-[var(--line)]">
              <p className="mb-3 text-sm font-bold text-[var(--panel-text)]">{emisor.empresa}</p>
              {[
                { icon: '🪪', val: emisor.cif },
                { icon: '📍', val: emisor.direccion },
                { icon: '✉️', val: emisor.email },
                { icon: '📞', val: emisor.telefono },
              ].filter((d) => d.val).map((d, i) => (
                <div key={i} className="flex items-center gap-2.5 py-2.5 text-xs text-[var(--panel-muted)]">
                  <span className="shrink-0">{d.icon}</span> <span>{d.val}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-6 text-center text-sm text-[var(--panel-muted)]">
              Sin datos del emisor.<br />
              <button className="mt-2 font-bold text-[var(--acc)] hover:underline" onClick={() => { setTmp(emisor); setEditingEmisor(true); }}>Configurar</button>
            </div>
          )}
        </div>

        {/* Cliente */}
        <div className="panel p-5 lg:col-span-2">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-[var(--panel-muted)]">Datos del cliente</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="relative md:col-span-2">
              <div className="opera-field">
                <label className="opera-label">Vincular a cliente existente</label>
                <input
                  className="opera-control" placeholder="Busca por nombre o CIF…" value={clientSearch}
                  onChange={(e) => { setClientSearch(e.target.value); setShowList(true); if (linkedClientId) setLinkedClientId(''); }}
                  onFocus={() => setShowList(true)}
                  onBlur={() => setTimeout(() => setShowList(false), 150)}
                />
              </div>
              {showList && (
                <ul className="absolute z-10 mt-1 max-h-40 w-full overflow-auto rounded-lg border border-white/10 bg-[var(--panel-card)]">
                  <li onMouseDown={() => linkClient('')} className="cursor-pointer px-3 py-2 text-xs text-[var(--panel-muted)] hover:bg-[var(--hover-bg)]">— Sin vincular (cliente manual) —</li>
                  {filtered.length === 0 ? (
                    <li className="px-3 py-2 text-xs text-[var(--panel-muted)]">Sin coincidencias</li>
                  ) : filtered.map((c) => (
                    <li key={c.id} onMouseDown={() => linkClient(String(c.id))} className="cursor-pointer px-3 py-2 text-sm text-[var(--panel-text)] hover:bg-[var(--hover-bg)]">
                      {/* Nombre COMERCIAL primero (razón social); la persona de contacto
                          y el CIF quedan como referencia secundaria. */}
                      {nombreComercial(c)}
                      {(c.contacto || c.cif) && (
                        <span className="text-[var(--panel-muted)]">
                          {c.contacto && c.razonSocial ? ` · ${c.contacto}` : ''}{c.cif ? ` · ${c.cif}` : ''}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="opera-field"><label className="opera-label">Nombre *</label><input className="opera-control" value={clientName} onChange={(e) => setClientName(e.target.value)} /></div>
            <div className="opera-field"><label className="opera-label">Razón Social</label><input className="opera-control" value={clientRazonSocial} onChange={(e) => setClientRazonSocial(e.target.value)} /></div>
            <div className="opera-field"><label className="opera-label">NIF / CIF</label><input className="opera-control" value={clientCif} onChange={(e) => setClientCif(e.target.value)} /></div>
            <div className="opera-field"><label className="opera-label">Nº de presupuesto *</label><input className="opera-control" value={numero} onChange={(e) => setNumero(e.target.value)} /></div>
            <div className="opera-field"><label className="opera-label">Persona de contacto</label><input className="opera-control" value={clientContact} onChange={(e) => setClientContact(e.target.value)} /></div>
            <div className="opera-field md:col-span-2"><label className="opera-label">Dirección</label><input className="opera-control" value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} /></div>
            <div className="opera-field"><label className="opera-label">Email</label><input className="opera-control" type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} /></div>
            <div className="opera-field"><label className="opera-label">Teléfono</label><input className="opera-control" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} /></div>
          </div>
        </div>
      </div>

      {/* Conceptos */}
      <div className="panel mt-4 p-5">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-[var(--panel-muted)]">Conceptos a incluir</h2>
        {conceptos.length === 0 ? (
          <p className="text-sm text-[var(--panel-muted)]">No hay servicios en el catálogo para añadir conceptos.</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {conceptos.map((c) => (
              <div key={c.id} onClick={() => toggle(c.id)}
                className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 transition ${c.selected ? 'border-[var(--acc)] bg-white/[0.04]' : 'border-white/10 hover:bg-[var(--hover-bg)]'}`}>
                <div className="flex min-w-0 items-center gap-3">
                  <input type="checkbox" checked={c.selected} onChange={() => toggle(c.id)} onClick={(e) => e.stopPropagation()} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--panel-text)]">{c.nombre}</p>
                    <p className="truncate text-xs text-[var(--panel-muted)]">{eur(c.precioImpl)}{c.descripcion ? ` · ${c.descripcion}` : ''}</p>
                  </div>
                </div>
                {c.selected && (
                  <input type="number" min={1} value={c.cantidad} onClick={(e) => e.stopPropagation()} onChange={(e) => setQty(c.id, parseInt(e.target.value, 10))}
                    className="ml-3 w-14 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-center text-xs text-[var(--panel-text)]" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Totales + generar */}
      <div className="panel mt-4 flex flex-col items-center justify-between gap-4 p-5 md:flex-row">
        <div className="flex items-center gap-8">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--panel-muted)]">Pago único (+IVA)</p>
            <p className="text-xl font-black text-[var(--panel-text)]">{eur(totalImpl)}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--panel-muted)]">Mensualidad (+IVA)</p>
            <p className="text-xl font-black text-[var(--panel-text)]">{eur(totalMant)}</p>
          </div>
        </div>
        <Button variant="primary" onClick={handleGenerate} disabled={!canGenerate || saving}>
          {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Generar presupuesto'}
        </Button>
      </div>
    </div>
  );
}
