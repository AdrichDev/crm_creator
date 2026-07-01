# Design: Citas por sector

## Architecture Decisions

| Decision | Choice | Rejected | Rationale |
|---|---|---|---|
| Vínculo equipo↔booking | `Booking.teamId String? @map("equipo_id")`, FK a `Team` | Nueva tabla `entrenamiento` separada de `reserva` | Un entrenamiento SIGUE siendo una reserva de tiempo/recurso; duplicar la entidad rompe la agenda unificada (el widget Agenda ya lee `citas`/bookings como una sola colección) |
| XOR cliente/equipo | `customerId` y `teamId` ambos nullable, XOR validado en el router (igual que `TeamMember.employeeId`/`customerId`) | `teamId` obligatorio solo para centro-deportivo a nivel schema | El schema es compartido por todos los negocios; la regla "cuál exigir" es de NEGOCIO (vertical), no de tabla |
| Recurrencia | Ninguna — "día de la semana" es un helper de front que calcula la próxima fecha de ese día al crear | Motor RRULE | Pedido explícito de "día de la semana" no especifica series; construir un motor de recurrencia sin pedirlo es scope creep de varios días de trabajo |
| Selector de campo/sala (`Resource`) | Reusar `Resource`/`ResourceType` ya existente, filtrado por `tipo` según vertical | Nuevo modelo `Campo`/`Sala` | `Resource` ya cubre `COURT`/`ROOM`/`SPACE`/`TABLE` — no hay hueco de modelo, solo de UI |
| Formulario por vertical | Modal custom por vertical representativo (no `EntityModal` genérico) | Extender `EntityModal` con tipos `team-select`/`resource-select` | Los custom necesitan lógica dependiente (elegir equipo ↝ deporte ↝ posiciones no aplica aquí, pero SÍ filtrar `Resource` por `locationId`); forzarlo dentro de `EntityModal` genérico contamina un componente usado por 10+ módulos |

## Matriz de campos por vertical (Citas → término real entre paréntesis)

| Vertical | Sustituye a "Cliente" por | Campos nuevos | Columnas de tabla | Nivel de cambio |
|---|---|---|---|---|
| **centro-deportivo** (Entrenamientos) | Equipo (`Team`) | equipo, campo (`Resource` tipo `COURT`), entrenador (`Employee`), día semana, hora inicio/fin | Equipo · Campo · Día · Hora · Entrenador · Estado | Grande — representativo #1 |
| **fitness** (Clases) | — (cliente opcional, clase es grupal) | clase (`Service` ya existe), instructor (`Employee`), sala (`Resource` tipo `ROOM`/`SPACE`), aforo (`Resource.capacidad`, solo lectura), día semana, hora | Clase · Instructor · Sala · Día · Hora · Aforo · Estado | Medio — representativo #2 |
| **comerciales** (Reuniones) | Cuenta (`Customer`, ya existe, solo renombrado) | canal (presencial/videollamada — select simple, nuevo enum front-only guardado en `notes` estructurado o campo `channel` ya existente de `Booking` si se reutiliza `BookingChannel`) | Cuenta · Comercial · Canal · Fecha · Hora · Estado | Pequeño — representativo #3 |
| escalada (Reservas y pases) | — | pared/vía (`Resource`) | + columna Recurso | Pequeño, mismo patrón que comerciales — NO se construye en este change, queda de referencia |
| hostelería (Reservas) | — | mesa (`Resource` tipo `TABLE`), nº comensales (campo numérico simple) | + Mesa, + Comensales | Pequeño — NO se construye, de referencia |
| taller (Órdenes de trabajo) | — | vehículo (texto libre, NO nueva entidad — ver Out of Scope), mecánico ya es `empleado` | + Vehículo | Pequeño — NO se construye, de referencia |
| peluquería / estética / clínica / veterinario / abogados / custom | — | (ninguno) | (las 6 actuales) | Ninguno — ya correctos hoy, no se tocan |

## Servicios/Clientes/Empleados — patrón, no build (para specs futuras)

Mismo mecanismo (catálogo por vertical + modal custom donde el cambio sea
grande), aplicado a los otros 3 módulos con campos fijos detectados en la
auditoría (`servicios/page.tsx:28-33`, `clientes/page.tsx:35-46`,
`empleados/page.tsx:29-35`). Notas para cuando se aborden como specs propias:

- **Servicios** → en centro-deportivo, "Servicios" es "Cuotas y abonos"
  (`terminology.servicios`); el campo `duracion` (minutos) no aplica a una
  cuota mensual — necesitaría `periodicidad` (mensual/trimestral/anual) en
  vez de duración. Cambio pequeño, mismo patrón.
- **Clientes** → en centro-deportivo son "Socios"; campos como `segmento`
  (VIP/Nuevo/Recurrente, pensado para peluquería) no tienen sentido para un
  socio de club — encajaría mejor `categoria` (equipo al que pertenece, ya
  resoluble vía `TeamMember`, no requiere campo nuevo en `Customer`).
- **Empleados** → ya usa grid de cards, no tabla; para centro-deportivo
  "Entrenadores" podría mostrar el equipo que entrena (join con `TeamMember`)
  en la card, sin campo nuevo en `Employee`.

