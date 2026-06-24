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

## Verificado (2026-06-25)
- P.1 `/api/tenants`: PROBE 200 con tenants reales de aa.tenant (raw cross-schema). ✓
- P.2 `POST /api/projects`: valida tenant (422/409), crea Business+BusinessSetting+Membership. tsc+back test verde. ✓ (flujo alta no e2e)
- P.3/P.4 e2e `proyectos-supabase.spec.ts` 2/2: login→dashboard(tarjetas, proyectos Supabase)→abrir Estudio Lúa→panel→/clientes (ana@mail.com + Recurrente, scoped por business)→Volver→consola. ✓
- P.5 soft delete: columna eliminado_en + DELETE soft + GET filtra null. ✓ (parcial)
- P.8 columna Employee.rol aplicada. ✓
- smoke 2/2 (consola + onboarding 4 pasos). back 53 · front 89 · tsc back+front limpio.

Estado: EN CURSO. Pendiente P.6 (migración localStorage→Supabase), P.7 (castellano Business/Membership/etc), cablear Employee.rol + extender soft-delete. Marcar OK solo con test verde por tarea.
