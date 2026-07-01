# Tasks: Módulo Categorías (centro-deportivo)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~620 (schema 70, router 120, tests 80, sport-positions 60, config 25, pages 260; migration excluded) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | WU1 Config+Schema → WU2 Backend → WU3 Frontend |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| WU1 | Config front + Prisma schema (sin migración) | PR 1 | Base: main; 0 cambios en DB |
| WU2 | Backend router + tests | PR 2 | Depende de WU1; base = rama PR 1 |
| WU3 | Páginas front `/categorias` y `/categorias/[id]` | PR 3 | Depende de WU1; puede paralelo a WU2 |
| M1 | DDL migration (BLOQUEADA) | PR post-aprobación | Apply manual via Supabase MCP |

---

## Phase 1: Config Front (WU1)

- [x] 1.1 `front/lib/config/modules.ts`: añadir `'categorias'` a union `ModuleId` + entry en `MODULES[]` (category `personas`, icon `Trophy`, termKey `'categorias'`)
- [x] 1.2 `front/lib/config/icons.ts`: añadir `DEFAULT_EMOJI['categorias']` — bloqueante de compilación TS (`Record<ModuleId,string>` exhaustivo) (C2)
- [x] 1.3 `front/lib/config/icons.ts`: añadir `BY_VERTICAL['centro-deportivo']` con 12 emojis deportivos; `categorias` → `🏟️` (req. emojis)
- [x] 1.4 `front/lib/config/verticals.ts`: añadir `'categorias'` al array `defaultModules` de `centro-deportivo`
- [x] 1.5 `front/lib/config/sport-positions.ts` (nuevo): exportar `SPORT_POSITIONS: Record<DeporteType, string[] | null>` para 7 deportes + `STAFF_ROLES: string[]` (spec C-S5, C-S6)
- [x] 1.6 `front/lib/config/terminology.ts`: verificar si `Terminology` es unión cerrada — añadir `'categorias'` si aplica; no-op si lookup dinámico (C4) → `Record<string,string>`, no-op

## Phase 2: Prisma Schema (WU1)

- [x] 2.1 `back/prisma/schema.prisma`: añadir `enum DeporteType { FUTBOL_11 FUTBOL_7 FUTBOL_SALA BALONCESTO NATACION HALTEROFILIA OTRO }` en schema `crm`
- [x] 2.2 `back/prisma/schema.prisma`: modelo `Team` — `@id @default(cuid())`, `businessId @map("negocio_id")`, `eliminadoEn DateTime? @map("eliminado_en")`, `@@index([businessId])`, `@@map("equipo")` (C1)
- [x] 2.3 `back/prisma/schema.prisma`: modelo `TeamMember` — FKs nullable XOR `@map("empleado_id")`/`@map("socio_id")` (C3), `contactosEmergencia Json @default("[]") @map("contactos_emergencia")`, `@@unique([teamId,employeeId])`, `@@unique([teamId,customerId])`, `@@map("miembro_equipo")`
- [x] 2.4 `back/prisma/schema.prisma`: relaciones inversas `teams`/`teamMembers` en modelos `Business`, `Employee`, `Customer`
- [x] 2.5 Ejecutar `prisma generate` (P7, sin `--no-engine`). EPERM workaround: borrar `back/.prisma/client/` y reintentar (C5)

## ⚠️ Phase 3: Migration DDL — BLOQUEADA (M1)

- [ ] ⚠️ 3.1 **[BLOQUEADA — requiere aprobación humana]** Apply via MCP Supabase: `CREATE TYPE crm."DeporteType"`, `CREATE TABLE crm.equipo`, `CREATE TABLE crm.miembro_equipo` con FK constraints (C6)

## Phase 4: Backend Router (WU2 — depende Phase 2)

- [x] 4.1 `back/src/routes/categories.ts` (nuevo): `GET/POST /categories`, `PATCH/DELETE /categories/:id` (soft-delete), `staffOnly` guard
- [x] 4.2 `back/src/routes/categories.ts`: subrecurso `GET/POST /categories/:id/members`, `DELETE /categories/:id/members/:memberId`
- [x] 4.3 `back/src/routes/categories.ts`: validación XOR — 0 o 2 FKs → 400 `{ error: { code: 'XOR_REQUIRED' } }` (spec C-S4)
- [x] 4.4 `back/src/routes/categories.ts`: validación minoría — fetch `fechaNacimiento` del Customer vinculado; edad < 18 y `contactosEmergencia.length === 0` → 422 (spec C-S7)
- [x] 4.5 `back/src/routes/index.ts`: registrar `api.use('/categories', categoriesRouter)` bajo `staffOnly`

## Phase 5: Backend Tests (WU2)

- [x] 5.1 Test: `POST /categories/:id/members` sin FKs → 400 (spec C-S4)
- [x] 5.2 Test: `POST /categories/:id/members` con `employeeId` + `customerId` a la vez → 400 (spec C-S4)
- [x] 5.3 Test: XOR válido (solo `customerId`) → 201 (spec C-S3)
- [x] 5.4 Test: `Customer` menor de edad, 0 contactos emergencia → 422 (spec C-S7)
- [x] 5.5 Test: `Customer` mayor de edad, 0 contactos → 201 (spec C-S8)
- [x] 5.6 Test: soft-delete equipo → registros `Customer`/`Employee` vinculados intactos (spec C-S2)

## Phase 6: Páginas Front (WU3 — depende Phase 1)

- [x] 6.1 `front/app/(crm)/categorias/page.tsx` (nuevo): `ModuleGuard moduleId="categorias"`, `PageHeader`, fetch `GET /categories`
- [x] 6.2 `front/app/(crm)/categorias/page.tsx`: grid `TeamCard` (nombre, badge deporte, temporada, nº miembros); `EntityModal` crear/editar equipo
- [x] 6.3 `front/app/(crm)/categorias/[id]/page.tsx` (nuevo): header equipo, tab bar Todos/Jugadores/Entrenadores — filtra por `rol` (spec C-S10)
- [x] 6.4 `front/app/(crm)/categorias/[id]/page.tsx`: `MemberCard` (avatar, nombre, posición, dorsal, botón "Info"); grid filtrado por tab activo
- [x] 6.5 `front/app/(crm)/categorias/[id]/page.tsx`: `MemberDrawer` — edad calculada, banner menor, lista contactos emergencia + edición inline (spec C-S9)
- [x] 6.6 `front/app/(crm)/categorias/[id]/page.tsx`: modal "Añadir miembro" — selector posición por deporte via `sport-positions.ts` (dropdown/free-text); bloqueo front si menor + 0 contactos (spec C-S5, C-S6, C-S7)

## Phase 7: Verification (Z)

- [ ] 7.1 `npx tsc --noEmit` en `front/` — 0 errores (gate: `DEFAULT_EMOJI` exhaustivo, `ModuleId` completo)
- [ ] 7.2 `npm test` en `back/` — todos verdes (XOR, minoría de edad, soft-delete)
- [ ] 7.3 Comprobación visual: `BY_VERTICAL['centro-deportivo']` emojis renderizan en selector de módulos; `categorias` muestra `🏟️`
