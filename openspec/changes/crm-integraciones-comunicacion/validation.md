# Validacion - crm-integraciones-comunicacion

Historia: como negocio quiero integrar Gmail, WhatsApp y Google Calendar para operar comunicacion y agenda desde el CRM, sin compartir credenciales entre negocios.

## Estado de planificacion

- Proposal: creado en `proposal.md`.
- Spec canonico: creado en `specs/communication-integrations/spec.md`.
- Design: creado en `design.md`.
- Tasks: creadas en `tasks.md`.
- Apply: pendiente. Puede arrancar solo despues de decidir la estrategia de cadena, porque `tasks.md` mantiene `Chained PRs recommended: Yes`, `Decision needed before apply: Yes` y `Chain strategy: pending`.
- Verify/archive: pendientes hasta que exista implementacion, tareas marcadas por `sdd-apply` y `verify-report.md`.

## Criterios de aceptacion cubiertos por spec

- Notify-infra mantiene via unica por despliegue, soft-fail, idempotencia por `eventId` y firma HMAC.
- Gmail usa OAuth2 por `businessId`, valida `gmail.modify`, refresca token, cae a `notify.ts` si la credencial fue revocada y aisla T1/T2.
- WhatsApp guarda/revoca credencial por negocio, delega envio a n8n/Twilio y no reintenta desde el backend.
- Calendar usa OAuth2 tenant, credencial admin separada, polling hacia `crm.reserva`, creacion de eventos al confirmar cita y soft-fail si falla sync.

## Por tarea

El desglose vigente esta en `tasks.md`. Todas las tareas de implementacion y validacion transversal siguen pendientes; no marcar env/smoke/implementacion como completa hasta ejecutar apply y verificacion real.

## Verificado

Validacion documental reparada el 2026-07-04. Sin verificacion funcional todavia: falta implementacion, ejecucion de tests/smoke y `verify-report.md`.
