# Diseño: Paridad CRM con facturas y pedidos AA

## Enfoque técnico

Usar Agents Agency como referencia de UX documental y adaptar CRM por capas: primero contratos y compatibilidad, luego UI de facturas y después pedidos/presupuestos. El modelo `Invoice` existente se conserva y solo se amplía si la paridad exige campos faltantes.

## Decisiones de arquitectura

| Decisión | Elección | Alternativas consideradas | Motivo |
|----------|----------|---------------------------|--------|
| Compatibilidad API | Mantener `/api/invoices` y `/service/operator/invoices` | Reemplazar rutas API | Hay consumidores existentes y numeración asignada por servidor. |
| UI de facturas | Sustituir la experiencia principal operativa actual por documento, listado y métricas | Añadir vista previa a la operativa actual | La paridad requiere flujo funcional, no solo cosmética. |
| Pedidos | Crear o adaptar un flujo documental separado del TPV/carrito | Reusar `ventas` tal cual | El TPV no modela presupuestos ni pedidos comerciales tipo AA. |
| Estados | Mapear `Pendiente/Pagada/Anulada` a métricas documentales | Cambiar estados abruptamente | Reduce migración y conserva datos existentes. |

## Flujo de datos

    UI Facturas CRM ──> rutas invoice existentes ──> Invoice(factura)
           │                    │
           │                    └── numeración F00001 en service/operator
           └── Vista previa / impresión ──> documento CRM estilo AA

    UI Pedidos CRM ──> ruta order/budget ──> líneas + totales + cliente
           └── Vista previa / impresión ──> documento tipo AA

## Cambios de archivos

| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `creador_CRM/back/prisma/schema.prisma` | Modificar | Añadir o ajustar entidad de pedido si no existe y campos documentales necesarios. |
| `creador_CRM/back/src/routes/index.ts` | Modificar | Mantener invoices y exponer pedidos o presupuestos compatibles. |
| `creador_CRM/front/app/(crm)/facturas/page.tsx` | Modificar | Sustituir operativa principal de alta, consulta, edición y borrado por listado, métricas y vista previa imprimible. |
| `creador_CRM/front/app/(crm)/ventas/page.tsx` | Modificar | Separar o adaptar pedidos comerciales tipo AA. |
| `creador_CRM/front/components/*commercial*` | Crear | Componentes reutilizables para documentos comerciales. |

## Interfaces y contratos

- `GET /api/invoices`: conserva la operativa actual y el listado, y añade datos suficientes para métricas y vista previa.
- `POST /service/operator/invoices`: conserva numeración secuencial `F00001`.
- Nuevo contrato de pedidos o presupuestos CRM: cliente, servicio o líneas, totales, estado y vista previa imprimible.

## Estrategia de pruebas

| Capa | Qué probar | Enfoque |
|------|------------|---------|
| Contrato | Endpoints existentes | Pruebas de compatibilidad. |
| Unidad | Estado → métricas | Pruebas de mapeo. |
| UI | Facturas documentales | Pruebas de página y vista previa. |
| Integración | Pedido o presupuesto a documento | Pruebas de flujo completo. |

## Migración y despliegue

Usar PRs encadenadas. No eliminar campos ni rutas existentes. Si se agrega entidad de pedidos, la migración debe ser aditiva y reversible.

## Preguntas abiertas

- [x] **Resuelto (usuario, 04/07/2026):** `ventas` se mantiene intacto como TPV/carrito — NO se toca ni se transforma. Pedidos documentales es una ruta nueva y separada (`/pedidos`), sin reusar ni mutar el modelo/UI de `ventas`.

## Decisiones adicionales resueltas (04/07/2026)

Estas tres decisiones desbloquearon la implementación de PR-1 y quedan fijadas para que
las fases siguientes (1.2 pedidos, 2 UI facturas, 3 UI pedidos) no las vuelvan a discutir:

1. **Profundidad de paridad de facturas: ligera.** La vista documental de Facturas se
   construye sobre el modelo plano EXISTENTE `crm.factura` (numero, cliente, servicio,
   fecha, total, estado, documentos). NO se replica la estructura de presupuestos/líneas/
   snapshots/IVA de AA (`agents-agency/back/src/lib/invoices.ts` usa `totalImpl`/`totalMaint`
   y solo 2 estados `pendiente`/`cobrada`); esa profundidad queda fuera de alcance. No hay
   migración para esta fase.
