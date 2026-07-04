# Diseño: Retirar POST /auth/register

## Enfoque técnico

Retirar el endpoint que crea un `Business` sin `tenantId` (violando el modelo de tenencia), reconstruir el fixture e2e para crear negocios por inserción directa y consolidar los helpers duplicados de e2e en un solo lugar. El cambio es reversible por git; la única deuda manual es la auditoría post-cierre de datos huérfanos en producción.

## Decisiones de arquitectura

| Decisión | Elección | Alternativas consideradas | Motivo |
|----------|----------|---------------------------|--------|
| Ruta a retirar | Eliminar `POST /auth/register` completamente | Deprecar con 410 | La ruta viola el modelo de tenencia; no hay caso legítimo de uso. |
| Fixture e2e | Inserción directa (Supabase admin + Prisma) | Reimplementar endpoint internamente | Inserción directa es explícita, auditable y evita reimplemenaciones ocultas de deuda. |
| `registerLimiter` | Mantenerlo (lo usa `register-client`) | Eliminarlo también | Es un componente independiente que sigue siendo necesario. |
| `Business.tenantId` | Dejar nullable (no fuerza NOT NULL) | Forzar NOT NULL en schema | Cambio de schema es más complejo; los seeds/demo lo necesitan nullable. |
| Duplicados en e2e | Centralizar en `_shared.e2e.ts` | Dejar cada fichero con el suyo | Reduces deuda, facilita mantenimiento y evita regresiones por copias divergentes. |

## Flujo de datos

    Antes:
    Tests e2e ──> POST /auth/register ──> Business (sin tenantId)
    
    Después:
    Tests e2e ──> registerAndToken (en _shared.e2e.ts) ──> Supabase.auth.admin + Prisma ──> Business (creado directo)

## Cambios de archivos

| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `creador_CRM/back/src/routes/auth.ts` | Modificar | Eliminar handler `POST /register` (líneas 52-111) y `registerSchema` (líneas 43-50); ajustar comentarios descriptivos. |
| `creador_CRM/back/src/routes/__tests__/_shared.e2e.ts` | Modificar | Reescribir `registerAndToken` para crear negocios por inserción directa (Supabase admin + Prisma). |
| `creador_CRM/back/src/routes/__tests__/auth-users.e2e.test.ts` | Modificar | Eliminar 3 tests de la feature `POST /register`; migrar duplicados al helper compartido. |
| `creador_CRM/back/src/routes/__tests__/auth-profile.e2e.test.ts` | Modificar | Retirar `registerAndToken` local; importar desde `_shared.e2e.ts`. |
| `creador_CRM/back/src/routes/__tests__/bookings-team.e2e.test.ts` | Modificar | Retirar `registerAndToken` local; importar desde `_shared.e2e.ts`. |
| `creador_CRM/back/src/routes/__tests__/notifications.e2e.test.ts` | Modificar | Retirar `registerAndToken` local; importar desde `_shared.e2e.ts`. |
| `creador_CRM/back/src/routes/__tests__/employee-schedules.e2e.test.ts` | Modificar | Retirar `registerAndToken` local; importar desde `_shared.e2e.ts`. |
| `creador_CRM/back/src/routes/__tests__/documents.e2e.test.ts` | Modificar | Retirar `registerAndToken` local; importar desde `_shared.e2e.ts`. |
| `creador_CRM/back/src/routes/__tests__/categories.e2e.test.ts` | Modificar | Retirar `registerAndToken` local; importar desde `_shared.e2e.ts`. |
| `creador_CRM/back/src/routes/__tests__/sale-lines.e2e.test.ts` | Modificar | Retirar `registerAndToken` local; importar desde `_shared.e2e.ts`. |
| `creador_CRM/back/src/routes/__tests__/settings.e2e.test.ts` | Modificar | Retirar `registerAndToken` local; importar desde `_shared.e2e.ts`. |
| `creador_CRM/back/src/routes/__tests__/auth-client-register.e2e.test.ts` | Modificar | Ajustar uso inline de `/auth/register` al fixture compartido. |
| `creador_CRM/back/src/routes/__tests__/bookings-timezone.e2e.test.ts` | Modificar | Ajustar uso del registro al fixture compartido. |
| `creador_CRM/back/README.md` | Modificar | Retirar línea 73 que documenta `POST /auth/register`. |

## Interfaces y contratos

- `POST /auth/register`: **ELIMINADA**. Las peticiones responden 404.
- `POST /auth/register-client`: **SIN CAMBIOS**. Sigue funcionando igual (es otra ruta distinta).
- `registerAndToken(email, pw, t)` (fixture compartida): misma firma, distinta implementación. Devuelve `{ token, businessId, userId }` creados por inserción directa.
- `getSharedAuth(t)`: hereda el helper sin cambios de uso.

## Estrategia de pruebas

| Capa | Qué probar | Enfoque |
|------|------------|---------|
| Ruta | Eliminar `/register` | 404 en POST /auth/register; grep: 0 referencias a la ruta. |
| Fixture | Inserción directa de negocios | `registerAndToken` devuelve un negocio válido creado sin HTTP. |
| E2E | Todos los ficheros que lo usaban | Suite completa verde con el helper compartido (salvo los 3 tests borrados). |
| Integración | Compatibilidad con `register-client` | `registerLimiter` sigue en su lugar; `register-client` sigue verde. |

## Migración y despliegue

1. **Orden crítico:** primero reconstruir el fixture (T2), luego migrar consumidores (T3–T5), y solo al final retirar la ruta (T1). Esto evita romper la suite e2e a mitad de camino.
2. **Reversibilidad:** cambio es reversible por git en cualquier momento (no hay cambios irreversibles a datos, schema ni configuración).
3. **PRs:** potencialmente 2 PRs: P1 (fixture reconstruido + migraciones de duplicados) y P2 (retirada de ruta + ajustes finales).
4. **Post-cierre:** Adrian audita Supabase manualmente para buscar negocios huérfanos (`Business.tenantId IS NULL`) creados por la ruta retirada.

## Preguntas abiertas

- [ ] ¿Existen negocios huérfanos reales de producción? (respuesta: Adrian audita post-cierre, ítem T7.1–T7.2 en `tasks.md`).
