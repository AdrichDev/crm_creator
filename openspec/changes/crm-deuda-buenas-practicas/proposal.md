# Proposal — Deuda de buenas prácticas (audit 2026-07-02)

**Nivel Gru: 2-3 según lote.** **Estado: PROPUESTA — pendiente de priorización del usuario.**

## Contexto
Audit de buenas prácticas (reviewer fresco, 2026-07-02) sobre back/src y front. El código es
funcional y el scoping multi-tenant es correcto de forma generalizada, pero hay deuda de
adopción: existen abstracciones buenas (crudRouter, Modal base, use-paginated-api,
parsePagination) que no todos los módulos usan, y validación duplicada entre routers.

Se descartaron 2 hallazgos del audit por falsos positivos (verificado en código):
- "modales sin tests" — falso: horario-empleado-modal, lineas-venta-modal, nueva-clase-modal,
  nueva-entrenamiento-modal tienen test en `front/tests/` (convención del repo).
- "`daySlots` import sin uso en bookings.ts" — falso: se usa en la línea 96.

## Hallazgos confirmados (con file:line del audit)
1. Validación duplicada: `safeParse` + 422 ad-hoc repetido en users/categories/packages/timeoff/
   sale-lines/auth/exports; shape del error inconsistente (users incluye `details`, categories no).
2. `crudRouter` infrautilizado: users.ts/categories.ts/customers.ts duplican patrones que crud.ts
   ya resuelve (paginación, FK validation, soft-delete).
3. Monolitos moderados: customers.ts (~261 líneas, helpers puros dentro del router),
   users-panel.tsx (~206 líneas con NewUserModal embebida).
4. categories.ts valida con casts manuales en lugar de Zod (patrón de auth.ts).
5. `void supabaseAdmin.auth.resetPasswordForEmail(email)` sin logging/retry (auth.ts:197).
6. Naming sin formalizar: regla implícita "tipos/enums/FK en inglés, campos de negocio y labels
   en castellano" — escribirla en ARQUITECTURA.md.
7. `SupabaseLandingStore` TODO pendiente (front/lib/landing/store.ts:152) — decidir si se
   implementa o se marca no-soportado.
8. Adopción de use-paginated-api no universal en front.

## Alcance propuesto (lotes independientes)
- Lote A (bajo riesgo): middleware `validateBody(schema)` + unificar shape 422 + Zod en categories.
- Lote B: extraer helpers puros de customers.ts a lib; partir users-panel.tsx.
- Lote C: documentar convención de naming en ARQUITECTURA.md + logging en fire-and-forget de auth.
- Lote D (decisión): SupabaseLandingStore y auditoría de adopción use-paginated-api.

## Riesgos
Refactors transversales tocan rutas con e2e vivos: cada lote exige suite verde antes/después.
No mezclar lotes en un mismo commit.
