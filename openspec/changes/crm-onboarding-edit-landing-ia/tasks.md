# Tasks — crm-onboarding-edit-landing-ia   (Nivel 4 — todas PENDING)

> Requiere aprobación humana. Incluye superficie de seguridad (ingesta ZIP) → revisión cybersec.

## Fase 1 — Editar → onboarding  (UC-1 · IMPLEMENTADO)
- [x] 1.1 Botón "Editar" de la consola navega al onboarding con `?projectId=` y pre-carga config.
- [x] 1.2 Onboarding detecta modo edición (vs alta) y persiste sobre el proyecto existente (`setConfig`, no crea).
- [x] 1.3 Verificar add/quitar módulos respeta obligatorios y no rompe nav/permiso. Quitar módulo = ocultar (flag false), datos del proyecto conservados (no borrado).

## Fase 2 — Ingesta de landing (ZIP)  [POSPUESTA — fuera del alcance aprobado]
- [ ] 2.1 Paso onboarding "Landing": dropzone ZIP (usa `jszip`), validación tamaño/tipos/anti path-traversal.
- [ ] 2.2 Almacenar assets por proyecto (local ahora; abstracción para Supabase Storage futuro).
- [ ] 2.3 Sanitizar HTML/JS servido (evitar XSS/scripts no confiables) — revisión `cybersec:redteam-recon` + `blueteam-hardening`.

## Fase 3 — Inyección como capa pública + login  [POSPUESTA — seguridad/auth]
- [ ] 3.1 Grupo de rutas `app/(landing)/` que sirve la landing del proyecto activo.
- [ ] 3.2 `/(landing)/login` → autentica (depende de `crm-gestion-usuarios-auth`) → entra al CRM.
- [ ] 3.3 Sin landing subida → comportamiento actual intacto (no regresión).

## Fase 4 — IA en consonancia
- [ ] 4.1 Extractor: parsea HTML/CSS de la landing → paleta dominante + fuentes + tono.  [POSPUESTA — acoplada a landing/ZIP]
- [x] 4.2 `lib/ai`: prompt que mapea hallazgos → propuesta de `branding`. (UC-3 ligera DESACOPLADA: contexto del negocio → branding, vía proxy con metering; terminología NO se toca, fuera de alcance.)
- [x] 4.3 UI de previsualización + aplicar + deshacer (branding reversible).

## Verificación
- [x] V.1 `npm test` (67 ✓) + `tsc` (limpio) + `next build` (✓, /onboarding static) verde.
- [ ] V.2 e2e: editar proyecto → subir ZIP → terminar → landing pública con login → IA ajusta branding.  [PARCIAL — ZIP/landing pospuestos; cubierto lo de editar + IA branding por unit tests]
- [ ] V.3 Revisión seguridad de la ingesta ZIP/served HTML.  [POSPUESTA con Fase 2/3]
