# Tareas: Paridad CRM con facturas y pedidos AA

## Previsión de carga de revisión

| Campo | Valor |
|-------|-------|
| Líneas estimadas modificadas | 900-1400 |
| Riesgo de superar 400 líneas | Alto |
| PRs encadenadas recomendadas | Sí |
| División sugerida | PR 1 contratos/modelo → PR 2 UI de facturas → PR 3 UI de pedidos y pruebas |
| Estrategia de entrega | consultar-ante-riesgo |
| Estrategia de cadena | pendiente |

Decisión necesaria antes de aplicar: Resuelta (04/07/2026)
PRs encadenadas recomendadas: Sí
Estrategia de cadena: **PRs encadenadas por fase** (decisión del usuario, 04/07/2026).
  PR-1 = 1.1 + 1.3 (esta PR, ver estado abajo). PR-2 = 1.2 (pedidos). PR-3 = Fase 2 (UI
  facturas). PR-4 = Fase 3 (UI pedidos). PR-5 = Fase 4 (pruebas de flujo completo).
Riesgo de superar 400 líneas: Alto (motivo por el que se encadena)

## Decisiones resueltas (04/07/2026 — ver design.md § Decisiones adicionales resueltas)

1. Profundidad de paridad de facturas: **ligera**, sobre el modelo plano `crm.factura`
   existente. Sin migración, sin presupuestos/líneas/snapshots/IVA nuevos.
2. Modelo de Pedidos: **ruta nueva `/pedidos`**, separada. `ventas` (TPV/carrito) no se
   toca en ninguna fase.
3. Estrategia de entrega: **PRs encadenadas por fase** (ver arriba).

### Unidades de trabajo sugeridas

| Unidad | Objetivo | PR probable | Notas |
|--------|----------|-------------|-------|
| 1 | Compatibilidad de API y modelo | PR 1 | No cambia la UX todavía. |
| 2 | Facturas documentales | PR 2 | Depende de PR 1. |
| 3 | Paridad AA en pedidos/presupuestos | PR 3 | Depende de PR 1 y de la referencia final de AA. |

## Fase 1: Contratos

- [x] 1.1 Caracterizar `/api/invoices` y `/service/operator/invoices` con pruebas de compatibilidad. **DONE (PR-1, 04/07/2026).**
      `back/src/routes/__tests__/invoices.e2e.test.ts` (nuevo): fija /api/invoices
      (crudRouter) — listado paginado, `numero` pasado tal cual del cliente (SIN
      auto-numeración, a diferencia del operador), whitelist de campos, 404
      cross-tenant, PATCH, soft-delete. `back/src/routes/__tests__/service-operator-write-ops.test.ts`
      (ya existía con cobertura amplia de GET/POST /service/operator/invoices,
      lock+transacción, concurrencia) + 1 test nuevo que fija explícitamente el
      caso base: primera factura de un negocio (count=0) → `numero: "F00001"`.
- [x] 1.2 Añadir migración aditiva para pedidos/presupuestos + modelo y ruta `/pedidos`. **DONE (PR-2, 04/07/2026).**
      Modelos `Pedido` + `PedidoLine` (espejo de `Budget`/`BudgetLine` de AA adaptado al CRM:
      `businessId`, `Decimal`, columnas castellano, soft-delete, estados
      `generada|aceptada|rechazada|caducada`) en `back/prisma/schema.prisma`. Migración
      ADITIVA `back/prisma/migrations/20260704010000_pedido/migration.sql` (crea
      `crm.pedido` + `crm.linea_pedido`) — **ESCRITA, NO APLICADA** (misma convención que
      PR-1: se escribe, se marca, no se hace `db push` desde aquí). Función pura
      `back/src/lib/pedidos/totals.ts` (`computePedidoTotals`, espejo de `computeBudgetTotals`
      de AA) + test unitario `back/src/lib/pedidos/__tests__/totals.test.ts` (corre en
      `npm test`). Ruta `back/src/routes/pedidos.ts`: GET listado paginado, GET :id (con
      líneas), POST alta (zod, totales server-side, líneas anidadas), PUT :id/status
      (máquina de estados, SIN efecto factura). Registrada `/pedidos` bajo `staffOnly` en
      `routes/index.ts`. e2e de contrato `back/src/routes/__tests__/pedidos.e2e.test.ts`
      (gated en back vivo; excluido de `npm test`; se ejercita cuando se aplique la migración).
      **`ventas` y `/service/operator/invoices` NO se tocan** (verificado por diff/grep).
      El efecto factura-al-aceptar + cierre del alta manual `POST /api/invoices` van en
      **PR-2b** (tocan la tabla compartida `factura` y retiran una superficie de API viva —
      ver design.md § División de PR-2).
