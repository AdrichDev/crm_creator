# Validación — crm-voice-realtime-ui

Historia: como **cliente final** quiero ver mi saldo y el avance de mi transcripción sin tener
que refrescar la página, para saber si necesito recargar o simplemente esperar.

## Criterios de aceptación (AC)
- **AC1 (saldo en vivo):** el widget de saldo se actualiza sin recargar la página cuando cambia
  el saldo certificado en backend (evento Realtime/WS recibido).
- **AC2 (estados en orden):** la pantalla de estado de un archivo en proceso refleja los cuatro
  estados en orden (`Subiendo → En cola → Transcribiendo → Finalizado`), sin saltarse pasos ni
  mostrar un estado posterior antes que uno anterior.
- **AC3 (aviso de saldo bajo):** si el saldo cae por debajo de `lowBalanceThreshold`, se muestra
  un aviso visible en el widget.
- **AC4 (front nunca decide negocio):** ninguna acción de subida o envío se bloquea o permite en
  base al saldo estimado localmente; el bloqueo real siempre lo determina la respuesta del
  backend (p. ej. el `402` de `crm-voice-whisper-async`).
- **AC5 (fallback ante desconexión):** si el canal en tiempo real se cae, el front realiza una
  consulta puntual de refresco en vez de dejar el dato mostrado sin indicar que puede estar
  desactualizado.

## Por tarea (Given-When-Then + test)
- **WU1** Publicación Realtime → Given migración que añade las tablas a `supabase_realtime`, When
  se aplica, Then el resto del esquema no cambia (sin ALTER de columnas). Test: migration/schema
  test (verifica que no hay cambios de columnas).
- **WU2** Widget de saldo → Given un evento simulado de cambio de saldo (mock del canal), When se
  recibe, Then el widget refleja el nuevo valor sin recarga de página. Test:
  `saldo-widget.test.tsx` (mock de canal).
- **WU3** Estados de proceso → Given una secuencia simulada de eventos de estado, When llegan en
  orden, Then la UI muestra el paso correspondiente sin retroceder ni saltar. Test:
  `estado-transcripcion.test.tsx`.
- **WU4** Aviso de saldo bajo → Given saldo simulado por debajo del umbral, When se recibe el
  evento, Then aparece el aviso visible. Test: `saldo-widget.test.tsx` (umbral).
- **WU5** Fallback sin realtime → Given el canal se desconecta (mock error/close), When pasa un
  intervalo, Then se dispara una consulta puntual de refresco. Test:
  `realtime-fallback.test.tsx`.
- **WU6** Front nunca decide negocio → Given saldo visual estimado en $0 pero backend aún no
  confirma, When el usuario intenta una acción, Then la UI no bloquea la acción por sí sola (el
  bloqueo, si ocurre, viene de la respuesta del backend). Test: unit que verifica ausencia de
  gate local basado solo en el estado visual.

> Regla del repo: una tarea está DONE solo cuando su test está verde. Sin spec → no code.

## Estado
PROPUESTA — sin iniciar. Depende de que `crm-metering-core` publique su tabla de cuenta en
Supabase Realtime y exponga `lowBalanceThreshold`.
