# Validación — crm-estudios-clon-aa

Historia: como agencia quiero que los estudios de mercado del CRM repliquen la experiencia del
módulo de AA (agents-agency) para ofrecer la misma calidad de informe en ambos productos.

## Criterios de aceptación

### AC-1 — Proxy no reenvía borrado
Given un operador autenticado en el CRM
When hace `DELETE /api/market-studies/:id`
Then el proxy responde 405 sin reenviar la petición a AA
And el resto de métodos (GET/POST/PATCH) sí se reenvían con Bearer `AA_SERVICE_TOKEN`.

### AC-2 — Data layer expone el cliente contra el proxy
Given el módulo `lib/api/market-studies.ts`
When se llama a `listStudies()`, `getStudy(id)`, `createStudy(...)`, `generateStudy(id)` o
`patchStudy(id, patch)`
Then cada función hace `fetch` a `/api/market-studies...` con el Bearer del operador
And si la respuesta no es `ok`, la promesa rechaza con el mensaje de error del servidor.

### AC-3 — UI usa datos reales de AA, no localStorage
Given la pestaña "Estudios de mercado" del CRM
When se renderiza `StudiesPanel`
Then llama a `listStudies()` (proxy → AA), no a `useCollection('estudios')`
And no ofrece ninguna acción de borrado en la fila.

## Por tarea
- 1.1 → AC-1, test manual/integración (fuera de unit; cubierto por revisión de código del route.ts).
- 2.1 → AC-2, cubierto por `tests/market-studies.test.ts` (unit, mockeando `fetch` y `getAccessToken`).
- 3.1-3.6 → AC-3, cubierto por lectura de código (studies-panel.tsx no importa `useCollection`
  ni renderiza botón de borrado); sin unit test de UI (fuera de alcance, ver proposal.md).

## Verificado
- 2026-07-04: código de Fases 1-3 confirmado por lectura directa (route.ts, market-studies.ts,
  studies-panel.tsx, study-iteration-panel.tsx, estadisticas/estudios/[id]/page.tsx).
- 2026-07-04: `tests/market-studies.test.ts` añadido y verificado en verde (ver apply-progress).
- Pendiente: V.1 (`tsc`/`next build`) y V.2 (revisión visual manual) — no ejecutados en este pase.
