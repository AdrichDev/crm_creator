import type { ModuleId } from './modules';
import type { Terminology } from './terminology';

export type VerticalId =
  | 'peluqueria' | 'estetica' | 'hosteleria'
  | 'fitness' | 'escalada' | 'clinica'
  | 'taller' | 'veterinario' | 'abogados' | 'custom';

export interface VerticalDef {
  id: VerticalId;
  label: string;
  emoji: string;
  tagline: string;
  defaultModules: ModuleId[];
  terminology: Terminology;
  branding: { primary: string; secondary: string };
}

const BASE_PERSONAS: ModuleId[] = ['empleados', 'vacaciones'];

export const VERTICALS: VerticalDef[] = [
  {
    id: 'peluqueria', label: 'Peluquería', emoji: '💈',
    tagline: 'Salón de peluquería y barbería',
    defaultModules: ['clientes', 'citas', 'servicios', ...BASE_PERSONAS, 'productos', 'ventas', 'facturas', 'marketing', 'estadisticas'],
    terminology: { citas: 'Citas', empleados: 'Estilistas', servicios: 'Servicios', clientes: 'Clientes' },
    branding: { primary: '#c5a028', secondary: '#e5c158' },
  },
  {
    id: 'estetica', label: 'Centro de estética', emoji: '💅',
    tagline: 'Estética, uñas, belleza y bienestar',
    defaultModules: ['clientes', 'citas', 'servicios', ...BASE_PERSONAS, 'productos', 'ventas', 'facturas', 'marketing', 'estadisticas'],
    terminology: { citas: 'Citas', empleados: 'Esteticistas', servicios: 'Tratamientos', clientes: 'Clientes' },
    branding: { primary: '#b5176b', secondary: '#f4a6c6' },
  },
  {
    id: 'hosteleria', label: 'Restaurante / Bar', emoji: '🍽️',
    tagline: 'Hostelería: bar, cafetería y restaurante con reservas',
    defaultModules: ['clientes', 'citas', 'productos', 'ventas', 'facturas', 'empleados', 'fichaje', 'vacaciones', 'marketing', 'estadisticas'],
    terminology: { citas: 'Reservas', ventas: 'TPV', empleados: 'Personal de sala', productos: 'Carta y stock' },
    branding: { primary: '#5a1e22', secondary: '#c9893f' },
  },
  {
    id: 'fitness', label: 'Gimnasio / Box', emoji: '🏋️',
    tagline: 'Gimnasio, box de CrossFit y centro fitness',
    defaultModules: ['clientes', 'citas', 'servicios', 'empleados', 'fichaje', 'vacaciones', 'productos', 'ventas', 'facturas', 'marketing', 'estadisticas'],
    terminology: { citas: 'Clases', empleados: 'Entrenadores', servicios: 'Cuotas y bonos', clientes: 'Socios' },
    branding: { primary: '#16222e', secondary: '#f25c2a' },
  },
  {
    id: 'escalada', label: 'Sala de escalada', emoji: '🧗',
    tagline: 'Rocódromo / sala de escalada',
    defaultModules: ['clientes', 'citas', 'servicios', 'empleados', 'productos', 'ventas', 'facturas'],
    terminology: { citas: 'Reservas y pases', empleados: 'Monitores', servicios: 'Tarifas y bonos', clientes: 'Socios' },
    branding: { primary: '#1f3a2e', secondary: '#e3b23c' },
  },
  {
    id: 'clinica', label: 'Clínica', emoji: '🩺',
    tagline: 'Fisioterapia, dental y consultas de salud',
    defaultModules: ['clientes', 'citas', 'servicios', ...BASE_PERSONAS, 'productos', 'ventas', 'facturas', 'marketing', 'estadisticas'],
    terminology: { citas: 'Citas', empleados: 'Profesionales', servicios: 'Tratamientos', clientes: 'Pacientes', productos: 'Material clínico' },
    branding: { primary: '#0e7490', secondary: '#67e8f9' },
  },
  {
    id: 'taller', label: 'Taller mecánico', emoji: '🔧',
    tagline: 'Taller de coches, motos y reparaciones',
    defaultModules: ['clientes', 'citas', 'servicios', 'empleados', 'fichaje', 'vacaciones', 'productos', 'ventas', 'facturas'],
    terminology: { citas: 'Órdenes de trabajo', empleados: 'Mecánicos', servicios: 'Reparaciones', clientes: 'Clientes', productos: 'Recambios y stock' },
    branding: { primary: '#1f2937', secondary: '#f59e0b' },
  },
  {
    id: 'veterinario', label: 'Centro veterinario', emoji: '🐾',
    tagline: 'Clínica veterinaria y peluquería canina',
    defaultModules: ['clientes', 'citas', 'servicios', ...BASE_PERSONAS, 'productos', 'ventas', 'facturas', 'marketing', 'estadisticas'],
    terminology: { citas: 'Citas', empleados: 'Veterinarios', servicios: 'Servicios', clientes: 'Pacientes', productos: 'Productos y medicación' },
    branding: { primary: '#0f766e', secondary: '#5eead4' },
  },
  {
    id: 'abogados', label: 'Bufete de abogados', emoji: '⚖️',
    tagline: 'Despacho jurídico: clientes, expedientes y citas',
    defaultModules: ['clientes', 'citas', 'servicios', ...BASE_PERSONAS, 'fichaje', 'ventas', 'facturas', 'marketing', 'estadisticas'],
    terminology: { citas: 'Citas', empleados: 'Abogados', servicios: 'Tarifas', clientes: 'Clientes', ventas: 'Facturación' },
    branding: { primary: '#1e3a5f', secondary: '#c0a062' },
  },
  {
    id: 'custom', label: 'Personalizado', emoji: '⚙️',
    tagline: 'Empieza desde cero y elige tú los módulos',
    defaultModules: ['clientes'],
    terminology: {},
    branding: { primary: '#1e293b', secondary: '#6366f1' },
  },
];

export const VERTICAL_MAP: Record<VerticalId, VerticalDef> = Object.fromEntries(
  VERTICALS.map((v) => [v.id, v]),
) as Record<VerticalId, VerticalDef>;
