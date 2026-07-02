# Validación — crm-trabajador-chips

Historia: como **admin de un negocio** quiero activar/desactivar "chips" (widgets/acciones
rápidas) en el panel del trabajador por negocio/rol, y como **trabajador** quiero ver en mi
panel solo los chips activos.

## Criterios de aceptación (AC)
- **AC1:** existe un catálogo de chips (id, label, icon, módulo del que dependen, descripción).
- **AC2:** la config se extiende con `workerChips: Record<ChipId, boolean>` (patrón `modules`,
  merge en deserialize).
- **AC3:** el admin activa/desactiva chips desde Configuración (grid tipo `ModuleGridPanel`);
  un chip cuyo módulo dependiente está apagado se muestra deshabilitado con aviso.
- **AC4:** el panel del trabajador renderiza solo los chips activos, alimentados por
  `useCollection` (citas/ventas/fichaje).
- **AC5:** `tsc` + `next build` verde; el toggle del admin se refleja en la vista del trabajador.

## Por tarea (Given-When-Then + test)
- **1.1/1.2 modelo** → Given catálogo `worker-chips.ts`, When deserialize config, Then
  `workerChips` mergeado con patrón `modules`. Test: unit catálogo.
- **2.1/2.2 control admin** → Given módulo dependiente apagado, When render grid, Then chip
  deshabilitado con aviso. Test: unit.
- **3.1-3.3 render trabajador** → Given chips activos, When panel del trabajador, Then se
  renderizan usando `useCollection`. Test: unit.
- **V.2 reflejo** → Given admin activa/desactiva un chip, When abre la vista del trabajador,
  Then el cambio se refleja. Test: toggle.

> Regla del repo: una tarea está DONE solo cuando su test está verde. Sin spec → no code.

## Estado — DISCREPANCIA (sin verificación registrada)
- **INCOHERENCIA proposal ↔ tasks:** `proposal.md` declara **Estado: PENDIENTE** (Nivel 2, sin
  iniciar) y la cabecera de `tasks.md` dice "todas PENDING", pero TODOS los ítems de `tasks.md`
  (incluidas V.1 `tsc`+`next build` verde y V.2 reflejo admin→trabajador) están marcados `[x]`.
- No hay evidencia de tests concretos nombrados ni de una corrida verde registrada (a diferencia
  de otros changes que citan nº de tests). **Estado real = SIN VERIFICACIÓN REGISTRADA**:
  requiere confirmar con el usuario si el trabajo está hecho (cabeceras obsoletas) o si los
  checkboxes se marcaron por error. Hasta entonces, no dar por verificado.
