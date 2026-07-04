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

## Fase 2: Facturas CRM (PR-3, 04/07/2026 — UI-only, sin cambios de back/schema)

- [x] 2.1 Sustituir la experiencia principal de `facturas/page.tsx` por un listado documental. **DONE (PR-3).**
      `front/app/(crm)/facturas/page.tsx` reescrita al patrón documental de AA
      (`agents-agency/front/app/facturas/page.tsx`): listado + métricas + acción `Ver / Imprimir`
      que alterna a la vista previa; SIN botón "+ Nueva factura" (el alta manual se cerró en
      PR-2b, `POST /api/invoices` → 405; la factura nace al aceptar un pedido). Estado vacío
      cuando no hay facturas. Se conserva la vista cliente (muestra servicio, oculta cliente).
- [x] 2.2 Agregar métricas de facturas, pendientes e importes. **DONE (PR-3).**
      Se consume `computeInvoiceMetrics` (task 1.3, antes sin llamadores). Al ser `front` y
      `back` paquetes SEPARADOS (sin workspace; el front nunca importa de back), se replica la
      función pura idéntica en `front/lib/invoices/metrics.ts` (espejo exacto de
      `back/src/lib/invoices/metrics.ts`; cualquier cambio de criterio debe aplicarse en ambas).
      La página muestra 4 métricas: Facturas, Pendientes, Importe total, Importe pendiente.
