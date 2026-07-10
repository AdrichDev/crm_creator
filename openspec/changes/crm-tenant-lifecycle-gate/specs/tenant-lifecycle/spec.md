# Spec delta — Capacidad: Ciclo de vida y kill switch por negocio

## ADDED Requirements

### Requirement: Ciclo de vida del negocio
El sistema DEBE modelar un ciclo de vida por negocio con estados `ACTIVE`, `GRACE`,
`SUSPENDED`, `TERMINATED`. El estado DEBE vivir en el servidor y NO DEBE poder ser influido
por datos que envíe el cliente. Los negocios nuevos y los existentes al migrar DEBEN quedar
en `ACTIVE` por defecto.

#### Scenario: Auto-encendido por defecto
- **Given** un negocio recién creado (o migrado)
- **When** no se ha fijado ningún estado explícito
- **Then** su `lifecycle` es `ACTIVE` y opera sin ninguna acción manual

#### Scenario: Transición aplicada con auditoría
- **Given** un negocio `ACTIVE`
- **When** el operador lo pasa a `SUSPENDED` con motivo
- **Then** el estado cambia, se fija `suspendedAt` y se registra un `TenantStateEvent`

### Requirement: Transiciones totalmente reversibles
El sistema DEBE permitir al operador fijar **cualquiera de los 4 estados en cualquier
momento**, incluido `TERMINATED → ACTIVE`. NO DEBE existir ninguna transición ilegal ni
respuesta 409 por máquina de estados. La única validación de escritura es de payload
(estado desconocido o `GRACE` sin `graceUntil` futuro → 400).

#### Scenario: Reactivar un negocio terminado
- **Given** un negocio `TERMINATED`
- **When** el operador lo pasa a `ACTIVE`
- **Then** la transición se aplica, se limpian `graceUntil`/`suspendedAt` y el servicio se
  restaura de inmediato (sin 409)

#### Scenario: Payload inválido
- **Given** una petición de cambio a `GRACE` sin `graceUntil` futuro
- **When** el operador la envía
- **Then** el sistema responde 400 y el estado no cambia

### Requirement: Terminar no borra datos
El sistema NO DEBE borrar datos como efecto de ningún cambio de `lifecycle`. `TERMINATED`
DEBE cortar el acceso (410) conservando todos los datos del negocio, de modo que reactivar a
`ACTIVE` restaure el servicio sin pérdida. El borrado de datos (hard delete) DEBE ser una
acción separada, explícita, irreversible y con doble confirmación, NO ligada al switch ni al
estado `TERMINATED`.

#### Scenario: Reactivación sin pérdida
- **Given** un negocio con datos puesto en `TERMINATED`
- **When** el operador lo reactiva a `ACTIVE`
- **Then** todos los datos del negocio siguen presentes

#### Scenario: El switch nunca purga
- **Given** un negocio en cualquier estado
- **When** el operador cambia su `lifecycle`
- **Then** no se ejecuta ningún borrado de datos

### Requirement: Gate de servicio server-authoritative
El sistema DEBE aplicar un gate en cada request tenant/panel que deniegue servicio según el
estado efectivo del negocio, con caché in-process corta invalidada en cada transición.

#### Scenario: Negocio suspendido
- **Given** un negocio `SUSPENDED`
- **When** llega cualquier request tenant/panel (incluido login)
- **Then** el sistema responde 423 `tenant_suspended`

#### Scenario: Negocio terminado
- **Given** un negocio `TERMINATED`
- **When** llega un request tenant/panel
- **Then** el sistema responde 410 `tenant_terminated`

#### Scenario: Gracia vigente
- **Given** un negocio `GRACE` con `graceUntil` futuro
- **When** llega un request
- **Then** pasa y la respuesta incluye header `x-tenant-grace-until`

#### Scenario: Gracia expirada (perezosa)
- **Given** un negocio `GRACE` con `graceUntil` pasado
- **When** llega un request
- **Then** el gate lo trata como `SUSPENDED` (423) sin escribir el estado

### Requirement: Exenciones del gate
El sistema NO DEBE aplicar el gate a `GET /tenant-status`, al asset de la pantalla de bloqueo
ni a las rutas de operador (`/service/operator`), para que el front pueda explicar el bloqueo
y el operador pueda reactivar.

#### Scenario: Operador puede reactivar un negocio suspendido
- **Given** un negocio `SUSPENDED`
- **When** el operador llama a `/service/operator/businesses/:id/lifecycle`
- **Then** la request pasa (el gate no la corta) y puede volver a `ACTIVE`

### Requirement: Auditoría de transiciones
El sistema DEBE registrar cada transición de estado en `TenantStateEvent` con estado origen,
estado destino, motivo y actor, de forma inmutable.

### Requirement: Pantalla de bloqueo en el cliente
El front DEBE interceptar globalmente las respuestas 423 y 410 y mostrar una pantalla de
bloqueo full-screen, consultando `GET /tenant-status` para explicar el motivo (410 → variante
"cuenta cerrada").

### Requirement: UI de operador para el kill switch
El front de operador (operaOS) DEBE ofrecer un switch verde/rojo que fije `ACTIVE`/`SUSPENDED`
al instante y un selector para fijar `GRACE`/`TERMINATED`, llamando a los endpoints de
operador con el estado destino. La UI NO DEBE contener lógica de estado propia: solo dispara
`PUT lifecycle` y refleja el estado y el histórico.

#### Scenario: Apagar con el switch rojo
- **Given** un negocio `ACTIVE` en la consola de operador
- **When** el operador acciona el switch a rojo
- **Then** se llama a `PUT lifecycle` con `SUSPENDED` y el tenant queda cortado (423)

#### Scenario: Fijar gracia con el selector
- **Given** un negocio en la consola de operador
- **When** el operador elige `GRACE` con una fecha `graceUntil` futura
- **Then** se llama a `PUT lifecycle` con `GRACE` y el `graceUntil` indicado
