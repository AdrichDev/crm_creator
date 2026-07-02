# Validación — crm-castellano-supabase-total

Historia: como agencia quiero gestionar CRMs de clientes 100% sobre Supabase, en castellano,
sin datos locales, creando/abrindo negocios desde la consola y operando cada módulo con datos
reales.

## Criterios de aceptación (AC)
- AC1: ningún dato de negocio sale de `localStorage` en modo API (solo `saas.business.id` y tema).
- AC2: API y modelos en castellano; el front consume el shape 1:1 sin adaptadores ad-hoc por página.
- AC3: la consola `/` lista y crea negocios desde Supabase; "Abrir"→/panel; "Volver"→consola; "Salir"→logout.
- AC4: cada módulo muestra dato real del seed (no mock) y permite alta que persiste en Supabase.
- AC5: 0 columnas muertas; 0 campos que el front pida y no existan.
- AC6: back+front tests verde, tsc limpio, e2e verde.

## Por tarea (Given-When-Then + test)
- 0.1 GET/POST businesses → Given owner con membership, When GET /api/businesses, Then lista sus negocios. Test: e2e/back.
- 0.5 navegación → Given logueado, When abrir negocio y pulsar Volver, Then vuelve a la consola (no /login). Test: e2e `consola-nav`.
- 1.x por módulo → Given seed, When GET /api/<modulo>, Then claves en castellano = shape front. Test: tsc + e2e lectura.
- 3.1/3.2 auditoría → Given inventario, When grep ref back+front por columna, Then 0 muertas. Test: doc + tsc.
- 5.2 cierre → todo verde.

## 3.2 Cablear modelos core (añadido 2026-07-02)
- 3.2.a horario empleado → Given empleado del negocio con horario, When PUT /employees/:id/horario
  con 3 tramos y luego GET, Then devuelve exactamente esos 3 tramos (reemplazo atómico); empleado
  de otro negocio → 422/404. Test: back unit/e2e.
- 3.2.b líneas de venta → Given venta del negocio, When POST /sales/:id/lineas {concepto,cantidad,
  precioUnitario}, Then línea creada, subtotal calculado y Sale.total = Σ subtotales; DELETE línea
  recalcula total. Test: back.
- 3.2.c documentos → Given negocio activo, When POST /documents {titulo,tipo,rutaArchivo}, Then 201
  y GET lo lista solo para ese negocio; employeeId ajeno → 422 cross_tenant. Test: back.
- 3.2.d notificaciones → Given notificaciones sembradas de 2 negocios, When GET /notifications,
  Then solo las del negocio activo, filtrables por estado. Test: back.
- 3.2.e ajustes → Given categoría nueva, When PUT /settings/general {datos} dos veces, Then upsert
  (1 fila, datos actualizados) y GET los devuelve; categoría `config` intocada. Test: back.
- 3.2.f-i front → Given modo API con seed, When se abre la sección correspondiente, Then muestra
  dato real del back y la mutación persiste (verificado con test unit por componente + tsc).

## Verificado (2026-06-25)
- P.1 `/api/tenants`: PROBE 200 con tenants reales de aa.tenant (raw cross-schema). ✓
- P.2 `POST /api/projects`: valida tenant (422/409), crea Business+BusinessSetting+Membership. tsc+back test verde. ✓ (flujo alta no e2e)
- P.3/P.4 e2e `proyectos-supabase.spec.ts` 2/2: login→dashboard(tarjetas, proyectos Supabase)→abrir Estudio Lúa→panel→/clientes (ana@mail.com + Recurrente, scoped por business)→Volver→consola. ✓
- P.5 soft delete: columna eliminado_en + DELETE soft + GET filtra null. ✓ (parcial)
- P.8 columna Employee.rol aplicada. ✓
- smoke 2/2 (consola + onboarding 4 pasos). back 53 · front 89 · tsc back+front limpio.

Estado: EN CURSO. Pendiente P.6 (migración localStorage→Supabase), P.7 (castellano Business/Membership/etc), cablear Employee.rol + extender soft-delete. Marcar OK solo con test verde por tarea.

## Verificado (2026-07-02) — 3.2 cablear modelos core
- Back 3.2.a-e: rutas /employees/:id/horario, /sales/:id/lineas, /documents, /notifications,
  /settings/:categoria montadas. e2e 12/12 VERDES en vivo (back local + Supabase real,
  `node --env-file=.env`): reemplazo atómico horario, 404 empleado/venta ajenos, recálculo
  Sale.total, scoping documentos, filtro estado notificaciones, upsert 1 fila + 403 config + 400
  datos no-objeto. Suite completa back: 172 tests, 0 fail. tsc limpio. ✓
- Front 3.2.f-i: horario-empleado-modal, lineas-venta-modal, documentos-panel respaldado por
  /api/documents (clientes+facturas), tab Notificaciones (admin+API), hooks use-documents/
  use-settings. 292/292 vitest verde (8 nuevos), tsc limpio. ✓
- Decisión 3.2.i: config del panel YA persiste vía PATCH /projects (BusinessSetting 'config',
  reservada con 403 en /settings). useSettings queda para categorías nuevas; no se duplicó la vía. ✓
- Limitación documentada 3.2.h: Document scoped por negocio (sin FK cliente/factura) → el panel
  muestra documentos del negocio; tipo enum OTHER + MIME real derivado del data URL.
