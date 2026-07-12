# Proposal: Onboarding — guardado por paso + stepper clicable (modo edición)

## Intent

Petición del usuario (12/07/2026): al editar un negocio ya creado, poder modificar
un único apartado del onboarding y guardarlo sin recorrer los 5 pasos hasta el
botón final "Guardar cambios".

Hoy el wizard (`front/app/onboarding/page.tsx`) tiene **un solo submit** al final:
`finish()` → `updateProject(id, cfg)` → `PATCH /projects/:id` con la config íntegra.
Para tocar solo la marca (paso 2) o los módulos (paso 1) hay que navegar con
"Siguiente" hasta el último paso y guardar todo. UX friccionada.

## Scope

### In Scope (solo MODO EDICIÓN — `?projectId=`)
1. **Refactor sin cambio de comportamiento**: extraer de `finish()` una función
   `persist(cfg)` que hace `updateProject` + `openProject` + `syncHorarioConAviso`,
   **sin** la navegación (`router.push`). `finish()` pasa a llamar `persist(cfg)` y
   luego navegar como hasta ahora.
2. **Botón "Guardar" por paso**: en cada paso, botón `variant="ghost"` (mismo estilo
   que "Volver a proyectos") que llama `persist(draftAsConfig())` y **se queda en el
   paso**. Muestra estado efímero ("Guardando…" / "Guardado ✓").
3. **Stepper clicable**: los círculos numerados del stepper (`page.tsx:236-248`)
   permiten saltar directo a cualquier paso.

### Out of Scope
- **Alta nueva** (`step` arranca en 0): el proyecto aún no existe (`updateProject`
  requiere `editing.id`) → no hay guardado por-paso ni salto libre; mantiene el
  flujo guiado next/back y el submit final "Crear proyecto".
- **Guardado parcial real por sección**: NO se hace merge por sección en backend.
  El botón por-paso reutiliza el `PATCH` existente enviando el draft COMPLETO
  (decisión del usuario 12/07/2026, opción A). En edición el draft ya está hidratado
  con toda la config (`draftForEdit`), así que enviar todo no pierde datos.
- Sin cambios en `back/src/routes/projects.ts` ni en el contrato del `PATCH`.

## Risks
- `PATCH /projects/:id` **pisa `BusinessSetting.datos` entero** (sin merge, sin
  versionado — deuda ya conocida). Guardar por-paso = last-write-wins sobre toda la
  config. Aceptable para operador único; no introduce regresión (el submit final ya
  se comporta así).
- Stepper clicable puede saltar a un paso con datos incompletos. Mitigado: solo se
  habilita en edición, donde la config ya está completa.

## Dependencies
- Reutiliza `updateProject` (`front/lib/tenant-config-context.tsx`), `openProject`,
  `syncHorarioConAviso` — sin cambios de firma.
- Front-only. Sin migraciones. Sin cambios de API.
