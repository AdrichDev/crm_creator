# Spec — Edición de proyecto, landing y consonancia IA

## UC-1 — Editar lleva al onboarding
**WHEN** el admin pulsa "Editar" en un proyecto de la consola
**THEN** se abre el onboarding pre-cargado con la config actual (vertical, módulos, marca, terminología).

- AC-1.1 Cambios de módulos (añadir/quitar apartados) se reflejan en `config.modules` al terminar.
- AC-1.2 Módulos obligatorios no se pueden quitar (toggle disabled).
- AC-1.3 "Terminar" persiste y vuelve a la consola/proyecto sin perder datos existentes.

## UC-2 — Landing por ZIP
**WHEN** durante el onboarding el admin sube un ZIP con la landing
**THEN** al "Terminar proyecto" la landing queda disponible como capa pública con login al CRM.

- AC-2.1 Validación: tamaño máx, solo assets web (html/css/js/img/fonts). Rechaza ejecutables / rutas con `..`.
- AC-2.2 La ruta pública sirve `index.html` de la landing; un botón/enlace "Acceder" lleva al login del CRM.
- AC-2.3 Tras login correcto → panel del CRM del proyecto. Sin login, la landing es pública.
- AC-2.4 Sin ZIP → no se inyecta landing; el CRM funciona como hoy (no regresión).

## UC-3 — IA en consonancia
**WHEN** hay landing subida y el admin pide "ajustar CRM a la landing"
**THEN** la IA analiza paleta/tipografía/tono de la landing y propone branding/terminología para el CRM.

- AC-3.1 La propuesta se PREVISUALIZA antes de aplicar (no auto-aplica a ciegas).
- AC-3.2 Aplicar actualiza `config.branding` (primary/secondary/fuentes) y, si procede, terminología.
- AC-3.3 Reversible: opción "deshacer" restaura el branding previo.
- AC-3.4 El coste IA se informa/controla (reusa `lib/ai` con límites).
