// Datos de ejemplo (mocks) ACORDES AL SECTOR de cada vertical.
// Al generar/sembrar un negocio, clientes, servicios/tarifas y documentos
// reflejan el sector (veterinario, clínica, abogados, taller, …).
import type { VerticalId } from './verticals';
import type { Cliente, Servicio, Documento } from '@/lib/mock/data';

// ── Campos extendidos de cliente por sector (para el modal "ampliar datos") ──
export interface ExtraField { name: string; label: string }

const CLIENT_EXTRA: Partial<Record<VerticalId, ExtraField[]>> = {
  veterinario: [
    { name: 'nombreMascota', label: 'Nombre de la mascota' },
    { name: 'especie', label: 'Especie' },
    { name: 'raza', label: 'Raza' },
  ],
  clinica: [
    { name: 'numHistoria', label: 'Nº de historia clínica' },
    { name: 'alergias', label: 'Alergias' },
  ],
  abogados: [
    { name: 'numExpediente', label: 'Nº de expediente' },
  ],
  taller: [
    { name: 'matricula', label: 'Matrícula' },
    { name: 'modelo', label: 'Vehículo' },
  ],
};

export function clienteExtraFields(vertical: VerticalId): ExtraField[] {
  return CLIENT_EXTRA[vertical] ?? [];
}

// ── Tipos de documento por sector ──
const DOC_TYPES: Partial<Record<VerticalId, string[]>> = {
  veterinario: ['Informe veterinario', 'Cartilla de vacunación', 'Analítica'],
  clinica: ['Informe médico', 'Consentimiento informado', 'Prueba diagnóstica'],
  abogados: ['Escrito', 'Contrato', 'Sentencia', 'Poder notarial'],
  taller: ['Orden de reparación', 'Presupuesto', 'Factura'],
  estetica: ['Consentimiento', 'Ficha de tratamiento', 'Factura'],
};
const DOC_DEFAULT = ['Factura', 'Presupuesto', 'Documento'];

export function documentTypes(vertical: VerticalId): string[] {
  return DOC_TYPES[vertical] ?? DOC_DEFAULT;
}

let docId = 9000;
function doc(tipo: string, base: string, fecha: string): Documento {
  return { id: ++docId, nombre: `${base}.pdf`, tipo, tam: 60_000 + (docId % 7) * 5_000, fecha };
}

export function documentosMock(vertical: VerticalId): Documento[] {
  const [t1] = documentTypes(vertical);
  return [doc(t1, t1.toLowerCase().replace(/\s+/g, '-'), '2026-06-10')];
}

// ── Servicios / Tarifas por sector ──
type Srv = Omit<Servicio, 'id'>;
const SERVICES: Partial<Record<VerticalId, Srv[]>> = {
  peluqueria: [
    { nombre: 'Corte de pelo', categoria: 'Pelo', duracion: 30, precio: 15 },
    { nombre: 'Corte + barba', categoria: 'Barba', duracion: 45, precio: 22 },
    { nombre: 'Color completo', categoria: 'Color', duracion: 90, precio: 55 },
  ],
  estetica: [
    { nombre: 'Manicura', categoria: 'Uñas', duracion: 40, precio: 20 },
    { nombre: 'Limpieza facial', categoria: 'Facial', duracion: 60, precio: 45 },
    { nombre: 'Depilación', categoria: 'Corporal', duracion: 30, precio: 25 },
  ],
  veterinario: [
    { nombre: 'Consulta general', categoria: 'Consulta', duracion: 30, precio: 35 },
    { nombre: 'Vacunación', categoria: 'Prevención', duracion: 20, precio: 28 },
    { nombre: 'Cirugía menor', categoria: 'Cirugía', duracion: 90, precio: 180 },
    { nombre: 'Peluquería canina', categoria: 'Estética', duracion: 60, precio: 30 },
  ],
  clinica: [
    { nombre: 'Primera consulta', categoria: 'Consulta', duracion: 40, precio: 50 },
    { nombre: 'Sesión de fisioterapia', categoria: 'Tratamiento', duracion: 45, precio: 40 },
    { nombre: 'Revisión', categoria: 'Seguimiento', duracion: 20, precio: 25 },
  ],
  taller: [
    { nombre: 'Cambio de aceite y filtros', categoria: 'Mantenimiento', duracion: 60, precio: 70 },
    { nombre: 'Diagnóstico electrónico', categoria: 'Diagnóstico', duracion: 45, precio: 40 },
    { nombre: 'Cambio de neumáticos', categoria: 'Neumáticos', duracion: 50, precio: 60 },
  ],
  abogados: [
    { nombre: 'Consulta inicial', categoria: 'Civil', duracion: 45, precio: 60 },
    { nombre: 'Procedimiento de divorcio', categoria: 'Divorcio', duracion: 60, precio: 120 },
    { nombre: 'Defensa penal', categoria: 'Penal', duracion: 60, precio: 150 },
    { nombre: 'Violencia de género', categoria: 'Violencia de género', duracion: 60, precio: 0 },
    { nombre: 'Reclamación por hurto', categoria: 'Hurto', duracion: 45, precio: 90 },
    { nombre: 'Asesoría laboral', categoria: 'Laboral', duracion: 45, precio: 80 },
  ],
  fitness: [
    { nombre: 'Cuota mensual', categoria: 'Cuotas', duracion: 0, precio: 35 },
    { nombre: 'Clase dirigida', categoria: 'Clases', duracion: 60, precio: 8 },
    { nombre: 'Entrenamiento personal', categoria: 'Personal', duracion: 60, precio: 30 },
  ],
};
const SERVICES_DEFAULT: Srv[] = [
  { nombre: 'Servicio estándar', categoria: 'General', duracion: 30, precio: 30 },
];

