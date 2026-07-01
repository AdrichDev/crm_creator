# Proposal: Formulario y columnas de "Citas" según el sector del negocio

## Intent

Hoy el módulo Citas es 100% genérico en TODOS los verticales: el formulario
"Nueva cita" siempre pide `cliente, servicio, empleado, fecha, hora, estado`
(`front/app/(crm)/citas/page.tsx:32-39`), y la tabla siempre muestra las mismas
6 columnas, sin importar si el negocio es un centro deportivo, un gimnasio o
un despacho. Solo el TEXTO cambia por vertical (`terminology.citas`), no la
FORMA. Un club deportivo que da de alta un entrenamiento no tiene dónde poner
el equipo, el campo o el día de la semana — tiene que forzarlo dentro de
campos pensados para una peluquería.

Este cambio introduce un **catálogo de campos por sector** (mismo patrón ya
usado en `sport-positions.ts` para posiciones deportivas) que decide qué
campos aparecen en el formulario y qué columnas tiene la tabla, según el
vertical activo — mientras el esqueleto (Modal, Table, validación XOR,
paginación) sigue siendo el mismo componente para todos.

**Hallazgo clave de la investigación:** el modelo `Booking` YA tiene relación
M:N con `Resource` (`back/prisma/schema.prisma:385-441`), y `ResourceType`
YA incluye `COURT` (campo/cancha), `ROOM`, `TABLE`, `SPACE`, etc. Lo que falta
no es el esquema de recursos — es (a) exponerlo en el formulario de Citas
(hoy no se usa ahí en absoluto) y (b) un vínculo a `Team` para las reservas
de tipo "entrenamiento de equipo", que no existe.

## Scope

### In Scope
- Catálogo `lib/config/citas-sector-fields.ts`: por `VerticalId`, define los
  campos EXTRA del formulario (más allá de los genéricos ya existentes) y las
  columnas de la tabla.
- Migración aditiva: `Booking.teamId String?` (`@map("equipo_id")`) + relación
  a `Team`, nullable — un booking de tipo "entrenamiento" referencia un
  equipo en vez de (o además de) un cliente.
- Exponer selección de `Resource` (campo/cancha/sala/mesa) en el formulario de
  Citas — el modelo ya soporta la relación, falta el front y el endpoint.
- Rediseño profundo de 3 verticales representativos (uno por familia de
  cambio):
  - **centro-deportivo** (cambio grande: sustituye cliente por equipo):
    equipo, campo/instalación, entrenador, día de la semana + hora.
  - **fitness/gimnasio** (cambio medio: mantiene servicio, añade recursos):
    clase, instructor, sala, aforo, día de la semana + hora.
  - **comerciales** (cambio pequeño: mismo esqueleto, terminología+canal):
    cuenta, comercial, canal (presencial/videollamada).
- El resto de verticales (peluquería, estética, clínica, veterinario,
  abogados, taller, hostelería, escalada, custom) siguen con el formulario
  genérico actual — YA está bien para ellos, no se tocan en este change.
- Calendario del widget Agenda (`agenda-widget.tsx`) enlaza a la ficha real
  vía `/citas?edit=<id>` — YA implementado en sesión anterior; este change lo
  hace apuntar al formulario sector-correcto en vez del genérico.

### Out of Scope
- Recurrencia real de eventos (RRULE / series). "Día de la semana" en el
  formulario es una CONVENIENCIA para calcular la fecha concreta al crear
  (ej. "el próximo martes"), no un motor de recurrencia — cada entrenamiento
  sigue siendo un `Booking` individual. Una serie recurrente real es un
  change futuro si se pide explícitamente.
- Nueva entidad `Vehicle` para el vertical `taller` (fuera de los 3
  representativos elegidos).
- Rediseño de Servicios/Clientes/Empleados por sector — mismo patrón, pero
  change separado (ver nota en design.md `Servicios/Clientes/Empleados —
  patrón, no build`).
- Migrar los verticales NO representativos a formularios propios — usan el
  genérico actual, que ya es correcto para ellos.

## Capabilities

### New Capabilities
- `sector-booking-fields`: catálogo de campos/columnas de Citas por vertical.
- `booking-team-link`: un Booking puede referenciar un Team (entrenamiento).

### Modified Capabilities
- `bookings`: el router y el formulario aceptan los campos nuevos cuando el
  vertical los define; sin cambios de comportamiento para verticales que no
  los definen (compatibilidad total con el resto).

## Approach

Un objeto `SectorFieldsDef` por vertical con dos partes: `fields: Field[]`
(mismo tipo `Field` que ya usa `EntityModal`, o un `Field` extendido para los
selectores de Resource/Team) y `columns: string[]`. El formulario de Citas
consulta `CITAS_SECTOR_FIELDS[vertical] ?? CITAS_SECTOR_FIELDS.default` y
construye el modal con esos campos; la tabla usa `columns` del mismo objeto.
Los 3 verticales representativos usan un modal CUSTOM (como ya existe
`NuevaCitaModal` para el modo API) porque necesitan selectores dependientes
(elegir equipo → filtra campos disponibles de ese deporte, etc.), no el
`EntityModal` genérico de campos planos.

## Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| `back/prisma/schema.prisma` | Modify | `Booking.teamId` nullable + relación a `Team` |
| `back/prisma/migrations/*` | Create | Migración aditiva (ALTER TABLE reserva ADD COLUMN equipo_id) |
| `back/src/routes/bookings.ts` (o el crud actual) | Modify | Aceptar `teamId`/`resourceIds` en create/update |
| `front/lib/config/citas-sector-fields.ts` | Create | Catálogo campos+columnas por vertical |
| `front/components/crm/nueva-cita-modal.tsx` | Modify | Renderiza campos sector-específicos si el vertical los define |
| `front/app/(crm)/citas/page.tsx` | Modify | Columnas de tabla dinámicas por vertical |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `Booking.teamId` sin XOR forzado con `customerId` | Med | Igual patrón que `TeamMember` (XOR validado en router), documentado en spec.md |
| Formulario custom por vertical duplica lógica del genérico | Med | Extraer helpers compartidos (validación, fecha+hora→startAt/endAt) antes de escribir los 3 custom |
| Migración `teamId` en negocios ya con bookings reales | Low | Nullable + sin default → no rompe filas existentes |

## Rollback Plan

Aditivo y aislado: revertir `teamId` de Booking (drop column), restaurar
`nueva-cita-modal.tsx`/`citas/page.tsx` desde git, borrar el catálogo nuevo.
Los verticales no representativos no se tocan, cero riesgo de regresión ahí.

## Dependencies

- `Team`/`TeamMember` (módulo Categorías, ya existe).
- `Resource`/`ResourceType` (ya existe, sin usar hoy desde Citas).

## Success Criteria

- [ ] Centro deportivo: "Nuevo entrenamiento" pide equipo, campo, entrenador, día+hora — NO pide "cliente".
- [ ] Fitness: "Nueva clase" pide clase, instructor, sala, aforo, día+hora.
- [ ] Comerciales: "Nueva reunión" pide cuenta, comercial, canal.
- [ ] El resto de verticales sigue funcionando exactamente igual que hoy (sin regresión).
- [ ] Tabla de Citas muestra columnas distintas por vertical, acorde a sus campos.
- [ ] Migración `teamId` aplica sin tocar filas existentes de `reserva`.
