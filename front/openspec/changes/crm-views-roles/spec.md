# Spec — crm-views-roles

## AC-V1 — UI selector de vistas
**Given** el usuario está en el paso "Módulos" del onboarding  
**When** ve la pantalla  
**Then** aparece una sección "¿Qué accesos incluye la app?" ENCIMA de la rejilla de módulos  
**And** muestra 3 chips/checkboxes: Admin (deshabilitado, siempre ON), Trabajador (editable), Cliente (editable)

## AC-V2 — Desactivar vista Trabajador
**Given** la vista "Trabajador" está activa  
**When** el usuario la desactiva  
**Then** los módulos `empleados`, `fichaje`, `vacaciones` se desactivan automáticamente en el draft  
**And** sus toggles aparecen deshabilitados con tooltip "Requiere vista Trabajador"  
**And** no se pueden volver a activar mientras Trabajador esté OFF

## AC-V3 — Reactivar vista Trabajador
**Given** la vista "Trabajador" está desactivada  
**When** el usuario la reactiva  
**Then** los módulos de personas vuelven a ser editables (pero NO se re-activan automáticamente — el usuario elige)

## AC-V4 — Persistencia
**Given** el usuario completa el onboarding  
**When** se guarda la config  
**Then** el objeto `config.views = { worker: boolean; client: boolean }` se persiste en `BusinessSetting`

## AC-V5 — Default
**Given** un proyecto nuevo  
**Then** `views.worker = true`, `views.client = false` (por defecto Trabajador ON, Cliente OFF)

## AC-V6 — Compatibilidad proyectos sin views
**Given** un proyecto creado antes de este cambio (sin campo `views`)  
**When** se carga en el onboarding de edición  
**Then** se aplica el default (`worker: true, client: false`) sin errores