export function serviciosMock(vertical: VerticalId): Servicio[] {
  const base = SERVICES[vertical] ?? SERVICES_DEFAULT;
  return base.map((s, i) => ({ id: i + 1, ...s }));
}

// ── Clientes por sector (con campos extendidos + documentos del sector) ──
const NAMES = ['Lucía Fernández', 'Marcos Ruiz', 'Ana Gómez', 'David Soler'];
const EXTRA_VALUES: Partial<Record<VerticalId, Record<string, string>[]>> = {
  veterinario: [
    { nombreMascota: 'Toby', especie: 'Perro', raza: 'Labrador' },
    { nombreMascota: 'Misi', especie: 'Gato', raza: 'Europeo común' },
    { nombreMascota: 'Rocky', especie: 'Perro', raza: 'Bulldog francés' },
    { nombreMascota: 'Kiwi', especie: 'Ave', raza: 'Periquito' },
  ],
  clinica: [
    { numHistoria: 'HC-1001', alergias: 'Ninguna' },
    { numHistoria: 'HC-1002', alergias: 'Penicilina' },
    { numHistoria: 'HC-1003', alergias: 'AINEs' },
    { numHistoria: 'HC-1004', alergias: 'Ninguna' },
  ],
  abogados: [
    { numExpediente: 'EXP-2026-001' },
    { numExpediente: 'EXP-2026-002' },
    { numExpediente: 'EXP-2026-003' },
    { numExpediente: 'EXP-2026-004' },
  ],
  taller: [
    { matricula: '1234 ABC', modelo: 'Seat León' },
    { matricula: '5678 DEF', modelo: 'VW Golf' },
    { matricula: '9012 GHI', modelo: 'Renault Clio' },
    { matricula: '3456 JKL', modelo: 'Ford Focus' },
  ],
};

export function clientesMock(vertical: VerticalId): Cliente[] {
  const extras = EXTRA_VALUES[vertical];
  const docTipo = documentTypes(vertical)[0];
  return NAMES.map((nombre, i) => {
    const extra = extras?.[i];
    return {
      id: i + 1,
      nombre,
      email: `${nombre.split(' ')[0].toLowerCase()}@mail.com`,
      telefono: `6${(10 + i)} ${100 + i} ${200 + i}`,
      visitas: 1 + i * 3,
      gastoTotal: 30 + i * 90,
      segmento: i === 0 ? 'VIP' : i === 3 ? 'Nuevo' : 'Recurrente',
      ultimaVisita: `2026-06-${10 + i}`,
      ...(extra ? { extra } : {}),
      documentos: [doc(docTipo, `${docTipo.toLowerCase().replace(/\s+/g, '-')}-${i + 1}`, `2026-06-${10 + i}`)],
    } satisfies Cliente;
  });
}
