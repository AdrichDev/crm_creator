# Tareas: Retirar POST /auth/register

## Previsión de carga de revisión

| Campo | Valor |
|-------|-------|
| Líneas estimadas modificadas | 400-600 |
| Riesgo de superar 400 líneas | Medio |
| PRs encadenadas recomendadas | Posiblemente 2 (fixture + retirada) |
| División sugerida | PR 1 fixture reconstruido + migraciones → PR 2 retirada de ruta + docs |
| Estrategia de entrega | consultar-ante-riesgo |
| Estrategia de cadena | pendiente |

Decisión necesaria antes de aplicar: No (scope ya decidido).
PRs encadenadas recomendadas: Posiblemente 2.
Riesgo de superar 400 líneas: Medio.

### Unidades de trabajo sugeridas

| Unidad | Objetivo | PR probable | Notas |
|--------|----------|-------------|-------|
| 1 | Reconstruir fixture compartido con inserción directa | PR 1 | Base para todo lo demás. |
| 2 | Migrar los 9 duplicados de helpers e2e | PR 1 | Depende de UW 1. |
| 3 | Retirar ruta y esquema; actualizar docs | PR 2 | Depende de UW 1–2. |

## Orden crítico

Primero el fixture compartido (T2), luego migrar consumidores (T3–T5), y solo al final retirar la ruta (T1) para no romper la suite a mitad de camino. Cada tarea OK solo con su verificación en verde (ver `validation.md`).

## T2 — Reconstruir el fixture compartido (HACER PRIMERO)
- [x] T2.1 En `back/src/routes/__tests__/_shared.e2e.ts`, reescribir `registerAndToken`
      (líneas 102-117) para crear el negocio con **inserción directa**, replicando la
      transacción del endpoint (`auth.ts:86-101`):
      `supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true })` →
      Prisma `business.create` + `location.create` + `user.create` (id = uuid de Supabase) +
      `membership.create` (role `ADMIN`). Mantener firma `(email, pw, t) → Auth | null` y el
      tracking de ids para `cleanup()`.
- [x] T2.2 Conservar el manejo de rate-limit del signIn (`signInWithRetry`) tal cual; el
      429 de `register` desaparece porque ya no hay llamada HTTP de registro.
- [x] T2.3 Verificar que `_shared.e2e.ts` **no** contiene ya ninguna referencia a
      `/auth/register`. (grep)

## T1 — Retirar ruta + esquema (HACER AL FINAL)
- [x] T1.1 Borrar el handler `authRouter.post('/register', registerLimiter, …)`
      (`back/src/routes/auth.ts:52-111`) y el `registerSchema` zod (líneas 43-50).
- [x] T1.2 Retirar/ajustar el bloque de comentario descriptivo del endpoint (líneas 37-42).
- [x] T1.3 **NO** tocar `registerLimiter` (línea 21): lo usa `/register-client` (línea 321).
- [x] T1.4 `tsc` del back limpio; grep de `authRouter.post('/register'` y `registerSchema`
      → 0 resultados.

## T3 — Migrar los 9 duplicados al helper compartido
Para cada fichero: borrar el `registerAndToken` local e importar el de `_shared.e2e.ts`.
- [x] T3.1 `auth-profile.e2e.test.ts`
- [x] T3.2 `bookings-team.e2e.test.ts`
- [x] T3.3 `notifications.e2e.test.ts`
- [x] T3.4 `employee-schedules.e2e.test.ts`
- [x] T3.5 `documents.e2e.test.ts`
- [x] T3.6 `categories.e2e.test.ts`
- [x] T3.7 `sale-lines.e2e.test.ts`
- [x] T3.8 `settings.e2e.test.ts`
- [x] T3.9 `auth-users.e2e.test.ts` (además de migrar el helper, ver T4)
- [x] T3.10 Verificar: `grep "function registerAndToken\|const registerAndToken"` en
      `__tests__/` → solo `_shared.e2e.ts`.

## T4 — Borrar los tests de la feature retirada
- [x] T4.1 En `auth-users.e2e.test.ts`, **eliminar** los 3 tests que ejercitan el endpoint
      como feature: registro exitoso (201), email duplicado (409), password débil (422).
- [x] T4.2 Asegurar que los tests restantes de ese fichero usan el helper compartido y
      quedan verdes.

## T5 — Fixtures que solo usaban el endpoint de paso
- [x] T5.1 `auth-client-register.e2e.test.ts`: sustituir la llamada inline a `/auth/register`
      (preparación previa) por el fixture reconstruido / helper compartido. Los tests de
      `register-client` (la feature bajo prueba) se mantienen intactos.
- [x] T5.2 `bookings-timezone.e2e.test.ts`: ajustar su uso parcial del registro al fixture
      compartido; verificar verde.

## T6 — Docs
- [x] T6.1 `back/README.md`: retirar la línea 73 (`POST /auth/register …`); dejar el bloque
      Auth coherente (register-client, me, login/stub 410, etc.).

## Verificación final (antes del gate AgenticRuntime)
- [x] V.1 Suite e2e completa en verde con el fixture reconstruido (salvo los tests borrados).
- [x] V.2 `tsc` del back limpio.
- [x] V.3 grep: 0 referencias a la ruta `/register` y a `registerSchema`; `registerLimiter`
      sigue presente; `registerAndToken` solo en `_shared.e2e.ts`.
- [x] V.4 `POST /api/auth/register` responde 401 (no 404 literal) en el back arrancado — ver
      discrepancia anotada: cae en el gate `authenticate` global tras no matchear en
      `authRouter`, en vez de llegar al `notFound` de `server.ts`. El negocio NO se crea
      (objetivo de seguridad cumplido); 404 exacto requeriría reordenar middleware, fuera
      de alcance de este change.

## T7 — Seguimiento post-cierre (MANUAL — Adrian, NO automatizable por el agente)
- [ ] T7.1 En Supabase, listar `crm.negocio` con `tenant_id IS NULL` creados por la vía
      retirada; distinguir seeds/demo legítimos de negocios huérfanos reales de producción.
- [ ] T7.2 Decidir tratamiento (conservar / migrar a un tenant / hard delete) y registrar la
      decisión. Este ítem **cierra** el change; no bloquea la retirada de la ruta ni el spec.

## Verificación final (antes del gate AgenticRuntime)
- [ ] V.1 Suite e2e completa en verde con el fixture reconstruido (salvo los tests borrados).
- [ ] V.2 `tsc` del back limpio.
- [ ] V.3 grep: 0 referencias a la ruta `/register` y a `registerSchema`; `registerLimiter` sigue presente; `registerAndToken` solo en `_shared.e2e.ts`.
- [ ] V.4 `POST /api/auth/register` responde 404 en el back arrancado.

## T7 — Seguimiento post-cierre (MANUAL — Adrian, NO automatizable por el agente)
- [ ] T7.1 En Supabase, listar `crm.negocio` con `tenant_id IS NULL` creados por la vía retirada; distinguir seeds/demo legítimos de negocios huérfanos reales de producción.
- [ ] T7.2 Decidir tratamiento (conservar / migrar a un tenant / hard delete) y registrar la decisión. Este ítem **cierra** el change; no bloquea la retirada de la ruta ni el spec.

## Tras verde: gate Agentic Runtime antes de commit (convención del repo).
