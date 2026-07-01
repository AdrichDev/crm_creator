// Tipos del módulo comercial de campo (shapes que devuelve el back /customers, /visit-states…).

export type GeoStatus = 'PENDING' | 'OK' | 'FAILED';
export type AbcCategory = 'A' | 'B' | 'C';
export type RegistroType = 'CLIENTE' | 'PROSPECTO';
export type ReminderStatus = 'PENDING' | 'DONE' | 'CANCELLED';

export interface VisitStateDto {
  id: string;
  nombre: string;
  color: string;
  icono: string;
  orden?: number;
  esPendiente: boolean;
  esSistema?: boolean;
}

// Estado embebido en la fila de cliente (subconjunto).
export interface EstadoVisitaRef {
  id: string;
  nombre: string;
  color: string;
  icono: string;
  esPendiente: boolean;
}

export interface ComercialCustomer {
  id: string;
  nombre: string;
  email: string;
  telefono: string;
  direccion: string;
  localidad?: string;
  provincia?: string;
  codigoPostal?: string;
  visitas: number;
  gastoTotal: number;
  ultimaVisita: string;
  segmento: string;
  estado: string;
  latitud: number | null;
  longitud: number | null;
  geoEstado: GeoStatus;
  categoriaAbc: AbcCategory | null;
  tipoRegistro: RegistroType;
  estadoVisitaId: string | null;
  estadoVisita: EstadoVisitaRef | null;
  distanciaKm?: number;
}

export interface VisitDto {
  id: string;
  customerId: string;
  employeeId: string | null;
  fecha: string;
  resultado: string | null;
  nota: string | null;
  proximaAccion: string | null;
  estadoPosteriorId: string | null;
  createdAt: string;
}

export interface CustomerNoteDto {
  id: string;
  customerId: string;
  autorId: string | null;
  texto: string;
  origen: 'MANUAL' | 'AUDIO' | 'IMPORT';
  createdAt: string;
}

export interface ReminderDto {
  id: string;
  customerId: string;
  titulo: string;
  descripcion: string | null;
  fechaPrevista: string | null;
  estado: ReminderStatus;
  createdAt: string;
}
