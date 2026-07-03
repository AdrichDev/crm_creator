# Tasks: crm-operator-bot-write-ops

- [x] T1 — `service-operator.ts`: 7 rutas nuevas (`GET /tenants`,
      `GET/POST /customers`, `GET/POST /invoices`, `GET/POST /sales`), todas tras
      `requireOperatorToken`, validando `businessId` existente/activo. Tests por ruta
      (19 tests nuevos en `service-operator-write-ops.test.ts`, camino feliz + 404 +
      422; el 401 ya está cubierto genéricamente para todo el router en
      `service-operator.test.ts` vía `requireOperatorToken`).
- [x] T2 — `crm-client.ts`: los 8 métodos migran a `requestOperator()` (extendido
      para GET/POST); `createProject` apunta a `/service/operator/proyectos` con
      `confirmado: true`. Método `request()` (Bearer + x-business-id) eliminado por
      quedar sin uso. Typecheck limpio, shape de retorno sin cambios para los callers
      (ops-runner.ts, ops/resolve.ts, ops/dedup.ts intactos).
- [x] T3 — Regresión: suite completa del back verde (269/269, incluye customers,
      sales, invoices, tenants, projects sin tocar) y typecheck limpio de
      chat-gateway.
