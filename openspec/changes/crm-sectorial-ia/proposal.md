# Propuesta — CRM sectorial con IA y contabilidad de tokens compartida

**ID del cambio:** `crm-sectorial-ia`
**Estado:** Borrador
**Autor:** Equipo 3A Estudio
**Fecha:** 2026-06-17

## Contexto

`creador_CRM` genera, por cada negocio, un CRM configurable por vertical (peluquería, estética,
clínica, taller, abogados, gimnasio, veterinario, hostelería…). Hoy:

- Los datos de ejemplo (mocks) son genéricos (siempre estilo peluquería), no reflejan el sector.
- No hay vínculo con los **clientes reales** de `agents-agency` ni con su **contabilidad de tokens**.
- No existe el panel de **Estadísticas** ni generación con IA (plan de marketing / estudio de mercado).
- El CRM solo tiene tema oscuro; el modo claro de `agents-agency` está roto.

## Objetivo

1. **Mocks acordes al sector**: al generar un negocio, los clientes, servicios/tarifas y documentos
   de ejemplo corresponden al sector (p. ej. veterinario → especie/raza + informes veterinarios;
   abogados → tarifas por tipo de caso: divorcio, penal, violencia de género, hurto…, con duración
   y precio de sesión; clínica/fisio → informes médicos).
2. **Vínculo con cliente real**: tabla `crm_project(id_crm, id_cliente, …)` en la BD del CRM. Al
   configurar el negocio, un **selector de clientes** (alfabético, máx. 20 + scroll, filtro por
   nombre) traído de `agents-agency`; el paso **Datos** auto-rellena desde un endpoint.
3. **IA con tokens compartidos**: el CRM genera *plan de marketing* y *estudio de mercado* mediante
   el backend de `agents-agency`, eligiendo **modelo** y **effort**. El consumo se contabiliza en el
   **mismo** ledger de tokens del cliente (`tokensUsed` + `tokenUsage`) que el resto de `agents-agency`.
4. **Panel de Estadísticas** idéntico al de `agents-agency`, como módulo seleccionable.
5. **Tema claro/oscuro** en el CRM siguiendo el SO (prefers-color-scheme) con override manual, y
   **arreglo del modo claro** de `agents-agency`.

## Fuera de alcance

- Almacenamiento del binario real de documentos (solo metadatos por ahora; bucket en fase aparte).
- Autenticación/login real (sigue el selector de rol de demo).

## Criterios de éxito

- Todos los casos de uso del `spec.md` cumplen sus criterios de aceptación.
- `npm run test` (Vitest) y `npm run test:e2e` (Playwright) en **verde**.
- El cómputo de tokens de una generación IA del CRM es visible y coherente en `agents-agency`
  (mismo cliente, `tokensUsed` incrementado, fila en `tokenUsage`).
