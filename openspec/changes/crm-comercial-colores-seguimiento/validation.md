# Validación — crm-comercial-colores-seguimiento

Historia: como **comercial de campo** quiero ver de un vistazo en el mapa qué clientes gastan
mucho o poco y cuáles tengo en seguimiento, y que la aplicación me avise de los compromisos
vencidos, para priorizar visitas sin repasar ficha a ficha.

## Criterios de aceptación (AC)
- **AC1:** el mapa tiene un selector exclusivo de modo de color (Estado | Categoría/gasto); al
  cambiar, los marcadores y la leyenda se actualizan de forma coherente y nunca conviven dos
  semánticas de color a la vez.
- **AC2:** en modo gasto, A/B/C tienen colores fijos y distinguibles; el estado de visita sigue
  visible como badge en popup y ficha (y viceversa en modo estado).
- **AC3:** el modo elegido persiste entre sesiones del mismo navegador.
- **AC4:** la pestaña "Seguimiento" lista, en orden: recordatorios vencidos, de hoy, próximos, y
  clientes en estado pendiente con próxima acción; cada ítem permite completar / abrir ficha / Ir.
- **AC5:** `/reminders/summary` devuelve contadores correctos (vencidos, hoy, próximos 7 días)
  escopado por negocio y usuario.
- **AC6:** la campana muestra badge = vencidos+hoy; al completar un recordatorio el contador baja
  sin recargar la página.
- **AC7 (no regresión):** modo por defecto = estado de visita (comportamiento actual); mapa,
  filtros y ficha funcionan igual que hoy con el selector sin tocar.

## Por tarea (Given-When-Then + test)
- **WU1.1** Resolver color → Given cliente con estado y ABC, When `markerColor(cliente, modo)`,
  Then color del estado en modo estado y color ABC en modo gasto. Test: unit `marker-color.test.ts`.
- **WU1.2** Leyenda → Given modo gasto, When render leyenda, Then muestra A/B/C con etiquetas
  de gasto y oculta estados. Test: unit render.
- **WU1.3** Persistencia → Given modo cambiado, When recarga, Then modo restaurado. Test: unit
  (mock storage).
- **WU2.1** Orden del panel → Given recordatorios vencido/hoy/futuro + cliente pendiente con
  próxima acción, When se construye la lista, Then orden vencido→hoy→próximo→pendiente. Test:
  unit sobre helper puro de ordenación.
- **WU2.2** Acciones inline → Given ítem recordatorio, When completar, Then PATCH y desaparece de
  vencidos. Test: unit + e2e si aplica.
- **WU3.1** Summary → Given 2 vencidos, 1 hoy, 3 próximos de dos negocios distintos, When GET
  `/reminders/summary`, Then cuenta solo los del negocio/usuario del token. Test: node:test
  `reminders.summary.test.ts` (incluye aislamiento cross-tenant).
- **WU4.1** Campana → Given summary con vencidos>0, When render, Then badge visible con el número;
  Given completar último vencido, Then badge decrementa tras revalidar. Test: unit.

> Regla del repo: una tarea está DONE solo cuando su test está verde. Sin spec → no code.
