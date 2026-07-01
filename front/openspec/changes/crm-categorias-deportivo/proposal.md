# Proposal: Módulo "Categorías" para vertical centro-deportivo

## Intent

El vertical `centro-deportivo` existe pero no tiene forma de modelar equipos/categorías
(Benjamín A, Cadete B, natación) ni su staff (jugadores, entrenadores, auxiliares). Hoy
un club no puede ver su plantilla ni fichas de miembros. Falta además la entrada de
emojis `BY_VERTICAL['centro-deportivo']` (gap preexistente). Este cambio añade el módulo
"Categorías" para gestionar equipos y su composición de personas.

## Scope

### In Scope
- Modelos Prisma `Team` (`equipo`) y `TeamMember` (`miembro_equipo`) + 1 migración aditiva.
- Router back `categories.ts` (CRUD equipos + miembros) registrado bajo `/categories` con guard staff.
- Validación XOR en ruta: `TeamMember` referencia exactamente uno de `employeeId` | `customerId`.
- Front: lista de equipos `/categorias` + detalle `/categorias/[id]` con grid de staff (foto, nombre, posición, dorsal).
- Drawer "Info" por miembro: ficha completa + edad calculada; si menor, sección "Personas de contacto" (mín. 2).
- Registro del módulo: `ModuleId 'categorias'`, `ModuleDef` (categoría `personas`), `DEFAULT_EMOJI`, `BY_VERTICAL['centro-deportivo']` completo, alta en `defaultModules` del vertical.

### Out of Scope
- Estadísticas deportivas, calendario de partidos, asistencia a entrenamientos.
- Mecanismo genérico "módulo visible solo para ciertos verticals" (se documenta como convención).
- Edición de socios/empleados desde el detalle de equipo (se vincula, no se duplica).

## Capabilities

### New Capabilities
- `sports-categories`: gestión de equipos/categorías y su roster de miembros (vínculo a Employee/Customer, rol, dorsal, posición, contactos de menores).

### Modified Capabilities
- None.

## Approach

Opción A del explore. `Team` agrupa la categoría; `TeamMember` vincula personas existentes
(`employeeId` para entrenador/auxiliar, `customerId` para jugador/socio) sin duplicar datos,
con campos deportivos `rol`, `dorsal`, `posicion`. Patrón establecido: nombres modelo en
inglés con `@@map`/`@map` castellano, `businessId` multi-tenant, soft delete `eliminadoEn`,
router custom estilo `employees.ts`. Edad y minoría de edad se calculan en front desde la
fecha de nacimiento del Customer/Employee vinculado.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `back/prisma/schema.prisma` | New | Modelos `Team`, `TeamMember` |
| `back/src/routes/categories.ts` | New | Router CRUD + validación XOR FK |
| `back/src/routes/index.ts` | Modified | Registro `/categories` |
| `front/lib/config/modules.ts` | Modified | `ModuleId` + `ModuleDef` |
| `front/lib/config/icons.ts` | Modified | Emoji módulo + `BY_VERTICAL['centro-deportivo']` |
| `front/lib/config/verticals.ts` | Modified | `'categorias'` en `defaultModules` |
| `front/app/(crm)/categorias/page.tsx` | New | Lista de equipos |
| `front/app/(crm)/categorias/[id]/page.tsx` | New | Detalle + staff grid + drawer |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `prisma generate` EPERM en Windows | High | Workaround conocido `--no-engine` |
| XOR de 2 FK nullable no cubierto por crudRouter | Med | Validar en router custom + test |
| Fecha de nacimiento/contactos ausentes en datos vinculados | Med | Empty states; menor sin 2 contactos = aviso UI |

## Rollback Plan

Revertir migración aditiva (drop `equipo`/`miembro_equipo`, sin DROP de tablas externas),
quitar registro `/categories`, retirar `'categorias'` de `modules.ts`/`icons.ts`/`verticals.ts`
y borrar páginas `categorias/`. Cambio aislado y reversible.

## Dependencies

- Modelos `Employee` y `Customer` existentes (FK destino).

## Success Criteria

- [ ] Club ve lista de equipos y, al entrar, el staff con tarjetas (foto, nombre, posición, dorsal).
- [ ] Drawer "Info" muestra ficha completa con edad calculada.
- [ ] Miembro menor de edad muestra "Personas de contacto" (mín. 2).
- [ ] Módulo aparece en `defaultModules` de `centro-deportivo` con emoji sectorial.
- [ ] Migración aditiva aplica sin tocar tablas externas.
