# Validation: crm-modales-hover-unificados

## User story

Como usuario del CRM (en tema claro u oscuro), quiero que todos los modales tengan el
mismo aspecto (visual opera: borde dorado, header con título, botón cerrar) y que todo
hover se vea con el color secundario de la marca, para percibir una interfaz coherente
donde el feedback de hover siempre sea visible: nunca blanco sobre claro, nunca negro
sobre oscuro.

## Acceptance criteria

- AC1: Existen tokens `--hover-bg`, `--hover-text`, `--hover-border` en `:root` y
  redefinidos en `:root[data-theme="light"]`; ambos derivan del color secundario
  (dorado claro en oscuro, dorado profundo en claro).
- AC2: Ningún componente `.tsx` del CRM usa las utilidades prohibidas
  `hover:text-white`, `hover:bg-white/…`, `hover:bg-gray-*`, `hover:text-gray-*`,
  `hover:border-gray-*` (excepto ficheros fuera de scope documentados).
- AC3: En `globals.css` ningún selector `:hover` aplica blancos/negros directos como
  feedback principal; usan los tokens o `color-mix` sobre `--acc`/`--acc-light`.
  Hovers semánticos (rojo danger, verde approve) se conservan.
- AC4: `nueva-cita-modal`, `nueva-clase-modal` y `nueva-entrenamiento-modal` conservan
  su estilo propio pero con borde theme-aware: en modo oscuro borde blanco/claro que
  contrasta con el backdrop; en modo claro borde oscuro/cálido. Nunca borde fundido
  con el fondo.
- AC5: `dialog-provider` renderiza su panel con clases `opera-modal-*`.
- AC6: Suite front completa en verde tras el cambio.
- AC7: Todo modal, al abrirse, aplica un blur pequeño al fondo (backdrop con
  `backdrop-filter: blur(~4px)`), en ambos temas — opera, "nueva-*" y dialog-provider.

## Given-When-Then

Given el CRM en modo claro (data-theme="light")
When el usuario pasa el ratón por una fila de tabla, un botón fantasma o una tarjeta
Then el feedback usa el dorado profundo (#8a6516 / mix) — visible, nunca blanco.

Given el CRM en modo oscuro (por defecto)
When el usuario pasa el ratón por los mismos elementos
Then el feedback usa `--acc-light` (#e5c158 / mix) — visible, nunca negro ni gris oscuro.

Given cualquier modal genérico (editar/ver información, confirm/alert)
When se abre
Then muestra el chasis visual `.opera-modal` con header, título y botón cerrar.

Given los modales "nueva-*" (cita, clase, entrenamiento)
When se abren en modo claro u oscuro
Then conservan su chasis propio, pero con borde de contraste garantizado
(`.crm-modal-panel`) — nunca fundido con el backdrop.

## Test per task

| Tarea | Test |
|---|---|
| WU1 tokens hover | `tests/hover-tokens.test.ts`: globals.css contiene los 3 tokens en `:root` y en `[data-theme="light"]` |
| WU2 sweep utilidades | `tests/hover-tokens.test.ts`: escaneo de `components/` y `app/` sin patrones prohibidos (lista de excepciones explícita) |
| WU3 modales crear | `nueva-cita-modal.test.tsx`, `nueva-clase-modal.test.tsx`, `nueva-entrenamiento-modal.test.tsx`: assert `.crm-modal-panel` presente (borde theme-aware) |
| WU4 dialog-provider | test en `tests/` que abre confirm y asserta clases `opera-modal-*` |
| WU6 horas en editar cita | `tests/citas-page-edicion.test.tsx`: con API activa el modal de edición muestra chips de slots; sin API, `<input type="time">` |

Un WU está DONE solo con su test en verde.
