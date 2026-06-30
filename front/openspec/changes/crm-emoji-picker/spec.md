# Spec — crm-emoji-picker

## AC-E1 — Abrir picker
**Given** el módulo está activo y tiene campo emoji  
**When** el usuario hace clic en el botón emoji del módulo  
**Then** aparece un popover con la paleta de emojis de `@emoji-mart/react`  
**And** hay un overlay detrás con `backdrop-blur-[2px]` (z-20)  
**And** el picker tiene z-30 (encima del overlay)

## AC-E2 — Selección
**Given** el picker está abierto  
**When** el usuario selecciona un emoji  
**Then** se llama a `onSetEmoji(m.id, emoji.native)`  
**And** el picker se cierra  
**And** el botón muestra el emoji seleccionado

## AC-E3 — Cerrar sin selección
**Given** el picker está abierto  
**When** el usuario pulsa fuera del picker (en el overlay o en otra área)  
**Then** el picker se cierra sin cambiar el emoji actual

## AC-E4 — Emoji por defecto
**Given** el módulo no tiene emoji personalizado  
**Then** el botón muestra el emoji resuelto por `resolveModuleEmoji(vertical, m.id)` como fallback visual  
**And** el fallback NO se almacena como valor (sólo visual)

## AC-E5 — SSR
**Given** la página hace SSR  
**Then** el picker no se importa en servidor (dynamic import con `ssr: false`)
