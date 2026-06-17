# Proposal — Editar vía onboarding + landing por ZIP + IA en consonancia

**Nivel Gru: 4 — Crítica** (arquitectura nueva, dep. externa ZIP/IA, gasto IA, datos persistentes).
**Estado: PENDIENTE.** Aprobación humana antes de implementar.

## Intención
1. Que "Editar" de un proyecto **lleve al onboarding** (no a un editor aparte), para añadir/quitar apartados
   (módulos) reutilizando el wizard existente.
2. Permitir **subir un ZIP con la landing** del cliente; al "Terminar proyecto" esa landing se **inyecta como
   primera capa** (página pública) con un **login** que entra al CRM.
3. **IA** que analice el front de la landing (paleta, tipografía, tono) y **ajuste el CRM en consonancia**
   (branding tokens, terminología) automáticamente.

## Alcance
- Flujo Editar → onboarding pre-cargado con la config del proyecto (módulos, marca, vertical).
- Ingesta de ZIP: validación (tamaño, tipos), extracción, almacenamiento de assets de landing por proyecto.
- Inyección: ruta pública `/(landing)` que sirve la landing + `/(landing)/login` → CRM.
- Análisis IA: extrae paleta/fuentes del HTML/CSS de la landing → propone branding → aplica a `config.branding`.

## Fuera de alcance
- Editor visual WYSIWYG de la landing. Hosting/CDN externo de assets (futuro: Supabase Storage).

## Contexto técnico
- Onboarding: `app/onboarding/page.tsx` + `ModuleToggleGrid`. Edición de config: `tenant-config-context`.
- "Editar" hoy: consola de proyectos en `app/(dashboard)/page.tsx` (movido por reorg).
- IA: `app/api/ai/generate` + `lib/ai`. ZIP: `jszip` ya está en deps del front.
- Branding runtime: `BrandingStyle` inyecta `--brand-*`.

## Riesgos
- Seguridad: subir ZIP arbitrario = superficie de ataque (path traversal, HTML/JS malicioso en landing servida).
  Sanitizar y aislar. Revisión `cybersec:*`.
- Gasto IA por análisis. Inyección debe ser reversible (no romper el CRM actual).
