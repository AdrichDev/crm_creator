'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import { useTerm } from '@/lib/tenant-config-context';
import { Button } from '@/components/ui/primitives';
import { HoraChips } from '@/components/crm/hora-chips';
import { ServicioSelect, type ServiceOpt } from '@/components/crm/servicio-select';
import { Loader2, CalendarPlus } from 'lucide-react';

interface Opt { id: string; nombre: string }
// Cliente enriquecido: en el picker se muestra el nombre comercial de la empresa
// (fallback a razón social o persona de contacto), no la persona (crm-cita-cliente-contacto).
interface ClienteOpt { id: string; nombre: string; nombreComercial?: string; razonSocial?: string }
/** Etiqueta del cliente en el picker: nombre comercial → razón social → persona. */
function labelCliente(c: ClienteOpt): string {
  return c.nombreComercial || c.razonSocial || c.nombre;
}

export const CANALES = ['Presencial', 'Videollamada', 'Llamada'];

// Acciones comerciales predefinidas (vertical `comerciales`). El campo es un <select>
// con estas opciones (mismo chasis que el resto de selectores del modal); vacío = sin acción.
export const ACCIONES_COMERCIALES = [
  'Visita comercial',
  'Llamada de seguimiento',
  'Reunión',
  'Demostración de producto',
  'Presentación de presupuesto',
  'Firma de contrato',
  'Prospección',
  'Visita de cortesía',
];

// Construye el string canónico de `notes` para citas comerciales (acción + canal +
// comentarios). Formato FIJO (acordado con la seed paralela que puebla el mismo tenant):
// segmentos ` | `-separados, en orden Acción → Canal → Comentarios, cada uno opcional;
// ninguno presente → undefined. `comentarios` se rellena cuando el Servicio elegido es
// "Otros" (ver ServicioSelect/groupServices): una tarea sembrada sin tarifa que no
// describe por sí misma qué es la cita, así que el usuario lo explica en texto libre.
export function buildCitaNotes(accion: string, canal: string, comentarios = ''): string | undefined {
  // El separador de segmentos es ` | `: si el texto libre de cualquier campo lo contiene,
  // rompería el parseo (extractField parte por ` | `). Se colapsa cualquier `|` a `/`.
  const clean = (s: string) => s.trim().replace(/\s*\|\s*/g, ' / ');
  const parts = ([['Acción', clean(accion)], ['Canal', clean(canal)], ['Comentarios', clean(comentarios)]] as [string, string][])
    .filter(([, v]) => v);
  return parts.length ? parts.map(([label, v]) => `${label}: ${v}`).join(' | ') : undefined;
}

