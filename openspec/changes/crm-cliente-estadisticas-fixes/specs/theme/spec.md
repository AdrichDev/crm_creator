# Spec delta — theme

## ADDED Requirements

### Requirement: Tablas legibles en claro y oscuro
Toda tabla del panel SHALL usar el token `--panel-text` para el texto principal de las
celdas, de forma que el contenido sea legible tanto en tema claro como oscuro.

#### Scenario: Nombre legible en tema oscuro
- **WHEN** el panel está en tema oscuro
- **THEN** la primera columna de cada tabla es legible (no texto oscuro sobre fondo oscuro)

### Requirement: Fondo de rejilla en el panel
El shell del panel SHALL mostrar un patrón de rejilla sutil al estilo de agents-agency,
con un color de rejilla re-tematizado para claro y oscuro vía `--grid-color`.

#### Scenario: Rejilla visible en ambos temas
- **WHEN** el usuario cambia entre tema claro y oscuro
- **THEN** la rejilla de fondo permanece visible y sutil en ambos

### Requirement: Tema claro/oscuro cubre el dashboard
El modo claro (`data-theme="light"`) SHALL aplicarse también a las tarjetas KPI,
gráficas y tablas del dashboard, no sólo al chrome.

#### Scenario: Dashboard en tema claro
- **WHEN** el usuario activa el tema claro
- **THEN** KPIs, gráficas y tablas del dashboard adoptan colores claros legibles
