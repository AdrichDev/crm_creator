# Spec delta — Capacidad: Comercial de campo geolocalizado

## ADDED Requirements

### Requirement: Geolocalización de clientes
El sistema DEBE permitir asignar coordenadas (lat/lng) a un cliente por dirección (geocoder) o
manualmente, y registrar el resultado en `geo_estado` (PENDING/OK/FAILED).

#### Scenario: Dirección válida geocodificada
- **Given** un cliente con dirección válida y sin coordenadas manuales
- **When** se guarda el cliente
- **Then** el sistema obtiene lat/lng vía `GeocoderPort` y fija `geo_estado=OK`

#### Scenario: Dirección no encontrada
- **Given** un cliente cuya dirección no resuelve
- **When** se guarda
- **Then** `geo_estado=FAILED` y el cliente queda en la lista de "pendientes de geolocalizar",
  permitiendo introducir coordenadas manuales

### Requirement: Mapa de clientes con estado visual
El sistema DEBE mostrar en un mapa solo los clientes con `geo_estado=OK`, con color/icono según su
estado de visita, y una leyenda visible.

#### Scenario: Marcadores por estado
- **Given** clientes con distintos estados de visita
- **When** se abre el mapa
- **Then** cada marcador usa el color/icono de su estado y la leyenda los explica

### Requirement: Estado de visita separado de categoría ABC
El sistema DEBE tratar el estado de visita y la categoría ABC como conceptos independientes: el
color del marcador depende del estado; la ABC se muestra como badge.

#### Scenario: Cambiar ABC no altera estado
- **Given** un cliente "Visitado" y "A"
- **When** se cambia su ABC a "B"
- **Then** el estado sigue siendo "Visitado" y el marcador no cambia de color

### Requirement: Estados de visita configurables
El administrador DEBE poder crear/editar estados de visita (nombre, color, icono, orden, si cuenta
como pendiente). Los estados de sistema no se pueden borrar.

### Requirement: Notas de cliente inmutables
El sistema DEBE guardar notas con fecha/hora/autor en orden cronológico, sin permitir editar ni
borrar notas anteriores.

#### Scenario: Nota no sobrescribe
- **Given** un cliente con notas previas
- **When** se añade una nota
- **Then** se agrega al histórico sin modificar las anteriores

### Requirement: Registro de visitas
El sistema DEBE permitir registrar una visita (fecha, resultado, nota, próxima acción, estado
posterior), actualizando la última visita del cliente.

### Requirement: Clientes pendientes
El sistema DEBE ofrecer una vista que muestre solo clientes en estados marcados como pendientes.

### Requirement: Ruta a Google Maps
El sistema DEBE abrir Google Maps con destino en el cliente cuando tenga coordenadas válidas, y
bloquear la acción con aviso cuando no las tenga.

### Requirement: Recordatorios de cliente
El sistema DEBE permitir crear recordatorios ligados a cliente con estado pendiente/completado/
cancelado, visibles en la ficha y en la lista de próximos; los vencidos se resaltan.

### Requirement: Prospectos
El sistema DEBE permitir crear prospectos (`tipo_registro=PROSPECTO`) y convertirlos en cliente
conservando notas y visitas.

### Requirement: Cercanía
El sistema DEBE permitir ordenar/filtrar clientes por cercanía a la ubicación del usuario cuando
esta esté disponible.

### Requirement: Importación con detección de duplicados
El sistema DEBE importar clientes desde CSV/XLSX y avisar de posibles duplicados por
nombre/teléfono/dirección antes de crear.

### Requirement: Módulo activable
La capacidad DEBE entregarse como módulo `comercial` activable por negocio, activo por defecto en
el vertical `comerciales`, sin afectar a negocios que no lo activen.