// Alta REAL de cita (modo CRM/Supabase): selecciona cliente/servicio/profesional
// por id + fecha/hora → POST /api/bookings (valida disponibilidad en el back).
// `canal`: solo visible en el vertical `comerciales` (reunión presencial/video);
// se guarda en `notes` con un prefijo — ver Open Question en design.md de
// crm-citas-por-sector sobre si merece columna propia en el futuro.
export function NuevaCitaModal({ open, onClose, onCreated, mostrarCanal = false, fechaInicial = '' }: { open: boolean; onClose: () => void; onCreated: () => void; mostrarCanal?: boolean; fechaInicial?: string }) {
  const [customers, setCustomers] = useState<ClienteOpt[]>([]);
  const [contactos, setContactos] = useState<Opt[]>([]);
  const [services, setServices] = useState<ServiceOpt[]>([]);
  const [employees, setEmployees] = useState<Opt[]>([]);
  const [locationId, setLocationId] = useState('');
  // customerId XOR contactoId: la cita es de un cliente O de un contacto/lead, nunca ambos.
  const [form, setForm] = useState({ customerId: '', contactoId: '', serviceId: '', employeeId: '', fecha: '', hora: '', canal: CANALES[0], accion: '', comentarios: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  // Fallback WU3: si GET /bookings/slots falla, se degrada al <input type="time"> de siempre.
  const [chipsFallback, setChipsFallback] = useState(false);
  const termCliente = useTerm('clientes', 'Cliente');
  const termEmpleado = useTerm('empleados', 'Profesional');

  useEffect(() => {
    if (!open) return;
    setError(''); setChipsFallback(false);
    // Prellena la fecha con el día seleccionado en la agenda (editable). Vacío → sin fecha.
    setForm({ customerId: '', contactoId: '', serviceId: '', employeeId: '', fecha: fechaInicial, hora: '', canal: CANALES[0], accion: '', comentarios: '' });
    // Los endpoints devuelven { items, total, page, limit } tras añadir paginación server-side.
    // `limit=100` en servicios y empleados: el catálogo real del negocio supera las 20 filas
    // por defecto (22 servicios sembrados) y el vertical comerciales materializa al admin como
    // empleado — sin subir el límite, la página 1 dejaría fuera servicios o al propio admin.
    Promise.all([
      apiFetch<{ items: ClienteOpt[] }>('/customers').then(r => r.items ?? []).catch(() => [] as ClienteOpt[]),
      apiFetch<{ items: ServiceOpt[] }>('/services?limit=100').then(r => r.items ?? []).catch(() => [] as ServiceOpt[]),
      apiFetch<{ items: Opt[] }>('/employees?limit=100').then(r => r.items ?? []).catch(() => [] as Opt[]),
      apiFetch<{ items: { id: string }[] }>('/locations').then(r => r.items ?? []).catch(() => [] as { id: string }[]),
      apiFetch<{ items: Opt[] }>('/contactos?limit=100').then(r => r.items ?? []).catch(() => [] as Opt[]),
    ]).then(([c, s, e, l, ct]) => { setCustomers(c); setServices(s); setEmployees(e); setLocationId(l[0]?.id ?? ''); setContactos(ct); });
  }, [open, fechaInicial]);

  if (!open) return null;

  // "Otros" es una tarea sembrada sin tarifa (ver seed-otros-servicio-demo-live.ts) que no
  // describe por sí misma qué es la cita: al elegirla se revela un input "Comentarios" que
  // se pliega en `notes` junto a Acción/Canal (buildCitaNotes).
  const servicioSeleccionado = services.find((s) => s.id === form.serviceId);
  const esOtros = servicioSeleccionado?.nombre === 'Otros';

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    // Cliente es OPCIONAL: el back ya admite bookings sin customerId (POST /bookings solo
    // exige locationId/serviceId/start — el mismo camino que las citas de equipo). Permite
    // agendar cosas personales sin cliente vinculado (visita médica, comida, recado…).
    if (!form.serviceId || !form.fecha || !form.hora) { setError('Servicio, fecha y hora son obligatorios.'); return; }
    if (!locationId) { setError('El negocio no tiene sucursal configurada.'); return; }
    setSaving(true); setError('');
    try {
      await apiFetch('/bookings', {
        method: 'POST',
        body: JSON.stringify({
          locationId, serviceId: form.serviceId, customerId: form.customerId || undefined,
          contactoId: form.contactoId || undefined,
          employeeId: form.employeeId || undefined, start: `${form.fecha}T${form.hora}:00`,
          // Comentarios/Anotaciones: única fuente `form.comentarios`, rellenada desde el
          // textarea que esté visible (bajo Canal en comerciales, o el de "Otros" en el resto).
          notes: mostrarCanal || esOtros ? buildCitaNotes(form.accion, form.canal, form.comentarios) : undefined,
        }),
      });
      onCreated(); onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la cita.');
    } finally { setSaving(false); }
  }

  const inputCls = 'mt-1 w-full rounded-xl border border-[var(--line)] px-3 py-2 text-sm';
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4 backdrop-blur-sm" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={submit} className="crm-modal-panel crm-cita-modal w-full max-w-md rounded-2xl bg-[var(--panel-bg,#fff)] p-6 shadow-xl">
        <p className="mb-4 font-display text-lg font-semibold text-[var(--panel-text)]">Nueva cita</p>

        {/* Opcional: se puede agendar sin cliente (visita médica, comida, recado personal…).
            Dos grupos: Clientes (empresa, por nombre comercial) y Contactos (leads/prospectos,
            por nombre del contacto). El valor lleva prefijo cliente:/contacto: → customerId XOR
            contactoId (crm-cita-cliente-contacto). */}
        <label className="block text-xs font-medium text-[var(--panel-muted)]">{termCliente}</label>
        <select
          className={inputCls}
          value={form.customerId ? `cliente:${form.customerId}` : form.contactoId ? `contacto:${form.contactoId}` : ''}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) { setForm({ ...form, customerId: '', contactoId: '' }); return; }
            const sep = v.indexOf(':');
            const tipo = v.slice(0, sep);
            const id = v.slice(sep + 1);
            setForm({ ...form, customerId: tipo === 'cliente' ? id : '', contactoId: tipo === 'contacto' ? id : '' });
          }}
        >
          <option value="">— Sin {termCliente.toLowerCase()} (cita personal) —</option>
          {customers.length > 0 && (
            <optgroup label="Clientes">
              {customers.map((c) => <option key={`cliente:${c.id}`} value={`cliente:${c.id}`}>{labelCliente(c)}</option>)}
            </optgroup>
          )}
          {contactos.length > 0 && (
            <optgroup label="Contactos">
              {contactos.map((c) => <option key={`contacto:${c.id}`} value={`contacto:${c.id}`}>{c.nombre}</option>)}
            </optgroup>
          )}
        </select>

        <label className="mt-3 block text-xs font-medium text-[var(--panel-muted)]">Servicio *</label>
        {/* Selector seccionado: catálogo real del negocio en "Servicios y tarifas" y las
            tareas/reuniones comerciales en "Tareas y reuniones" (ver ServicioSelect).
            Toda opción lleva un serviceId real → POST /bookings sigue validando el FK. */}
        <ServicioSelect className={inputCls} services={services} value={form.serviceId}
          onChange={(serviceId) => setForm({ ...form, serviceId })} />

        {/* Vertical comerciales: el textarea de Anotaciones vive bajo Canal (más abajo) y es
            la ÚNICA fuente de `form.comentarios` — se omite aquí para no duplicarlo. */}
        {esOtros && !mostrarCanal && (
          <>
            <label className="mt-3 block text-xs font-medium text-[var(--panel-muted)]">Comentarios</label>
            <textarea className={inputCls} rows={2} value={form.comentarios} placeholder="Describe de qué trata esta cita…"
              onChange={(e) => setForm({ ...form, comentarios: e.target.value })} />
          </>
        )}

        <label className="mt-3 block text-xs font-medium text-[var(--panel-muted)]">{termEmpleado}</label>
        <select className={inputCls} value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
          <option value="">Cualquiera</option>
          {employees.map((e2) => <option key={e2.id} value={e2.id}>{e2.nombre}</option>)}
        </select>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[var(--panel-muted)]">Fecha *</label>
            <input type="date" className={inputCls} value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--panel-muted)]">Hora *</label>
            {chipsFallback ? (
              <input type="time" className={inputCls} value={form.hora} onChange={(e) => setForm({ ...form, hora: e.target.value })} />
            ) : (
              <HoraChips
                fecha={form.fecha}
                serviceId={form.serviceId}
                employeeId={form.employeeId || undefined}
                locationId={locationId || undefined}
                value={form.hora}
                onChange={(hora) => setForm({ ...form, hora })}
                onFallback={() => setChipsFallback(true)}
              />
            )}
          </div>
        </div>

        {mostrarCanal && (
          <>
            <label className="mt-3 block text-xs font-medium text-[var(--panel-muted)]">Acción</label>
            {/* Select de acciones predefinidas (mismo chasis que Cliente/Servicio/Canal).
                El valor fluye a `buildCitaNotes` igual que antes; vacío → solo Canal. */}
            <select className={inputCls} value={form.accion} onChange={(e) => setForm({ ...form, accion: e.target.value })}>
              <option value="">Selecciona una acción…</option>
              {ACCIONES_COMERCIALES.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>

            <label className="mt-3 block text-xs font-medium text-[var(--panel-muted)]">Canal</label>
            <select className={inputCls} value={form.canal} onChange={(e) => setForm({ ...form, canal: e.target.value })}>
              {CANALES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>

            <label className="mt-3 block text-xs font-medium text-[var(--panel-muted)]">Anotaciones</label>
            <textarea className={inputCls} rows={2} value={form.comentarios} placeholder="Anotaciones opcionales…"
              onChange={(e) => setForm({ ...form, comentarios: e.target.value })} />
          </>
        )}

        {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />} Crear cita
          </Button>
        </div>
      </form>
    </div>
  );
}