2. **Modelo de Pedidos: ruta nueva `/pedidos` separada.** No se toca `ventas` (TPV/carrito):
   sigue exactamente igual. Pedidos documental es una superficie nueva e independiente,
   a implementar en una fase posterior (1.2+).
3. **Estrategia de entrega: PRs encadenadas por fase.** PR-1 (esta fase) = 1.1
   (caracterización de contratos) + 1.3 (mapeo puro estado→métricas). Fases 1.2/2/3 son
   PRs futuras separadas, cada una a revisar antes de continuar con la siguiente.

## Decisiones adicionales resueltas (04/07/2026 — desbloquean 1.2 / Pedidos y Facturas)

Fijadas por el dueño del proyecto para que 1.2 (Pedidos), Fase 2 (UI facturas) y Fase 3
(UI pedidos) no las vuelvan a discutir:

4. **El alta de Presupuesto/Pedido es idéntica a la de AA (visual y funcionalmente).**
   Mismos campos, mismo layout y mismo patrón de UX que
   `agents-agency/front/components/facturacion/BudgetForm.tsx` (emisor editable inline,
   combobox de vinculación de cliente, datos de cliente, conceptos/servicios con
   cantidad, totales pago único + mensualidad con IVA). Por tanto el modelo de datos de
   Pedido en CRM es un **espejo del modelo `Budget`/`BudgetLine` de AA**
   (`agents-agency/back/prisma/schema.prisma`), adaptado a las convenciones del CRM
   (multi-tenencia por `businessId`, dinero en `Decimal`, columnas castellano snake_case,
   soft-delete `eliminado_en`). Ciclo de estados idéntico al de AA:
   `generada | aceptada | rechazada | caducada`. **Única divergencia permitida:** el logo
   de la empresa en los documentos impresos es específico por tenant (por diseño, no es un
   gap de paridad).

5. **La factura pasa de alta manual (CRUD) a automática, espejo exacto de AA.** Al aceptar
   un Presupuesto/Pedido (transición a `aceptada`) se auto-crea una factura `crm.factura`,
   con el MISMO patrón que `ensureInvoiceForBudget` en
   `agents-agency/back/src/routes/budgets.ts`: idempotencia por **constraint único +
   comprobación del `target` del P2002** (NO un `catch` ciego — una revisión de Devil's
   Advocate previa en este proyecto detectó justamente ese bug en la primera versión de AA;
   no repetirlo). La clave de idempotencia en CRM es una columna `pedido_id @unique` en
   `factura` (NO se pone `numero` como único: rompería el contrato vigente y el camino del
   operador, que admite `numero` duplicado entre negocios — ver caracterización 1.1).
   - `POST /service/operator/invoices` (bot de Telegram, `routes/service-operator.ts`, con
     su numeración secuencial `F00001`) **NO se toca**: es un consumidor vivo y sigue
     funcionando exactamente igual. El dueño eligió explícitamente NO cerrar ese camino.
   - El alta manual genérica `POST /api/invoices` (crudRouter) **se cierra como superficie
     de creación** una vez exista el camino automático (elección explícita del dueño).
     Se conservan GET/PATCH/DELETE de `/api/invoices`.

### División de PR-2 (auto-scoping, misma disciplina que PR-1)

La 1.2 combina tres superficies de riesgo distintas, así que se parte:

- **PR-2 (esta entrega): fundación aislada y ADITIVA.** Modelos `Pedido` + `PedidoLine`
  (tablas nuevas `crm.pedido` / `crm.linea_pedido`), migración aditiva (escrita, **NO
  aplicada**), función pura `computePedidoTotals()` + test, y la ruta `/pedidos`
  (GET listado, GET :id, POST alta, PUT :id/status como máquina de estados). **Cero
  ediciones a `factura`, `venta` ni al operador.** La transición a `aceptada` funciona y se
  testea como máquina de estados pura, SIN efecto factura todavía.
