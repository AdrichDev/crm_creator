# Design: Módulo "Categorías" (vertical centro-deportivo)

## Technical Approach

Two additive Prisma models (`Team`, `TeamMember`) with a join table for N:N membership, a custom Express router `categories.ts` mirroring the `employees.ts` pattern (manual validation, not `crudRouter`, because of XOR FK + minor-contact rules), and two App Router pages plus four config touchpoints. Person data (`fechaNacimiento`, address, phone) is never duplicated — `TeamMember` references existing `Employee`/`Customer` and the back resolves age for minor validation. Follows repo conventions: English model / castilian `@@map`, `businessId` multi-tenant, `eliminadoEn` soft delete, `staffOnly` guard (D4).

## Architecture Decisions

| Decision | Choice | Rejected | Rationale |
|---|---|---|---|
| Membership cardinality | N:N via `TeamMember` join (D1) | FK directo en Customer | Un socio/empleado en varios equipos; join table es el único modelo válido |
| ID + FK naming | `@id @default(cuid())`, `businessId @map("negocio_id")` | uuid / `business_id` del borrador | El repo entero usa `cuid()` y `negocio_id`; coherencia obligatoria (corrige el borrador) |
| `posicion` storage | Texto libre en BD; opciones por `deporte` en front (D2) | Enum en BD | Posiciones varían por deporte; enum rígido obliga migración por deporte nuevo |
| Contactos emergencia | `Json @default("[]")` en `TeamMember` (D3) | Tabla aparte / campo en Customer | Contacto es del rol-en-equipo, no de la persona; JSON evita 3ª tabla |
| Validación minoría | En back (calcula edad desde persona vinculada) | Solo front | Front puede saltarse; back es la fuente de verdad → 422 |
| Unicidad miembro | `@@unique([teamId, employeeId])` + `@@unique([teamId, customerId])` | Sin constraint | Evita duplicar misma persona en un equipo; XOR garantiza una FK no nula |
| Router | Custom estilo `employees.ts` | `crudRouter` genérico | `crudRouter` no cubre XOR ni subrecurso `/members` ni regla de menor |

## Data Flow

    POST /categories/:id/members
      │ body {employeeId XOR customerId, posicion, dorsal, contactos[]}
      ▼
    router: validar XOR → fetch persona (fechaNacimiento) → edad<18?
      │ sí & contactos.length===0 → 422        no/ok ▼
      ▼                                     prisma.teamMember.create
    GET /categories/:id  → include members → employee | customer
      ▼
    [id]/page.tsx → MemberGrid → MemberDrawer (edad calc. en front)

## File Changes

| File | Action | Description |
|---|---|---|
| `back/prisma/schema.prisma` | Modify | Enum `DeporteType`; modelos `Team`, `TeamMember` + relación inversa en `Business`, `Employee`, `Customer` |
| `back/prisma/migrations/*` | Create | Migración aditiva (CREATE equipo/miembro_equipo, sin DROP externas) |
| `back/src/routes/categories.ts` | Create | Router CRUD + subrecurso `/members` (XOR + regla menor) |
| `back/src/routes/index.ts` | Modify | `api.use('/categories', categoriesRouter)` bajo `staffOnly` |
| `front/lib/config/modules.ts` | Modify | `'categorias'` en union `ModuleId` + entry en `MODULES` (category `personas`, icon `Trophy`) |
| `front/lib/config/icons.ts` | Modify | Key `categorias` en `DEFAULT_EMOJI` (Record exhaustivo, obligatorio) + `BY_VERTICAL['centro-deportivo']` |
| `front/lib/config/verticals.ts` | Modify | `'categorias'` en `defaultModules` de `centro-deportivo` |
| `front/lib/config/sport-positions.ts` | Create | Mapa `DeporteType → string[]` (posiciones + roles staff) |
| `front/app/(crm)/categorias/page.tsx` | Create | Lista: `ModuleGuard`, `PageHeader`, grid `TeamCard`, `EntityModal` |
| `front/app/(crm)/categorias/[id]/page.tsx` | Create | Detalle: tabs, `MemberGrid`/`MemberCard`, `MemberDrawer` (contactos, banner menor) |

## Interfaces / Contracts

```prisma
enum DeporteType { FUTBOL_11 FUTBOL_7 FUTBOL_SALA BALONCESTO NATACION HALTEROFILIA OTRO }

model Team {
  id String @id @default(cuid())
  businessId String @map("negocio_id")
  business Business @relation(fields:[businessId],references:[id],onDelete:Cascade)
  nombre String; deporte DeporteType; temporada String?; descripcion String?; color String?
  eliminadoEn DateTime? @map("eliminado_en")
  createdAt DateTime @default(now()) @map("creado_en")
  updatedAt DateTime @updatedAt @map("actualizado_en")
  members TeamMember[]
  @@index([businessId]) @@map("equipo")
}

model TeamMember {
  id String @id @default(cuid())
  teamId String @map("equipo_id"); team Team @relation(...onDelete:Cascade)
  employeeId String? @map("empleado_id"); employee Employee? @relation(...)
  customerId String? @map("socio_id"); customer Customer? @relation(...)
  rol String; dorsal Int?; posicion String?; activoDesde DateTime? @map("activo_desde")
  contactosEmergencia Json @default("[]") @map("contactos_emergencia")
  createdAt DateTime @default(now()) @map("creado_en")
  updatedAt DateTime @updatedAt @map("actualizado_en")
  @@unique([teamId, employeeId]) @@unique([teamId, customerId]) @@map("miembro_equipo")
}
```

`contactosEmergencia`: `[{ nombre, telefono, relacion }]`. Error shape repo: `{ error: { code, message } }`, 422 invalid.

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit (node:test) | XOR (0/2 FK → 422), regla menor (<18 sin contacto → 422), soft delete | Caracterización del router primero |
| Integration | CRUD `/categories` + `/members`, scoping `businessId`, `@@unique` duplicado | supertest contra router montado |
| Front | edad calculada, banner menor, opciones posición por deporte | Render de `MemberDrawer` |

## Migration / Rollout

Migración Prisma aditiva (recipe migrate diff sin DROP de tablas externas). `prisma generate` normal en P7 (workaround EPERM Windows: reintentar o borrar caché `.prisma`). Rollback: drop equipo/miembro_equipo + revertir config/páginas. Aislado y reversible.

## Open Questions

- [ ] `@map` columna de `customerId`: `socio_id` (propuesto, sectorial) vs `cliente_id`. Confirmar en tasks.
- [ ] `termKey 'categorias'` — verificar si `Terminology` requiere alta de clave o el lookup dinámico basta.
