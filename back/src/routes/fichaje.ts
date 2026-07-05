import { Router, type Response } from 'express';
import { prisma } from '../prisma.js';
import type { AuthedRequest } from '../middleware/types.js';
import { nextAllowedStep, isJornadaCompleta, type WorkdayMode, type WorkdayStep } from '../lib/fichaje.js';

// crm-operaos WU6 (AC6): fichaje self-service con máquina de estados por día y modo.
// Distinto del CRUD legacy `/fichajes` (resumen entrada+salida, editable por staff): aquí
// cada POST ficha el SIGUIENTE paso válido de la jornada de HOY del empleado logueado —
// el front no elige el paso, lo calcula el back (evita fichajes fuera de orden).
export const fichajeRouter = Router();

const MODES: WorkdayMode[] = ['intensiva', 'partida'];

function today(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Empleado ligado al usuario logueado dentro del negocio activo (mismo patrón que myCustomerId en me.ts). */
async function myEmployeeId(req: AuthedRequest): Promise<string | null> {
  const emp = await prisma.employee.findFirst({
    where: { businessId: req.businessId, userId: req.userId, eliminadoEn: null },
    select: { id: true },
  });
  return emp?.id ?? null;
}

async function todayEvents(businessId: string, employeeId: string) {
  return prisma.workdayEvent.findMany({
    where: { businessId, employeeId, fecha: today() },
    orderBy: { creadoEn: 'asc' },
  });
}

const NO_EMPLOYEE = { error: { code: 'no_employee', message: 'Tu usuario no está vinculado a un empleado de este negocio' } };

// GET /fichaje/hoy → eventos fichados hoy, modo en curso y siguiente paso permitido.
fichajeRouter.get('/hoy', async (req: AuthedRequest, res: Response) => {
  const employeeId = await myEmployeeId(req);
  if (!employeeId) return res.status(404).json(NO_EMPLOYEE);

  const eventos = await todayEvents(req.businessId!, employeeId);
  const modo = (eventos[0]?.modo as WorkdayMode | undefined) ?? null;
  const doneSteps = eventos.map((e) => e.paso as WorkdayStep);

  res.json({
    modo,
    eventos: eventos.map((e) => ({ id: e.id, paso: e.paso, modo: e.modo, creadoEn: e.creadoEn })),
    siguientePaso: modo ? nextAllowedStep(modo, doneSteps) : null,
    jornadaCompleta: modo ? isJornadaCompleta(modo, doneSteps) : false,
  });
});

// POST /fichaje { modo } → ficha el siguiente paso permitido para ese modo.
fichajeRouter.post('/', async (req: AuthedRequest, res: Response) => {
  const employeeId = await myEmployeeId(req);
  if (!employeeId) return res.status(404).json(NO_EMPLOYEE);

  const modo = (req.body ?? {}).modo as WorkdayMode;
  if (!MODES.includes(modo)) {
    return res.status(422).json({ error: { code: 'invalid_modo', message: 'modo debe ser "intensiva" o "partida"' } });
  }

  const businessId = req.businessId!;
  const eventos = await todayEvents(businessId, employeeId);

  // No se puede cambiar de modo a mitad de la jornada del día.
  const modoEnCurso = eventos[0]?.modo as WorkdayMode | undefined;
  if (modoEnCurso && modoEnCurso !== modo) {
    return res.status(409).json({ error: { code: 'modo_mismatch', message: `Hoy ya empezaste la jornada en modo "${modoEnCurso}"` } });
  }

  const paso = nextAllowedStep(modo, eventos.map((e) => e.paso as WorkdayStep));
  if (!paso) {
    return res.status(409).json({ error: { code: 'jornada_completa', message: 'La jornada de hoy ya está completa' } });
  }

  try {
    const row = await prisma.workdayEvent.create({ data: { businessId, employeeId, fecha: today(), modo, paso } });
    res.status(201).json(row);
  } catch (e) {
    // Carrera: dos POST simultáneos para el mismo paso → el índice único workday_event_uq
    // lo rechaza en DB aunque ambos pasaran la validación en memoria (doble clic).
    if ((e as { code?: string }).code === 'P2002') {
      return res.status(409).json({ error: { code: 'race', message: 'Ese paso ya se registró (posible doble clic)' } });
    }
    throw e;
  }
});
