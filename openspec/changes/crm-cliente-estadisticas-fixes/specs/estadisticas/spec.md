# Spec delta — estadisticas

## MODIFIED Requirements

### Requirement: Panel de estadísticas con KPIs y gráficas
La página de Estadísticas SHALL replicar el panel de agents-agency con pestañas
"Dashboard" y "Estudios de mercado", mostrando KPIs, gráficas de actividad y
facturación, y distribuciones (donuts), derivados de los datos del tenant.

#### Scenario: Dashboard con KPIs y gráficas
- **WHEN** el usuario abre Estadísticas
- **THEN** ve tarjetas KPI (Clientes, Citas, Ingresos, Servicios, Productos)
- **AND** una gráfica de actividad mensual y otra de facturación por estado
- **AND** donuts de servicios por categoría y clientes por segmento

#### Scenario: Drilldown por periodo
- **WHEN** el usuario hace clic en una barra de la gráfica de actividad
- **THEN** se muestra un panel con el detalle del periodo seleccionado

### Requirement: El admin no ve tokens ni "cliente vinculado"
La página de Estadísticas SHALL NOT mostrar el consumo de tokens ni el indicador
"Cliente vinculado" en ninguna vista ni modal.

#### Scenario: Sin métricas de plataforma
- **WHEN** el admin abre Estadísticas
- **THEN** no existe ninguna tarjeta, columna ni nota que mencione "Tokens" o
  "Cliente vinculado"