- **PR-2b (siguiente): efecto factura + cierre del alta manual.** Columna
  `pedido_id @unique` en `factura` (migración que toca la tabla COMPARTIDA), `ensureInvoiceForPedido()`
  idempotente enganchado a la transición `aceptada`, y cierre de `POST /api/invoices`
  (crudRouter) como superficie de creación. `service-operator` intacto.

  Motivo del corte: PR-2 queda puramente aditiva y aislada (tablas nuevas + ruta nueva,
  sin tocar tablas/rutas vivas), revisable y reversible de forma independiente; PR-2b
  concentra el riesgo de ALTERAR `factura` (que el bot vivo escribe) y RETIRAR una
  superficie de API viva. Juntas superarían con holgura las 400-500 líneas.

### PR-2b implementada (04/07/2026) — decisiones de implementación

- **Idempotencia por constraint REAL, no a nivel de app.** `crm.factura.pedido_id` es
  `NULLABLE + @unique` (migración `20260704020000_factura_pedido_link`, escrita, NO aplicada).
  Postgres permite múltiples NULL bajo un índice único → las facturas manuales/del operador
  (`pedido_id` NULL) conviven; sólo se garantiza ≤1 factura por pedido. `ensureInvoiceForPedido`
  captura P2002 pero **sólo lo trata como "ya facturado" si `err.meta.target` es la columna
  `pedido_id`** (`isPedidoUniqueConflict`, contempla `pedido_id`/`pedidoId`/nombre del índice);
  un P2002 de OTRA columna se RELANZA (no se traga en silencio — evita el bug de catch ciego
  que Devil's Advocate detectó en AA). Cambio de estado + creación de factura van en una
  `prisma.$transaction`: si la factura falla, el pedido no queda `aceptada` sin factura.
  Guard de des-aceptación: salir de `aceptada` con factura vinculada → 400 (no huérfana la
  factura). `onDelete: SET NULL` en la FK: la factura (registro financiero) sobrevive a un
  borrado en duro del pedido, y no crea conflicto con el CASCADE de negocio→pedido/factura.

- **Derivación del `numero` de la auto-factura (decisión contenida, sin fork).**
  `deriveInvoiceNumberFromPedido(pedidoNumero)` intercambia el prefijo de tipo de documento
  por `"FAC - "`, misma idea que `deriveInvoiceNumber` de AA (`"AD-2026-001" → "FAC - 2026-001"`).
  Diferencia con AA: AA quita el prefijo fijo `AD-`; aquí se quita **cualquier** prefijo
  alfabético inicial seguido de guion (`/^[A-Za-z]+-/`) para no acoplarse a un prefijo concreto,
  ya que el `numero` del pedido lo teclea el formulario (como en AA) y puede variar por tenant
  (`P-17 → FAC - 17`, `2026-007 → FAC - 2026-007`). Estable/idempotente: mismo `numero` de
  pedido ⇒ mismo `numero` de factura, sin secuencia ni carrera. **NO se exige unicidad de este
  `numero`** (la idempotencia real es `pedido_id @unique`): así se respeta el contrato del CRM,
  donde el `numero` de factura NO es único (caracterización 1.1). Por qué es contenido y no un
  fork que requiera firma humana: es un detalle de nomenclatura reversible, sin impacto en
  datos existentes ni en el contrato del operador; se documenta aquí y en el código.

- **`total` de la auto-factura = `totalImpl + totalMant`** (ambos con IVA). No es un fork:
  sigue la convención de agregación ya fijada por `computeInvoiceMetrics` (task 1.3,
  `back/src/lib/invoices/metrics.ts`, y su equivalente en AA), donde el importe de una factura
  es `totalImpl + totalMaint`. `cliente` se deriva de `clienteSnapshot.nombre` (fallback `''`);
  `servicio` = null (el detalle documental vive en las líneas del pedido enlazado); `estado`
  inicial `'Pendiente'` (modelo de 3 estados del CRM); `fecha` = hoy `YYYY-MM-DD`.

- **Cierre del alta manual sólo en la superficie genérica.** `crudRouter` gana la opción
  `disableCreate` → `POST /api/invoices` responde **405** (`method_not_allowed`); GET/PATCH/DELETE
  intactos para el listado/detalle/edición. **`POST /service/operator/invoices` NO se toca**:
  es otro router y usa `prisma.invoice.create` directamente, no este crudRouter (diff de
  `service-operator.ts` = 0 bytes). El front (`facturas → /invoices`) pierde el alta manual por
  diseño del dueño: la factura nace al aceptar un pedido.


