# Validation

## User Story
Como dueño de la Agencia, quiero poder descargar el codigo fuente pre-configurado de las apps moviles y de escritorio de mis clientes, para poder compilarlas en mi propia maquina y entregarselas, esquivando los limites del servidor.

## Acceptance Criteria
- La exportacion de `apk` y `exe` (y opcionalmente `ipa`) debe devolver un archivo ZIP.
- El frontend debe mostrar que se trata de un ZIP y adaptar la interfaz.
- El codigo muerto de compilacion en el servidor (Gradle/Electron) debe ser eliminado.

## Scenarios
**Scenario 1: Descargar App Android**
- Given que un cliente ha configurado su branding en el panel.
- When pulsa en exportar Android
- Then el servidor genera un `.zip` con el codigo fuente adaptado.

## Test Strategy
- Correr la suite local de tests para ver si se rompe algo del export manager.
- Verificar manualmente descargando un ZIP.
