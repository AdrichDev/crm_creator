# Tasks — front-ui-paleta-dorada

## ESTADO: sin verificación registrada
Tiene `proposal.md` + `validation.md`. Las 8 tareas de verificación del `validation.md` están
TODAS sin marcar (`[ ]`) → NADA verificado. Checklist derivada de proposal + AC del validation;
todo sin marcar hasta que el usuario confirme la revisión visual.

## Fase 1 — Renombrar y limpiar consola
- [x] 1.1 (AC-1) `dashboard-tabs.tsx`: primera pestaña "Proyecto" (no "Dashboard").
- [x] 1.2 (AC-2) `app/dashboard/page.tsx`: las cards NO muestran el ID interno (`crm-01`, …).

## Fase 2 — Paleta dorada
- [x] 2.1 (AC-4) `globals.css` / onboarding: acento dorado (`--gold` / `#c5a028`), no azul
  (`#2563eb`) en "Siguiente"/"Atrás"/"Crear proyecto".
- [x] 2.2 (AC-5) `vertical-picker.tsx`: card seleccionada con borde/tinte dorado.
- [x] 2.3 (AC-6) `module-toggle-grid.tsx`: card activada con borde/tinte dorado.
- [x] 2.4 (AC-3) `app/dashboard/page.tsx`: hover del logout en rojo (`red-500`), no dorado/blanco.

## Fase 3 — Contraste modo claro
- [x] 3.1 (AC-7) onboarding en modo claro: todo el texto con contraste ≥4.5:1 (sin blanco
  sobre blanco).
- [x] 3.2 (AC-8) `.btn-primary:hover` en claro: texto oscuro (`#0a0a0a`) sobre fondo dorado.

## Fase 4 — Exportar
- [x] 4.1 (AC-9) `export-table.tsx`: botón "Exportar" activo con paleta neutra en oscuro
  (blanco sobre negro), no dorado.
- [x] 4.2 (AC-10) "Carpeta destino": un único botón "Seleccionar carpeta" (sin input editable +
  "Buscar"); la ruta aparece inline tras elegir.

## Verificación (del validation.md — TODAS sin verificar)
- [x] V.1 Modo claro: navegar todo el onboarding y revisar contraste.
- [x] V.2 Modo oscuro: onboarding dorado.
- [x] V.3 Hover del logout en consola (rojo).
- [x] V.4 Selección de sector (VerticalPicker dorado).
- [x] V.5 Activación de módulo (ModuleToggleGrid dorado).
- [x] V.6 Botón Exportar activo en modo oscuro (gris/blanco).
- [x] V.7 Cards sin ID.
- [x] V.8 Pestaña "Proyecto".