- [x] 2.2b (PR-3 fix) Calcular las métricas SERVER-SIDE sobre TODAS las facturas del negocio. **DONE (PR-3, gate Devil's Advocate).**
      BUG detectado en revisión (Devil's Advocate): la task 2.2 derivaba los KPIs en el front con
      `computeInvoiceMetrics(items)`, pero `items` viene de `useCollection` → `GET /invoices`, que
      está PAGINADO (`back/src/lib/pagination.ts`: `limit` por defecto 20, tope 100). Un negocio con
      más facturas que una página veía los KPIs subcontados sin aviso visual. Invisible en demo/local
      (`localBackend.list()` devuelve el array completo sin paginar) → pasaba toda QA manual y solo
      rompía en tenants reales con volumen. Además `back/src/lib/invoices/metrics.ts` (task 1.3) no
      tenía ningún llamador en `back/src` salvo su test. Fix (paridad exacta con AA
      `agents-agency/back/src/routes/invoices.ts`, que emite `{ invoices, metrics }`):
      • Back: `back/src/routes/invoices.ts` (nuevo) separa `GET /invoices` del crudRouter genérico y
        adjunta `metrics` calculadas por `computeBusinessInvoiceMetrics` (nueva, en
        `back/src/lib/invoices/metrics.ts`) sobre TODAS las facturas no eliminadas del negocio (un
        `findMany` aparte SIN `skip`/`take`, mismo scoping `businessId` + `eliminadoEn: null`). GET/:id,
        PATCH, DELETE y POST→405 se heredan sin cambios del crud. `routes/index.ts` monta
        `invoicesRouter()` en vez del crud genérico.
      • Front: `front/lib/data/use-invoice-metrics.ts` (nuevo, espejo del patrón `useDocumentos`). En
        modo API (staff) LEE `metrics` del back; en local/demo (o rol cliente, que recibe 403 en
        `/invoices`) usa `computeInvoiceMetrics` sobre el array completo — correcto porque ahí NO hay
        paginación. `front/lib/invoices/metrics.ts` se conserva SOLO como fallback local (documentado).
        `facturas/page.tsx` consume el hook en vez de calcular sobre `items`.
      • Tests: `back/src/lib/invoices/__tests__/business-metrics.test.ts` (4, en `npm test`) prueba que
        las métricas cuentan 57 facturas aunque superen el page size y que la query NO pagina;
        `invoices.e2e.test.ts` +1 (metrics sobre 25 > page size, live back); front
        `tests/facturas-api-metrics.test.tsx` (1) prueba que la página muestra 57/€7350.00 (server) y
        NO 20/€200.00 (la página). `facturas-documental.test.tsx` (local) sigue verde.
      • Suites: back `npm test` **416 pass / 0 fail**; front vitest **437 pass / 0 fail**. Typecheck back limpio.
- [x] 2.3 Agregar vista previa e impresión conservando documentos adjuntos. **DONE (PR-3).**
      `front/components/facturacion/factura-preview.tsx`: documento imprimible (barra
      Volver/Imprimir con `window.print()`, aislamiento `@media print`, estilos en línea como AA).
      Paridad DELIBERADAMENTE LIGERA: sin tabla de líneas ni desglose de IVA (modelo `crm.factura`
      plano, decisión del dueño en design.md §1); logo por tenant fuera de alcance. Muestra número,
      cliente/servicio, total, estado, y nota "Generada al aceptar un pedido" SOLO si `pedidoId`
      existe (null en facturas manuales/operador/mock — `pedidoId?` añadido a `type Factura`).
      Documentos adjuntos conservados vía `DocumentosPanel` fuera de impresión.
      Tests (vitest + @testing-library, convención del repo): `front/tests/facturas-metrics.test.ts`
      (4), `front/tests/facturas-documental.test.tsx` (5), `front/tests/factura-preview.test.tsx` (6)
      — 15 nuevos, verdes. Suite front completa: **436 pass / 0 fail** (baseline 421 + 15). Typecheck limpio.
      NOTA (deferido, no bloqueante): mostrar el `numero` humano del pedido origen requeriría
      `include: { pedido: true }` en la ruta `/invoices` (cambio de back) — se dejó fuera para
      mantener esta PR estrictamente UI-only; hoy la nota de origen no expone el cuid.

## Fase 3: Pedidos y presupuestos CRM (PR-4, 04/07/2026 — UI-only, sin cambios de back/schema)

- [x] 3.1 Adaptar o crear UI de pedidos con flujo visual equivalente a AA. **DONE (PR-4).**
      Nueva ruta `front/app/(crm)/pedidos/page.tsx` (máquina de vistas listado | alta | preview,
      espejo de `agents-agency/front/app/facturacion/page.tsx`). `components/facturacion/pedido-form.tsx`
      es el espejo visual+funcional del `BudgetForm` de AA (emisor con edición inline persistido en
      `localStorage` `saas.emisor.v1`, combobox de vinculación de cliente, datos de cliente, conceptos
      con cantidad, totales pago único + mensualidad con IVA) adaptado al sistema de diseño del CRM
      (clases `opera-*`, `panel`, primitivas). `components/facturacion/pedido-preview.tsx` es el espejo
      del `BudgetPreview` (cabecera PRESUPUESTO, emisor/cliente, tabla de conceptos, totales con IVA,
      condiciones, barra Volver/Imprimir con aislamiento `@media print`). **Única divergencia permitida
      (design.md §4): logo por tenant fuera de alcance.** Adaptación documentada: el catálogo del CRM
      (`servicios`) es de precio único → se usa como pago único (precioImpl); la columna mensual se
      conserva por paridad de modelo. Ciclo de estados `generada→aceptada→rechazada→caducada` por clic
      en el badge (como AA). **NO se necesitó endpoint PATCH/edición**: la "edición" en AA es una nueva
      versión vía POST (no edita in situ), así que el `/pedidos` existente (PR-2/2b) es suficiente.
- [x] 3.2 Implementar rutas o servicios para guardar líneas, cliente, totales y estado. **DONE (PR-4).**
      La ruta back `/pedidos` ya existía (PR-2/2b: GET listado, GET :id, POST alta con líneas anidadas,
      PUT :id/status con auto-factura). El front se conecta vía el backend conmutable existente:
      `front/lib/data/backend.ts` gana `pedidos: '/pedidos'` en `API_PATH` (alta = POST /pedidos con el
      payload del formulario; el back RECALCULA totales server-side) y `pedidos` en `CLIENT_DENY` (rol
      cliente recibiría 403). El listado y la persistencia local (demo) usan `useCollection<Pedido>`; la
      transición de estado usa un `updateEstado` dedicado (API: PUT /pedidos/:id/status → refetch, con
      captura del guard de des-aceptación 400; local: `update(id,{estado})`). Un pedido aceptado
      muestra en el preview que ya generó su factura (PR-2b), SIN duplicar la pantalla Facturas.
      Semillas mock (`front/lib/mock/data.ts`: tipos `Pedido`/`PedidoLinea` + 3 pedidos de ejemplo).
- [x] 3.3 Evitar que el TPV/carrito sea el flujo obligatorio de pedidos comerciales. **DONE (PR-4).**
      Hoy `ventas` (TPV) era la única superficie de menú para generar un documento comercial. Se añade
      `pedidos` como módulo de PRIMER NIVEL en el sidebar (`lib/config/modules.ts`: nuevo `ModuleId`
      `pedidos`, categoría `retail`, entre Ventas y Facturas; `lib/config/icons.ts` emoji; `shared/
      generate/tenant-types.ts` union), visible/escribible para staff (`lib/config/roles.ts`) y activo
      por defecto en los verticales comerciales + `comerciales` (`lib/config/verticals.ts`). Así crear
      un pedido/presupuesto es una alternativa real y alcanzable al TPV. **`ventas`/`sales`/`service-
      operator.ts` NO se tocan** (adición, no sustitución — design.md §2).
- [x] 3.3b (PR-4 fix) Calcular los KPIs de Pedidos SERVER-SIDE sobre TODOS los pedidos del negocio. **DONE (04/07/2026, gate Devil's Advocate/verify).**
      MISMO BUG que 2.2b, reintroducido en PR-4: `pedidos/page.tsx` derivaba los KPIs
      (Pedidos/Aceptados/Importe) con filter/reduce sobre `items` de `useCollection` → `GET /pedidos`,
      que está PAGINADO (`back/src/lib/pagination.ts`, default 20) → subconteo silencioso con más
      pedidos que una página. Invisible en demo/local (array completo sin paginar). Fix idéntico al
      patrón de PR-3:
      • Back: `back/src/lib/pedidos/metrics.ts` (nuevo): `computePedidoMetrics()` pura +
        `computeBusinessPedidoMetrics()` (un `findMany` APARTE sin `skip`/`take`, scoping
        `businessId` + `eliminadoEn: null`, sin filtro `search` — KPIs del negocio, no de la
        búsqueda). Las métricas replican EXACTAMENTE los 3 KPIs que la página ya mostraba
        (`totalPedidos`, `aceptados` por igualdad exacta, `importeTotal` = suma de `totalImpl` de
        TODOS los estados) — no se inventan métricas nuevas. `GET /pedidos`
        (`back/src/routes/pedidos.ts`) adjunta `metrics` a `{ items, total, page, limit }`.
      • Front: `front/lib/pedidos/metrics.ts` (espejo exacto, fallback SOLO local/demo, documentado) +
        `front/lib/data/use-pedido-metrics.ts` (hook espejo de `use-invoice-metrics.ts`: API lee
        `metrics` del server; local calcula sobre el array completo). `pedidos/page.tsx` consume el
        hook y refresca métricas tras crear/cambiar estado.
      • También (flag menor del reviewer): la sugerencia de `numero` en `startCreate` usaba
        `items.length + 1` (solo la página → sugerencias repetidas con 2+ páginas); ahora deriva de
        `metrics.totalPedidos + 1` (sigue siendo solo una sugerencia editable; el back no exige
        unicidad de `numero`).
      • Tests: back `back/src/lib/pedidos/__tests__/metrics.test.ts` (4) +
        `__tests__/business-metrics.test.ts` (4: 57 pedidos > page size 20, query sin skip/take,
        Decimal, vacío) en `npm test`; `pedidos.e2e.test.ts` +1 (metrics sobre 25 > page size, live
        back, excluido de `npm test`); front `tests/pedidos-metrics.test.ts` (4) y
        `tests/pedidos-page.test.tsx` +2 y KPIs reforzados (modo API muestra 57/21/€12345.00 del
        server y NO el subconteo 2/1 de la página; sugerencia de nº P-{año}-058 desde el total).
      • Suites: back `npm test` **424 pass / 0 fail** (416 + 8); front vitest **457 pass / 0 fail**
        (451 + 6). Typecheck back y front limpios. Sin migración (solo query nueva).
        **`ventas`/`service-operator.ts` NO se tocan.**

## Fase 4: Pruebas

- [x] 4.1 Probar numeración `F00001` sin regresión. **DONE (PR-5, 05/07/2026).**
- [x] 4.2 Probar métricas y documentos de facturas. **DONE (PR-5, 05/07/2026).**
- [x] 4.3 Probar flujo de pedido/presupuesto con vista previa imprimible. **DONE (PR-5, 05/07/2026).**



