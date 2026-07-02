# Tareas — crm-comercial-colores-seguimiento

Prerequisito: migración de `crm-comercial-campo` aplicada en Supabase.
Orden: front color → panel → back summary → campana. Ruflo gate antes de push.

## WU1 — Modo de color del mapa
- [x] 1.1 Helper puro `markerColor(cliente, modo)` + colores ABC fijos (A dorado, B azul, C gris)
      + test unit.
- [x] 1.2 Selector de modo en la page `/comercial` + leyenda dinámica según modo + test render.
- [x] 1.3 Persistir modo (localStorage con clave por tenant) + test con mock storage.
- [x] 1.4 Popup/ficha: badge de la dimensión no coloreada siempre visible (verificado: la ficha
      ya mostraba EstadoVisitaBadge + AbcBadge simultáneamente, sin depender del modo).

## WU2 — Panel Seguimiento
- [x] 2.1 Helper puro `buildFollowUpList(reminders, clientesPendientes)` con orden
      vencido→hoy→próximo→pendiente + test unit.
- [x] 2.2 Pestaña "Seguimiento" en `/comercial`: lista con acciones completar / ficha / Ir
      (reusa `maps-link` y PATCH reminder existentes).

## WU3 — Back: summary
- [x] 3.1 GET `/reminders/summary` (vencidos, hoy, próximos 7d; agregados count, escopado
      businessId+usuario) + node:test con aislamiento cross-tenant (skip sin back vivo, igual
      que el resto de la suite e2e en este entorno).

## WU4 — Campana de notificaciones
- [x] 4.1 Componente campana en el shell del CRM (solo si módulo `comercial` activo): badge desde
      summary, dropdown con ítems, deep-link a ficha.
- [x] 4.2 Revalidación al enfocar ventana y tras completar recordatorio + test unit.

## Cierre
- [x] Z.1 back + front tests + tsc limpios (back: 225 pass/0 fail/52 skip sin back vivo; front:
      334/334 vitest + tsc limpio). Smoke Playwright NO ejecutado: requiere front+back live, fuera
      del alcance de este entorno de apply.
- [x] Z.2 Ruflo review HECHO (02/07/2026): summary y campana limpios (scoping
      businessId+responsableId correcto, polling solo en focus, sin fugas cross-tenant).
      Sin bloqueantes. Sin commit todavía.
