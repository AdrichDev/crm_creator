# Tasks — crm-onboarding-edit-landing-ia   (Nivel 4 — todas PENDING)

> Requiere aprobación humana. Incluye superficie de seguridad (ingesta ZIP) → revisión cybersec.

## Fase 1 — Editar → onboarding
- [ ] 1.1 Botón "Editar" de la consola navega al onboarding con `?projectId=` y pre-carga config.
- [ ] 1.2 Onboarding detecta modo edición (vs alta) y persiste sobre el proyecto existente.
- [ ] 1.3 Verificar add/quitar módulos respeta obligatorios y no rompe nav/permiso.

## Fase 2 — Ingesta de landing (ZIP)
- [ ] 2.1 Paso onboarding "Landing": dropzone ZIP (usa `jszip`), validación tamaño/tipos/anti path-traversal.
- [ ] 2.2 Almacenar assets por proyecto (local ahora; abstracción para Supabase Storage futuro).
- [ ] 2.3 Sanitizar HTML/JS servido (evitar XSS/scripts no confiables) — revisión `cybersec:redteam-recon` + `blueteam-hardening`.

## Fase 3 — Inyección como capa pública + login
- [ ] 3.1 Grupo de rutas `app/(landing)/` que sirve la landing del proyecto activo.
- [ ] 3.2 `/(landing)/login` → autentica (depende de `crm-gestion-usuarios-auth`) → entra al CRM.
- [ ] 3.3 Sin landing subida → comportamiento actual intacto (no regresión).

## Fase 4 — IA en consonancia
- [ ] 4.1 Extractor: parsea HTML/CSS de la landing → paleta dominante + fuentes + tono.
- [ ] 4.2 `lib/ai`: prompt que mapea hallazgos → propuesta de `branding`/terminología.
- [ ] 4.3 UI de previsualización + aplicar + deshacer (branding reversible).

## Verificación
- [ ] V.1 `npm test` + `tsc` + `next build` verde.
- [ ] V.2 e2e: editar proyecto → subir ZIP → terminar → landing pública con login → IA ajusta branding (preview→aplica→deshace).
- [ ] V.3 Revisión seguridad de la ingesta ZIP/served HTML.