- [x] 1.2b (PR-2b) Auto-factura al aceptar pedido + cierre de `POST /api/invoices` manual. **DONE (PR-2b, 04/07/2026).**
      Migración ADITIVA `back/prisma/migrations/20260704020000_factura_pedido_link/migration.sql`
      (columna `crm.factura.pedido_id` NULLABLE + UNIQUE + FK `ON DELETE SET NULL`) —
      **ESCRITA, NO APLICADA** (convención PR-1/PR-2; el humano corre `migrate deploy`).
      Modelo: `Invoice.pedidoId @unique` + `Invoice.pedido` / `Pedido.invoice` en
      `schema.prisma` (cliente Prisma regenerado). Lógica en `back/src/lib/pedidos/invoice.ts`:
      `ensureInvoiceForPedido()` idempotente vía `factura.pedido_id @unique` +
      `isPedidoUniqueConflict()` (comprobación del `target` del P2002 — NO catch ciego;
      relanza colisiones de otras columnas), `deriveInvoiceNumberFromPedido()`
      (ver design.md § Derivación del `numero`). Enganchado a la transición `aceptada` en
      `back/src/routes/pedidos.ts` (`pedidoStatusHandler`, DI para tests) dentro de una
      `prisma.$transaction` junto al cambio de estado + guard de des-aceptación (salir de
      `aceptada` con factura vinculada → 400). Cierre del alta manual genérica:
      `crudRouter` gana la opción `disableCreate` (`back/src/lib/crud.ts`) → `POST /api/invoices`
      responde **405**; GET/PATCH/DELETE intactos (`routes/index.ts`).
      **`service-operator.ts` (bot Telegram, numeración `F00001`) NO se toca** (diff = 0 bytes,
      usa `prisma.invoice.create` directo, no este crudRouter). **`ventas`/`sales` NO se tocan.**
      Tests: unitarios `back/src/lib/pedidos/__tests__/invoice.test.ts` (derivación + discriminador
      P2002 + swallow/rethrow) y `back/src/routes/__tests__/pedidos-status.test.ts` (guard +
      transacción + hook, DI mockeado) — corren en `npm test`. e2e `pedidos.e2e.test.ts`
      (aceptar→factura idempotente + guard des-aceptación) e `invoices.e2e.test.ts` (POST 405 +
      fixtures por `prisma.invoice.create`) — excluidos de `npm test`, verdes al aplicar migración.
      `npm test`: **410 pass / 0 fail** (baseline 390 + 20 nuevos). Typecheck limpio.
- [x] 1.3 Definir mapeo de estados `Pendiente/Pagada/Anulada` a métricas. **DONE (PR-1, 04/07/2026).**
      `back/src/lib/invoices/metrics.ts`: función pura `computeInvoiceMetrics()`
      (mismo nombre que su equivalente en `agents-agency/back/src/lib/invoices.ts`,
      adaptada a los 3 estados de CRM en vez de los 2 de AA). Extrae y formaliza la
      lógica que hoy vive inline en `front/app/(crm)/facturas/page.tsx` (Stat
      Facturas/Importe total/Pendientes): `importeTotal` suma TODAS las facturas
      sin excluir Anuladas (mismo criterio que hoy). Test: `back/src/lib/invoices/__tests__/metrics.test.ts`.
      Aún NO conectada a ningún endpoint — eso es Fase 2 (UI documental de Facturas).

## Fase 2: Facturas CRM

- [ ] 2.1 Sustituir la experiencia principal de `facturas/page.tsx` por un listado documental.
- [ ] 2.2 Agregar métricas de facturas, pendientes e importes.
- [ ] 2.3 Agregar vista previa e impresión conservando documentos adjuntos.

## Fase 3: Pedidos y presupuestos CRM

- [ ] 3.1 Adaptar o crear UI de pedidos con flujo visual equivalente a AA.
- [ ] 3.2 Implementar rutas o servicios para guardar líneas, cliente, totales y estado.
- [ ] 3.3 Evitar que el TPV/carrito sea el flujo obligatorio de pedidos comerciales.

## Fase 4: Pruebas

- [ ] 4.1 Probar numeración `F00001` sin regresión.
- [ ] 4.2 Probar métricas y documentos de facturas.
- [ ] 4.3 Probar flujo de pedido/presupuesto con vista previa imprimible.


