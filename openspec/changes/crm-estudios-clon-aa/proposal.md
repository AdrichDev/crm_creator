# Propuesta — crm-estudios-clon-aa (estudios de mercado del CRM = clon de AA)

## Problema
El tab "Estudios de mercado" del CRM (`app/(crm)/estadisticas`) NO se comporta como el
de agents-agency. AA persiste en su back (`api("/api/market-studies")`): lista, ver,
generar, iterar, secciones, prospects, borrar. El CRM usa `useCollection('estudios')`
(localStorage) + un `generateWithAI` de un solo tiro que guarda local → flujo distinto.

## Objetivo
Que el CRM se comporte EXACTAMENTE como AA, reutilizando componentes: listar/ver/generar/
iterar/secciones/prospects contra los endpoints REALES de AA, vía el proxy del CRM
(server-side, con AA_SERVICE_TOKEN ya configurado). DECISIÓN: SIN borrado destructivo
(el service-auth de AA ya bloquea DELETE de market-studies) → el botón "borrar" se
oculta/deshabilita en el CRM. Detalle del estudio en PÁGINA PROPIA (como AA).

## Alcance
- **Proxy CRM**: `app/api/market-studies/[...path]/route.ts` → reenvía GET/POST/PATCH a
  AA con `aaFetch` (Bearer AA_SERVICE_TOKEN). NO reenvía DELETE (404/405). Propaga 402/4xx.
- **Data layer CRM**: `lib/api/market-studies.ts` (cliente) que pega al proxy.
- **UI**: portar de AA `components/stats/StudiesPanel.tsx` (lista) y
  `StudyIterationPanel.tsx` (detalle: generar/iterar/secciones/prospects) + componentes
  que falten (StatusBadge, RecommendedOptionsSection, etc.), REUSANDO los que el CRM ya
  tiene (study-detail, prospects-table, prospects-adjust-panel, study-section-editor,
  structured-content, star-rating). Sustituir el flujo `useCollection('estudios')` por la
  lista real. Página de detalle nueva: `app/(crm)/estadisticas/[id]/page.tsx`.
- Reutilizar el tema/markup del CRM (clases opera/--panel-*), no romper claro/oscuro.

## Fuera de alcance
- Borrar estudios desde el CRM (decisión). Cambiar AA. Metering (la generación no cobra
  al cliente — ya decidido).

## Riesgo
Medio-alto: port multi-componente cross-app + ruta nueva. AA front no es importable desde
el CRM → es PORT (adaptar data calls al proxy), no copia. Validación: tsc + next build +
revisión visual. Sin unit tests del flujo salvo los del data layer.
