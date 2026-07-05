# Propuesta — crm-deuda-p3 (refactor mantenibilidad, SIN cambio de comportamiento)

## Intención
Pagar deuda P3 de clean-code en CRM detectada por la auditoría Agentic Runtime. Refactor PURO:
la salida observable (UI, respuestas REST, estados) NO cambia. Solo estructura.

## Alcance
- **WU1 — dedup model-effort:** unificar `components/config/model-effort-select.tsx`
  (props `onModelChange/onEffortChange`, clases grises de onboarding) y
  `components/ai/model-effort-picker.tsx` (props `onModel/onEffort`, clases `opera-*`)
  en UN componente con prop `variant`. Mantener los 3 call-sites funcionando idénticos:
  - `app/(crm)/estadisticas/page.tsx:226` (picker, opera)
  - `app/(crm)/marketing/page.tsx:99` (picker, opera)
  - `components/config/ai-branding-suggest.tsx:108` (select, config)
- **WU2 — projects POST:** en `back/src/routes/projects.ts` el `POST /` mezcla
  "revivir soft-deleted" + "crear nuevo" + espejo config + membership en un bloque.
  Extraer a funciones privadas legibles (p.ej. `reviveProject`/`createProject`) SIN
  cambiar respuesta, códigos ni la regla de revive (tenant_id @unique).

## Fuera de alcance
- UX del generador, terminología, esquema DB, lógica de negocio. Nada nuevo.

## Riesgo
Bajo-medio. Mitigación: tests verdes + tsc + build, y comparar respuestas antes/después.
