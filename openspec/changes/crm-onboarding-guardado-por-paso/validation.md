# Validation: Onboarding guardado por paso

## User Story
Como operador que ya creó un negocio, quiero modificar un solo apartado del
onboarding (p.ej. la marca) y guardarlo desde ese mismo paso, para no recorrer los
5 pasos hasta el botón final.

## Acceptance Criteria
- **AC1** — En modo edición, cada paso muestra un botón "Guardar" (estilo ghost)
  que persiste la config completa del draft y NO cambia de paso.
- **AC2** — Tras pulsar "Guardar" por paso, se persiste vía el mismo `updateProject`
  (`PATCH /projects/:id`) que usa el submit final; ningún campo de otros pasos se
  pierde.
- **AC3** — El botón "Guardar" por paso NO aparece en alta nueva (proyecto inexistente).
- **AC4** — El stepper es clicable en edición: pulsar un círculo salta a ese paso.
- **AC5** — El submit final "Guardar cambios" mantiene su comportamiento actual
  (persiste y navega a `/dashboard`).

## Scenarios (Given-When-Then)

### S1 — Guardar solo la marca sin recorrer pasos (AC1, AC2)
- **Given** un negocio existente abierto en `/onboarding?projectId=X`, situado en el
  paso "Marca"
- **When** el operador cambia el color primario y pulsa "Guardar" del paso
- **Then** se llama `updateProject(X, cfg)` con la config completa (incluye módulos,
  datos, etc. sin alterar) y el wizard permanece en el paso "Marca"

### S2 — Alta nueva no ofrece guardado por-paso (AC3)
- **Given** `/onboarding` sin `projectId` (alta), en cualquier paso
- **When** se renderiza el paso
- **Then** no existe botón "Guardar" por paso (solo next/back y submit final)

## Tests (uno por tarea)
- **T1** (Refactor persist): `finish()` en edición sigue llamando `updateProject`
  con la config completa y navegando — test de caracterización, no regresión.
- **T2** (Guardar por-paso): pulsar "Guardar" del paso invoca `updateProject` con la
  config completa y NO dispara navegación (`router.push` no llamado).
- **T3** (Gating alta): en alta (sin `projectId`) el botón "Guardar" por paso no se
  renderiza.
- **T4** (Stepper clicable): en edición, click en un círculo del stepper cambia `step`.

## Done
Cada tarea DONE solo con su test verde. Sin spec = cambios revertidos.
