'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/primitives';
import type { Cliente, Pedido } from '@/lib/mock/data';

const eur = (n: number) => '€' + n.toFixed(2);
const toNum = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/** Emisor (datos fiscales) persistidos por el negocio; espejo de `IssuerData` de AA. */
export interface Emisor { empresa: string; cif: string; direccion: string; email: string; telefono: string; }

/** Concepto seleccionable (catálogo de servicios adaptado al modelo de líneas de AA). */
export interface ConceptoRow { id: string; nombre: string; descripcion: string; precioImpl: number; precioMant: number; selected: boolean; cantidad: number; }

/** Estado inicial del formulario (alta nueva o nueva versión de un pedido rechazado). */
export interface PedidoDraft {
  linkedClientId: string;
  clientName: string;
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
export function PedidoForm({ draft, clientsList, emisor, saving, onSaveEmisor, onCancel, onGenerate }: PedidoFormProps) {
  // Emisor (edición inline).
  const [editingEmisor, setEditingEmisor] = useState(false);
  const [tmp, setTmp] = useState<Emisor>(emisor);

  // Cliente.
  const [linkedClientId, setLinkedClientId] = useState(draft.linkedClientId);
  const [clientName, setClientName] = useState(draft.clientName);
  const [clientCif, setClientCif] = useState(draft.clientCif);
  const [clientAddress, setClientAddress] = useState(draft.clientAddress);
  const [clientEmail, setClientEmail] = useState(draft.clientEmail);
  const [clientPhone, setClientPhone] = useState(draft.clientPhone);
  const [clientContact, setClientContact] = useState(draft.clientContact);
  const [numero, setNumero] = useState(draft.numero);

  // Combobox de vinculación (búsqueda filtrable).
  const initialLinked = clientsList.find((c) => String(c.id) === draft.linkedClientId);
  const [clientSearch, setClientSearch] = useState(initialLinked ? initialLinked.nombre : '');
  const [showList, setShowList] = useState(false);
  const filtered = clientSearch.trim()
    ? clientsList.filter((c) => {
        const q = clientSearch.toLowerCase();
        return (c.nombre ?? '').toLowerCase().includes(q) || (c.cif ?? '').toLowerCase().includes(q);
      })
    : clientsList;

  // Conceptos.
  const [conceptos, setConceptos] = useState<ConceptoRow[]>(draft.conceptos);

  const linkClient = (id: string) => {
    setLinkedClientId(id);
    if (!id) { setClientSearch(''); return; }
    const c = clientsList.find((cl) => String(cl.id) === id);
    if (!c) return;
    setClientName(c.nombre || '');
    setClientCif(c.cif || '');
    setClientAddress(c.direccion || '');
    setClientEmail(c.email || '');
    setClientPhone(c.telefono || '');
    setClientContact(c.contacto || c.nombre || '');
    setClientSearch(c.nombre);
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
      clienteSnapshot: { nombre: clientName, cif: clientCif, direccion: clientAddress, email: clientEmail, telefono: clientPhone, contacto: clientContact },
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
          <h1>Nuevo pedido</h1>
          <p className="subtitle">Presupuesto/pedido comercial documental, con vista previa imprimible.</p>
        </div>
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Emisor */}
        <div className="panel p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--panel-muted)]">Datos del emisor</h2>
            {!editingEmisor && <button className="row-action edit" onClick={() => { setTmp(emisor); setEditingEmisor(true); }}>Editar</button>}
          </div>
          {editingEmisor ? (
            <div className="space-y-2">
              {([['empresa', 'Empresa'], ['cif', 'NIF/CIF'], ['direccion', 'Dirección'], ['email', 'Email'], ['telefono', 'Teléfono']] as const).map(([k, label]) => (
                <div className="opera-field" key={k}>
                  <label className="opera-label">{label}</label>
                  <input className="opera-control" value={tmp[k]} onChange={(e) => setTmp({ ...tmp, [k]: e.target.value })} />
                </div>
              ))}
              <div className="flex gap-2 pt-1">
                <Button variant="primary" onClick={saveEmisor}>Guardar</Button>
                <Button variant="outline" onClick={() => setEditingEmisor(false)}>Cancelar</Button>
              </div>
            </div>
          ) : emisor.empresa ? (
            <div className="space-y-1 text-sm text-[var(--panel-text)]">
              <p className="font-semibold">{emisor.empresa}</p>
              {emisor.cif && <p className="text-[var(--panel-muted)]">{emisor.cif}</p>}
              {emisor.direccion && <p className="text-[var(--panel-muted)]">{emisor.direccion}</p>}
              {emisor.email && <p className="text-[var(--panel-muted)]">{emisor.email}</p>}
              {emisor.telefono && <p className="text-[var(--panel-muted)]">{emisor.telefono}</p>}
            </div>
          ) : (
            <p className="text-sm text-[var(--panel-muted)]">Sin datos del emisor. <button className="row-action edit" onClick={() => { setTmp(emisor); setEditingEmisor(true); }}>Configurar</button></p>
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
                      {c.nombre}{c.cif ? <span className="text-[var(--panel-muted)]"> · {c.cif}</span> : ''}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="opera-field"><label className="opera-label">Nombre *</label><input className="opera-control" value={clientName} onChange={(e) => setClientName(e.target.value)} /></div>
            <div className="opera-field"><label className="opera-label">NIF / CIF</label><input className="opera-control" value={clientCif} onChange={(e) => setClientCif(e.target.value)} /></div>
            <div className="opera-field"><label className="opera-label">Nº de pedido *</label><input className="opera-control" value={numero} onChange={(e) => setNumero(e.target.value)} /></div>
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
          {saving ? 'Guardando…' : 'Generar pedido'}
        </Button>
      </div>
    </div>
  );
}
