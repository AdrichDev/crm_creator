import { Router, type Response } from 'express';
import { prisma } from '../prisma.js';
import type { AuthedRequest } from '../middleware/types.js';

// Horario de apertura del NEGOCIO (OpeningHour/horario_apertura de su sucursal).
// Espeja el horario semanal del empleado (/employees/:id/horario): mismo shape de
// Tramo {diaSemana 0-6, inicio, fin} ↔ OpeningHour {diaSemana, apertura, cierre},
// misma validación y mismo reemplazo atómico (deleteMany + createMany en una tx).
// Es la fuente de los chips de "horas disponibles" del calendario: availability.ts
// (iterateDaySlots) genera los huecos desde OpeningHour — sin filas no hay chips.
// La app usa UNA sucursal por negocio → se resuelve la primera activa (patrón [0],
// mismo criterio que calendarSync.resolveTarget).
export const configHorarioRouter = Router();

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

// Sucursal del negocio activo (scoping tenant vía req.businessId del middleware).
async function findBusinessLocation(req: AuthedRequest) {
  return prisma.location.findFirst({
    where: { businessId: req.businessId, activo: true, eliminadoEn: null },
    orderBy: { createdAt: 'asc' },
  });
}

function toTramos(rows: { diaSemana: number; apertura: string; cierre: string }[]) {
  return rows.map((h) => ({ diaSemana: h.diaSemana, inicio: h.apertura, fin: h.cierre }));
}

configHorarioRouter.get('/horario', async (req: AuthedRequest, res: Response) => {
  const location = await findBusinessLocation(req);
  if (!location) return res.status(404).json({ error: { code: 'location_not_found', message: 'El negocio no tiene sucursal configurada' } });
  const rows = await prisma.openingHour.findMany({
    where: { locationId: location.id },
    orderBy: [{ diaSemana: 'asc' }, { apertura: 'asc' }],
  });
  res.json({ locationId: location.id, tramos: toTramos(rows) });
});

configHorarioRouter.put('/horario', async (req: AuthedRequest, res: Response) => {
  const location = await findBusinessLocation(req);
  if (!location) return res.status(404).json({ error: { code: 'location_not_found', message: 'El negocio no tiene sucursal configurada' } });

  const tramos = (req.body?.tramos ?? []) as Array<{ diaSemana: unknown; inicio: unknown; fin: unknown }>;
  if (!Array.isArray(tramos)) return res.status(400).json({ error: { code: 'validation', message: 'tramos debe ser un array' } });
  for (const t of tramos) {
    if (!Number.isInteger(t.diaSemana) || (t.diaSemana as number) < 0 || (t.diaSemana as number) > 6) {
      return res.status(400).json({ error: { code: 'validation', message: 'diaSemana debe ser un entero 0-6' } });
    }
    if (typeof t.inicio !== 'string' || !HHMM.test(t.inicio) || typeof t.fin !== 'string' || !HHMM.test(t.fin)) {
      return res.status(400).json({ error: { code: 'validation', message: 'inicio y fin deben tener formato HH:MM' } });
    }
    // El tramo debe abrir antes de cerrar: un tramo invertido/vacío (fin <= inicio)
    // produciría disponibilidad rota en iterateDaySlots. Se valida en la API (frontera
    // de confianza), no solo en el front. Comparación lexicográfica válida en HH:MM.
    if ((t.inicio as string) >= (t.fin as string)) {
      return res.status(400).json({ error: { code: 'validation', message: 'inicio debe ser anterior a fin' } });
    }
  }

  // Dedupe de tramos idénticos (diaSemana+inicio+fin): el cliente puede enviar
  // duplicados (p. ej. añadir dos veces el mismo tramo) → filas OpeningHour repetidas
  // y solapes en los chips. Se colapsan antes de insertar.
  const seen = new Set<string>();
  const uniqueTramos = tramos.filter((t) => {
    const key = `${t.diaSemana as number}|${t.inicio as string}|${t.fin as string}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Reemplazo atómico: borra el horario previo de la sucursal y crea los nuevos
  // tramos en la misma tx (tramos vacíos = negocio sin horario = días cerrados).
  await prisma.$transaction(async (tx) => {
    await tx.openingHour.deleteMany({ where: { locationId: location.id } });
    if (uniqueTramos.length) {
      await tx.openingHour.createMany({
        data: uniqueTramos.map((t) => ({ locationId: location.id, diaSemana: t.diaSemana as number, apertura: t.inicio as string, cierre: t.fin as string })),
      });
    }
  });

  const rows = await prisma.openingHour.findMany({
    where: { locationId: location.id },
    orderBy: [{ diaSemana: 'asc' }, { apertura: 'asc' }],
  });
  res.json({ locationId: location.id, tramos: toTramos(rows) });
});
