# Design — crm-emoji-picker

## D1 — Librería elegida
`@emoji-mart/react` v5 + `@emoji-mart/data` (set español).  
Alternativas descartadas: EmojiPicker.js (más pesada), custom grid (no scalable).

## D2 — Integración SSR
`dynamic(() => import('@emoji-mart/react'), { ssr: false })` dentro de `emoji-picker.tsx`.  
Esto evita errores de `document is not defined` en Next.js 15.

## D3 — Posicionamiento popover
El picker se renderiza como `position: absolute` debajo del botón emoji.  
Si no hay espacio abajo (≤ 400px), abre arriba (igual patrón que `client-combobox`).  
Z-index: overlay `z-20`, picker `z-30`.

## D4 — Interfaz del componente
```tsx
<EmojiPickerButton
  value?: string        // emoji actual (o undefined si sin personalizar)
  fallback: string      // emoji por defecto del módulo/vertical
  onPick: (emoji: string) => void
/>
```

## D5 — Archivos
| Archivo | Acción |
|---------|--------|
| `front/components/ui/emoji-picker.tsx` | Nuevo — botón + popover + overlay |
| `front/components/config/module-toggle-grid.tsx` | Modificar — usar EmojiPickerButton |
| `front/package.json` | Añadir `@emoji-mart/react`, `@emoji-mart/data` |
