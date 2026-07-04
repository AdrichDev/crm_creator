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