## Data Flow

    Nueva cita (front) → detecta vertical activo
      │
      ▼
    CITAS_SECTOR_FIELDS[vertical] ?? .default
      │
      ├─ default → EntityModal genérico (SIN CAMBIOS, código actual)
      │
      └─ representativo (centro-deportivo/fitness/comerciales)
            → Modal custom → selector Team/Resource/Employee
            → submit → POST /bookings { customerId? , teamId?, resourceIds[], serviceId, employeeId?, startAt, endAt }
                          │ XOR customerId/teamId validado en router (400 si 0 o 2)
                          ▼
                       prisma.booking.create({ ..., team: {connect}, resources: {connect: [...]} })

## File Changes

| File | Action | Description |
|---|---|---|
| `back/prisma/schema.prisma` | Modify | `Booking.teamId String? @map("equipo_id")` + `team Team? @relation(...)`; relación inversa `bookings: Booking[]` en `Team` |
| `back/prisma/migrations/*_booking_team/migration.sql` | Create | `ALTER TABLE crm.reserva ADD COLUMN equipo_id TEXT; ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY` |
| `back/src/routes/bookings.ts` | Modify | Validación XOR `customerId`/`teamId`; aceptar `resourceIds: string[]` en create/update (ya existe la relación M:N, falta el body mapping) |
| `front/lib/config/citas-sector-fields.ts` | Create | `CITAS_SECTOR_FIELDS: Partial<Record<VerticalId, SectorFieldsDef>>` — solo 3 entradas representativas + `default` implícito (ausencia de entrada) |
| `front/components/crm/nueva-entrenamiento-modal.tsx` | Create | Modal centro-deportivo: equipo, campo, entrenador, día+hora |
| `front/components/crm/nueva-clase-modal.tsx` | Create | Modal fitness: clase, instructor, sala, día+hora |
| `front/components/crm/nueva-cita-modal.tsx` | Modify | Añade campo `canal` cuando vertical=comerciales; sigue siendo el modal base para el resto |
| `front/app/(crm)/citas/page.tsx` | Modify | `onNueva()` decide qué modal abrir según vertical; `Table head` dinámico desde `CITAS_SECTOR_FIELDS` |
| `front/components/panel/widgets/agenda-widget.tsx` | No change | Ya enlaza a `/citas?edit=<id>`; el modal correcto lo decide `citas/page.tsx` |

## Interfaces / Contracts

```ts
// lib/config/citas-sector-fields.ts
export interface SectorFieldsDef {
  columns: string[];               // cabecera de la tabla, sustituye a la fija actual
  formComponent: 'default' | 'entrenamiento' | 'clase' | 'reunion';
}
export const CITAS_SECTOR_FIELDS: Partial<Record<VerticalId, SectorFieldsDef>> = {
  'centro-deportivo': { columns: ['Equipo', 'Campo', 'Día', 'Hora', 'Entrenador', 'Estado'], formComponent: 'entrenamiento' },
  fitness: { columns: ['Clase', 'Instructor', 'Sala', 'Día', 'Hora', 'Aforo', 'Estado'], formComponent: 'clase' },
  comerciales: { columns: ['Cuenta', 'Comercial', 'Canal', 'Fecha', 'Hora', 'Estado'], formComponent: 'reunion' },
};
```

```prisma
model Booking {
  // ...campos actuales sin cambios...
  teamId String? @map("equipo_id")
  team   Team?   @relation(fields: [teamId], references: [id])
}
```

Error shape del router (ya establecido en el repo): `{ error: { code: 'XOR_REQUIRED', message } }`, 400.

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Back unit | XOR `customerId`/`teamId` (0 o 2 → 400) | Mismo patrón que `categories.ts` XOR test ya existente |
| Back integration | Crear booking con `teamId` + `resourceIds`, leer de vuelta con `include: {team, resources}` | supertest sobre router bookings |
| Front unit | `CITAS_SECTOR_FIELDS[vertical]` resuelve al modal correcto para los 3 representativos y a `default` para el resto (los 8 no representativos, uno por uno) | vitest puro sobre la función de resolución |
| Front render | Modal `nueva-entrenamiento-modal` no muestra campo "Cliente"; sí equipo/campo/entrenador | RTL |

## Migration / Rollout

Migración aditiva única (`teamId` nullable). Aplicar vía Supabase MCP tras
aprobación explícita (regla del proyecto: migraciones requieren aprobación
humana). Rollback: drop column, sin pérdida de datos existentes (ninguna fila
tenía este campo antes).

## Open Questions

- [ ] "Canal" en comerciales: ¿reusar `Booking.channel` (`BookingChannel`
  enum: MANUAL/ONLINE, pensado para "cómo se reservó", no "presencial vs
  video") o campo nuevo? Recomendación: campo nuevo `modalidad` de texto
  libre en `notes` estructurado, para no forzar un enum ajeno a su semántica
  original — a confirmar antes de tocar schema.
- [ ] Fitness "aforo": ¿bloquear la creación de la clase si ya hay
  `capacidad` alcanzada (contar bookings del mismo `resourceId`+`startAt`) o
  solo mostrarlo informativo? Afecta si hace falta query adicional en el
  router. Por defecto en esta spec: informativo, sin bloqueo (más simple,
  ampliable después).
