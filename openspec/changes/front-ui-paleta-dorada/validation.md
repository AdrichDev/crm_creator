# Validación: front-ui-paleta-dorada

## Criterios de aceptación

### AC-1 Pestaña renombrada
**Dado** que el usuario abre la consola de proyectos  
**Cuando** ve las pestañas  
**Entonces** la primera pestaña muestra "Proyecto" (no "Dashboard")

### AC-2 Cards sin ID interno
**Dado** que hay proyectos en la lista  
**Cuando** el usuario ve las cards en la pestaña "Proyecto"  
**Entonces** NO aparece el código interno `crm-01`, `crm-02`, etc.

### AC-3 Hover logout rojo
**Dado** que el usuario pasa el cursor sobre el botón de cerrar sesión (icono puerta)  
**Cuando** hace hover  
**Entonces** el borde y el icono se vuelven rojos (`red-500`), no dorados ni blancos

### AC-4 Onboarding paleta dorada
**Dado** que el usuario está en el flujo de onboarding  
**Cuando** ve los botones "Siguiente", "Atrás", "Crear proyecto"  
**Entonces** el color de acento es dorado (`--gold` / `#c5a028`), no azul

### AC-5 VerticalPicker dorado
**Dado** que el usuario está en el paso "Tipo de negocio"  
**Cuando** selecciona un sector  
**Entonces** el borde y tinte de la card seleccionada son dorados, no azules

### AC-6 ModuleToggleGrid dorado
**Dado** que el usuario está en el paso "Módulos"  
**Cuando** activa un módulo  
**Entonces** el borde y tinte de la card activada son dorados, no azules

### AC-7 Modo claro onboarding visible
**Dado** que el tema es claro (data-theme="light")  
**Cuando** el usuario está en cualquier paso del onboarding  
**Entonces** todo el texto tiene contraste suficiente (ratio ≥ 4.5:1) — no hay texto blanco sobre fondo blanco

### AC-8 Hover btn-primary modo claro contraste
**Dado** que el tema es claro  
**Cuando** el usuario hace hover en "Siguiente" o "Crear proyecto"  
**Entonces** el texto es oscuro (`#0a0a0a`) sobre fondo dorado, no blanco sobre dorado

### AC-9 Exportar paleta neutra modo oscuro
**Dado** que el tema es oscuro y el usuario tiene formatos seleccionados  
**Cuando** el botón "Exportar" de una fila está activo  
**Entonces** el botón usa color de texto/fondo neutro (blanco sobre negro), no dorado

### AC-10 Carpeta destino simplificada
**Dado** que el usuario está en la pestaña "Exportar"  
**Cuando** ve la barra de herramientas  
**Entonces** hay un único botón "Seleccionar carpeta" (no input de texto editable + botón "Buscar")  
**Y** tras hacer click y elegir carpeta, la ruta aparece como texto junto al botón

## Tareas de verificación
- [ ] Cambiar a modo claro y navegar todo el onboarding — revisar contraste
- [ ] Cambiar a modo oscuro y verificar onboarding dorado
- [ ] Verificar hover del logout en consola (rojo)
- [ ] Verificar selección de sector (VerticalPicker dorado)
- [ ] Verificar activación de módulo (ModuleToggleGrid dorado)
- [ ] Verificar botón Exportar activo en modo oscuro (gris/blanco)
- [ ] Verificar que las cards no muestran ID
- [ ] Verificar pestaña "Proyecto"
