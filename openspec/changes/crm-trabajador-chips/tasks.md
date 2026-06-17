# Tasks — crm-trabajador-chips   (Nivel 2 — todas PENDING)

## Fase 1 — Modelo y catálogo
- [x] 1.1 `lib/config/worker-chips.ts`: catálogo de chips (id, label, icon, dependsOn módulo, descripción).
- [x] 1.2 Extender `config` con `workerChips: Record<ChipId, boolean>` (patrón `modules`, merge en deserialize).

## Fase 2 — Control del admin
- [x] 2.1 En Configuración (tab Equipo o Módulos): grid de chips activar/desactivar (look panel, reusa `ModuleGridPanel`).
- [x] 2.2 Un chip cuyo módulo dependiente está apagado → se muestra deshabilitado con aviso.

## Fase 3 — Render en vista trabajador
- [x] 3.1 En `panel/page.tsx` (rama `ClienteDashboard`/trabajador) renderizar los chips activos.
- [x] 3.2 Implementar chips base: Fichaje rápido, Próxima cita, Mis ventas hoy, Disponibilidad, Pedir ausencia.
- [x] 3.3 Chips dependientes de datos usan `useCollection` existente (citas/ventas/fichaje).

## Fase 4 — Chips con estado nuevo (opcional)
- [x] 4.1 "Tareas del turno": checklist asignado por admin (mock/localStorage; futuro backend).
- [x] 4.2 "Disponibilidad": estado del trabajador (disponible/ocupado/pausa) persistido.

## Verificación
- [x] V.1 Tests de catálogo + toggle. `tsc` + `next build` verde.
- [x] V.2 Admin activa/desactiva chip → se refleja en la vista del trabajador.
