# Tasks: crm-modales-hover-unificados

- [x] WU1 — Tokens hover theme-aware en `app/globals.css`
  - Añadir `--hover-bg`, `--hover-text`, `--hover-border` a `:root` (base secundario
    `--acc-light`) y override en `:root[data-theme="light"]` (dorado profundo #8a6516).
  - Test: `tests/hover-tokens.test.ts` (presencia de tokens en ambos bloques).

- [x] WU2 — Sweep de hovers neutros
  - `globals.css`: sustituir feedback blanco/negro directo en `:hover` por tokens o
    `color-mix` con secundario (`.row-action.edit`, `.equipo-card`, `.data-table tr` oscuro,
    `.widget-tile-open`, sidebar links, btn-ghost/outline si aplican). Mantener semánticos.
  - Componentes `.tsx`: reemplazar `hover:text-white`, `hover:bg-white/…`,
    `hover:bg-gray-*`, `hover:text-gray-*`, `hover:border-gray-*` por
    `hover:*-[var(--hover-*)]`. Excepciones semánticas documentadas en el test.
  - Test: escaneo automático en `tests/hover-tokens.test.ts`.

- [x] WU3 — Borde theme-aware en modales "nueva-*" (decisión usuario: conservan su estilo)
  - `components/crm/nueva-cita-modal.tsx`
  - `components/crm/nueva-clase-modal.tsx`
  - `components/crm/nueva-entrenamiento-modal.tsx`
  - Mantener visual actual (rounded-2xl, panel propio). Añadir borde con contraste:
    modo oscuro → borde blanco/claro; modo claro → borde oscuro/cálido. Vía token o
    `border-[var(--line)]`-equivalente que garantice contraste sobre el backdrop.
  - Conservar props/callbacks y lógica de formulario.
  - Test: tests existentes de cada modal actualizados (assert clase/token de borde).

- [x] WU4 — `dialog-provider` con visual opera
  - Panel interno con `opera-modal`, `opera-modal-header/-title/-body/-foot`.
  - Test: confirm dialog renderiza clases opera.

- [x] WU6 — Editar cita carga horas como crear cita
  - `app/(crm)/citas/page.tsx`: el flujo de edición usa `HoraChips` (slots de
    `GET /bookings/slots`) igual que `NuevaCitaModal`, con el mismo fallback a
    `<input type="time">` cuando la API no responde o `apiEnabled` es false.
  - Preservar deep-link `/citas?edit=<id>` y el PATCH `/bookings/:id` existente.
  - Test: `tests/citas-page-edicion.test.tsx` ampliado — al editar con API activa
    se muestran chips de hora; sin API, input time.

- [x] WU7 — Blur de fondo en todo modal
  - Todo backdrop de modal aplica un blur pequeño (`backdrop-filter: blur(4px)` /
    `backdrop-blur-sm`), en claro y oscuro: `.opera-modal-backdrop` (ya lo tiene,
    verificar), modales "nueva-*" (hoy `bg-black/50` sin blur), `dialog-provider`,
    y cualquier otro overlay de modal detectado en el sweep.
  - Test: `tests/hover-tokens.test.ts` (o test propio) — escaneo: todo contenedor
    de backdrop de modal incluye clase/regla de blur.

- [x] WU8 — Inputs de fecha theme-aware (fix usuario: fecha se ve en blanco)
  - Regla global en `app/globals.css`: `.opera-shell input[type="date"], input[type="time"]`
    con `color-scheme: dark`, `background-color: var(--panel-card)`, `color: var(--panel-text)`;
    override a `color-scheme: light` en `:root[data-theme="light"]` (mismo patrón que
    `.opera-shell select`). Cubre `opera-control` (EntityModal) y el `inputCls` de
    "nueva-*" sin tocar esos ficheros (ambos son descendientes DOM de `.opera-shell`
    aunque el overlay sea `position: fixed`).
  - NO se tocó `app/(crm)/citas/page.tsx` (reservado a otro minion).
  - Test: `tests/hover-tokens.test.ts` — escaneo de la regla y su override en claro.

- [x] WU5 — Verificación
  - Suite front completa en verde (58 archivos, 384 tests) y `tsc --noEmit` limpio,
    re-verificado tras WU8. Revisión visual claro/oscuro (Playwright manual) queda
    pendiente del usuario.
