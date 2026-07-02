# crm-castellano-supabase-total

## Intención
Dejar el CRM "bien desde cero": **100% Supabase, cero almacenamiento local**, y **todo en
castellano end-to-end** (modelos Prisma, rutas/API, front). Sin deuda técnica: cada módulo
queda completo, probado y sin campos/tablas muertas.

## Problema (estado actual, jun 2026)
1. Las páginas del CRM usan el shape del MOCK (campos español). El back devuelve shape Prisma
   (inglés). No casan → con dato real salen filas en blanco. Solo `facturas` y `clientes`
   (ya migrado, piloto) funcionan.
2. Queda `localStorage` por todo: consola del generador (`saas.projects.v1`,
   `saas.active-project.v1`, `saas.role.v1`, `saas.business.id`, `saas.tenant.id`),
   disponibilidad de chips, documentos (data-URLs), seeds mock como fallback.
3. La consola para **crear nuevos CRM de clientes** quedó oculta al activar el modo API
   (`/` redirige a `/panel`). El botón "Volver al home" ya no lleva a esa consola; "Salir"
   manda a `/login`.
4. Tablas con posibles columnas de más (no usadas por ninguna ruta/front) y de menos
   (campos que el front necesita y no existen → se calculan o faltan).
5. Proxies AA (`/api/clients`, `/api/ai/generate`) rotos (AA exige JWT Supabase real).

## Alcance
- **A. Castellano total**: renombrar campos de TODOS los modelos Prisma inglés→español
  (manteniendo `@map` → sin migración de columnas), actualizar TODAS las rutas, whitelists,
  `seed.ts`, tests; front consume shape español 1:1.
- **B. Supabase total (cero local)**: eliminar dependencia de `localStorage` para datos y
  config. Config del tenant desde back. Datos desde back. Sin fallback mock en modo API.
- **C. Consola/onboarding ORIGINAL (NO tocar UX)**: se mantiene la consola generadora
  existente (tarjetas de proyecto + onboarding de 4 pasos con VerticalPicker / ModuleToggleGrid /
  BrandingForm, mismos colores). El ÚNICO fix era: (1) que "Volver" regrese a esa consola y
  (2) eliminar el mock sintético de Estudio Lúa que se metió por error. NO se sustituye por
  dropdowns ni "consola Supabase". [CORREGIDO 2026-06-24 tras feedback del usuario;
  AgencyConsole revertida].
- **D. Auditoría + ADAPTAR core (NO borrar nada)**: la auditoría sirve para saber qué falta,
  NO para eliminar. Modelos hoy sin uso (EmployeeSchedule, Document, Notification, BusinessSetting,
  SaleLine) se CABLEAN al core (horarios de empleado, documentos, notificaciones, líneas de venta)
  con sus componentes/opciones. Añadir columnas que el front necesita (ej. Employee.rol). NO DROP.
- **E. Agregados en back** donde el front los pide (visitas, gastoTotal, segmento, etc.).
- **F. Limpieza AA**: decidir proxies (quitar o documentar Bearer real).

## Fuera de alcance (otros changes)
- `crm-n8n-automations` (16 workflows), `crm-onboarding-edit-landing-ia` (ZIP/landing),
  `crm-sectorial-ia`. Se abordan en sus propios changes.

## Decisiones
- Tenancy **row-level** (schema `crm`), coherente con [[supabase-consolidacion-aa-crm]].
- Castellano por **rename de campo Prisma** (no de columna) → API en español sin migrar BD.
- Consola = herramienta de agencia sobre Supabase (no localStorage). `generar.mjs` (descarga
  de codebase standalone) queda como export secundario, no flujo principal.
