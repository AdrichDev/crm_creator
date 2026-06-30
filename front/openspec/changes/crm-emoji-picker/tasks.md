# Tasks — crm-emoji-picker

> Change: `crm-emoji-picker` · Nivel 1

## E1. Instalar dependencias
- [x] E1.1 `npm install @emoji-mart/react @emoji-mart/data` en `front/`

## E2. Componente EmojiPickerButton
- [x] E2.1 Crear `front/components/ui/emoji-picker.tsx` `'use client'`
- [x] E2.2 Importar picker con `dynamic(..., { ssr: false })`
- [x] E2.3 Estado `open: boolean`, `dropUp: boolean`
- [x] E2.4 `useEffect` al abrir: calcular `dropUp` (espacio < 420px)
- [x] E2.5 Overlay `fixed inset-0 z-20 backdrop-blur-[2px]` cuando `open`
- [x] E2.6 Botón que muestra emoji actual o fallback
- [x] E2.7 Picker posicionado `absolute z-30` arriba o abajo según `dropUp`
- [x] E2.8 `onEmojiSelect` → llama `onPick(emoji.native)` y cierra
- [x] E2.9 Cerrar al hacer clic en overlay (`onMouseDown` en overlay)

## E3. Integrar en ModuleToggleGrid
- [x] E3.1 Sustituir `<input maxLength={4} ...>` por `<EmojiPickerButton value={emojis?.[m.id]} fallback={resolveModuleEmoji(vertical, m.id)} onPick={(e) => onSetEmoji(m.id, e)} />`
- [x] E3.2 Mantener la preview `→ 🔤` con el emoji resuelto

## Cierre
- [x] Z1 `cd front && npx tsc --noEmit` — 0 errores
- [x] Z2 `cd front && npm test -- --run` — todos verdes
