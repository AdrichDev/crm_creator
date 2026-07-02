# Validación: crm-dark-consonancia-onboarding

## Historia de usuario

Como operador de la consola creador_CRM, quiero que el onboarding y la consola respeten
el tema activo al 100% (claro y oscuro), para que ninguna superficie quede blanca en
oscuro ni transparente al seleccionar, y todo hover siga el color secundario de marca.

## Criterios de aceptación

- AC1: al seleccionar una tarjeta (vertical o módulo), su fondo es sólido (mezcla de dorado
  sobre `--panel-card`), nunca `transparent`.
- AC2: ningún remap de hover en `.onboarding` resuelve a `--panel-bg` (negro en oscuro);
  todos los hovers remapeados usan tokens `--hover-*`.
- AC3: en modo oscuro no queda ningún fondo claro fijo (`bg-amber-50/100`, `bg-red-50`,
  `bg-emerald-50`) sin remap en los scopes `.onboarding`/`.crm-console`.
- AC4: no queda `#2563eb` en `client-combobox.tsx` ni `ai-branding-suggest.tsx`.
- AC5: la suite de tests del front pasa completa (sin regresiones).

## Escenario Given-When-Then

- **Given** la consola en modo oscuro (`data-theme` ausente/oscuro) y el onboarding abierto
  en el paso "Tipo de negocio",
- **When** el usuario hace click en la tarjeta "Peluquería",
- **Then** la tarjeta seleccionada muestra fondo sólido dorado-sobre-carta (no se ve la
  rejilla del fondo a través), y al pasar el ratón por otra tarjeta el hover usa el
  secundario de marca (nunca negro).

## Test por tarea

| Tarea | Test |
|---|---|
| WU1 cards sólidas | `tests/dark-consonancia.test.ts` — los ficheros de picker/grid contienen `var(--panel-card))` en el color-mix de selección y no contienen `%, transparent)` en estilos de selección |
| WU2 hover tokens | `tests/dark-consonancia.test.ts` — globals.css: los remaps `hover\:bg-gray-50/100` usan `var(--hover-bg)`; existen remaps `hover\:border-gray-300` → `--hover-border` y `hover\:text-gray-600` → `--hover-text` |
| WU3 tintes aviso | `tests/dark-consonancia.test.ts` — globals.css contiene remaps scoped para `bg-amber-50`, `bg-red-50`, `bg-emerald-50` (y bordes/textos asociados) |
| WU4 azul → tokens | `tests/dark-consonancia.test.ts` — grep `#2563eb` vacío en ambos ficheros |

Una tarea está DONE solo con su test en verde. Suite completa del front como cierre (AC5).
