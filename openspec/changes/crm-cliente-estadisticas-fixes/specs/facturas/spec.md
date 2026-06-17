# Spec delta — facturas

## MODIFIED Requirements

### Requirement: Facturas en vista cliente muestran tratamiento, no cliente
Cuando el rol activo es `cliente`, la lista y el detalle de facturas SHALL ocultar la
columna/campo "Cliente" (todas las facturas son del propio cliente) y SHALL mostrar en
su lugar el "Tratamiento" (servicio recibido). Para los demás roles se mantiene la
columna "Cliente". Esta regla aplica a todos los verticales.

#### Scenario: Lista de facturas como cliente
- **WHEN** el rol activo es `cliente` y abre Facturas
- **THEN** la tabla no incluye la columna "Cliente"
- **AND** incluye una columna "Tratamiento" con el servicio de cada factura

#### Scenario: Lista de facturas como admin/trabajador
- **WHEN** el rol activo es `admin` o `trabajador`
- **THEN** la tabla incluye la columna "Cliente" como hasta ahora

#### Scenario: Detalle de factura como cliente
- **WHEN** el rol activo es `cliente` y abre el detalle de una factura
- **THEN** el modal no muestra el campo "Cliente"
- **AND** muestra el "Tratamiento" recibido
