# Spec delta — Capacidad: Voz (módulo)

## ADDED Requirements

### Requirement: Registro de dispositivo para push
El sistema DEBE permitir a un cliente final registrar y dar de baja tokens de dispositivo
(Android/iOS) para recibir notificaciones push.

#### Scenario: Alta de token
- **Given** un cliente final autenticado
- **When** registra un token de dispositivo válido
- **Then** el token queda asociado a su cuenta y disponible para envíos futuros

### Requirement: Notificación push al finalizar la transcripción
El sistema DEBE enviar una notificación push a todos los tokens activos del cliente final
cuando su transcripción pase a estado `DONE`.

#### Scenario: Múltiples dispositivos
- **Given** un cliente final con dos tokens activos
- **When** su transcripción pasa a `DONE`
- **Then** se intenta el envío del push en ambos tokens

### Requirement: Fallo de push no bloquea el negocio
Un fallo en el envío de la notificación push NO DEBE revertir ni bloquear el estado `DONE` de la
transcripción.

#### Scenario: Envío fallido
- **Given** un envío de push que falla por error de red
- **When** ocurre durante la transición a `DONE`
- **Then** la transcripción permanece en `DONE` y el resultado sigue disponible

### Requirement: Limpieza de tokens inválidos
El sistema DEBE marcar como inválido un token de dispositivo cuando el proveedor de push
responde que ya no está registrado, y dejar de usarlo en envíos posteriores.
