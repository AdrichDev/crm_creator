# Tasks — crm-trabajador-chips   (Nivel 2 — todas PENDING)

## Fase 1 — Modelo y catálogo
- [ ] 1.1 `lib/config/worker-chips.ts`: catálogo de chips (id, label, icon, dependsOn módulo, descripción).
- [ ] 1.2 Extender `config` con `workerChips: Record<ChipId, boolean>` (patrón `modules`, merge en deserialize).

## Fase 2 — Control del admin
- [ ] 2.1 En Configuración (tab Equipo o Módulos): grid de chips activar/desactivar (look panel, reusa `ModuleGridPanel`).
- [ ] 2.2 Un chip cuyo módulo dependiente está apagado → se muestra deshabilitado con aviso.

## Fase 3 — Render en vista trabajador
- [ ] 3.1 En `panel/page.tsx` (rama `ClienteDashboard`/trabajador) renderizar los chips activos.
- [ ] 3.2 Implementar chips base: Fichaje rápido, Próxima cita, Mis ventas hoy, Disponibilidad, Pedir ausencia.
- [ ] 3.3 Chips dependientes de datos usan `useCollection` existente (citas/ventas/fichaje).

## Fase 4 — Chips con estado nuevo (opcional)
- [ ] 4.1 "Tareas del turno": checklist asignado por admin (mock/localStorage; futuro backend).
- [ ] 4.2 "Disponibilidad": estado del trabajador (disponible/ocupado/pausa) persistido.

## Verificación
- [ ] V.1 Tests de catálogo + toggle. `tsc` + `next build` verde.
- [ ] V.2 Admin activa/desactiva chip → se refleja en la vista del trabajador.
