# crm-voice-realtime-ui

> ⚠️ **RE-SCOPE PENDIENTE (09/07/2026, decisión B):** el **widget de saldo prepago SE ELIMINA**
> (`crm-metering-core` MUERTO — el tenant paga su key, no hay saldo del usuario final que mostrar).
> Solo SOBREVIVE la parte de **progreso de transcripción en tiempo real** (Supabase Realtime sobre
> `Transcription.status`). Al reescribir se retira todo lo de saldo/`lowBalanceThreshold`/metering-core.
> No implementar como está.

## Intención
Dar visibilidad en tiempo real, dentro del front del CRM, del **saldo prepago** del cliente
final y del **avance de una transcripción en curso**, sin que el frontend decida nunca si un
consumo se permite o no (esa decisión es siempre del backend).

## Problema
`crm-voice-whisper-async` produce estados (`UPLOADING/QUEUED/TRANSCRIBING/DONE/ERROR`) y
`crm-metering-core` mantiene el saldo real, pero hoy no hay ninguna superficie en el front que
los muestre en vivo: el usuario tendría que refrescar la página o no sabría si su archivo sigue
procesándose o si le queda saldo para el siguiente.

## Alcance
- **Widget de saldo** fijo (barra superior, p. ej. "Saldo: $X") que se actualiza sin recargar la
  página cuando cambia el saldo certificado por backend.
- **Pantalla de estados de proceso** para una transcripción en curso, reflejando
  `Subiendo → En cola → Transcribiendo → Finalizado` vía Supabase Realtime o WebSocket sobre
  `Transcription.status`.
- **Aviso de saldo bajo**: si el saldo cae por debajo del `lowBalanceThreshold` de la cuenta
  (definido por `crm-metering-core`), se muestra un aviso visible.
- El saldo puede **estimarse visualmente** en el front entre eventos (feedback inmediato), pero
  el valor mostrado como autoritativo siempre proviene de una actualización del backend; el
  front **nunca** decide si una acción se permite basándose en su propia estimación.

## Fuera de alcance
- Cálculo, certificación o débito del saldo (responsabilidad de `crm-metering-core`).
- Lógica de cola/worker de transcripción (`crm-voice-whisper-async`).
- Chat sobre transcript (`crm-voice-chat-transcript`).
- Notificaciones push (`crm-voice-push`).
- Cualquier gate de negocio (rechazo de subida, etc.) — eso vive en el backend, no aquí.

## Decisiones
- **Front-only en su mayor parte**: no se añade lógica de negocio nueva en backend; el único
  cambio de infraestructura es habilitar la replicación en tiempo real (Supabase Realtime) sobre
  las tablas ya existentes (`Transcription`, cuenta de `crm-metering-core`), sin tocar su
  esquema ni sus reglas.
- **Backend siempre autoritativo**: cualquier estimación visual (p. ej. descuento local mientras
  se espera confirmación) se reemplaza en cuanto llega una actualización real; nunca se usa para
  habilitar o bloquear una acción.
- **Fallback a consulta puntual**: si el canal en tiempo real se desconecta, el front debe hacer
  una consulta puntual de refresco (polling ligero o fetch al reabrir la vista) en vez de dejar
  el dato "congelado" sin avisar.

## Riesgos
- Acoplamiento al esquema de Realtime de `crm-metering-core` (tabla/columna de saldo) que aún no
  está definida por ese change — este change depende de que esa tabla se publique en
  `supabase_realtime`.
- Reconexiones de socket/canal mal gestionadas podrían mostrar saldo desactualizado sin avisar
  al usuario (mitigado con el fallback de consulta puntual).

## Rollback
Cambio front-only + una migración mínima (habilitar publicación realtime en tablas existentes,
sin alterar su esquema). Revertible sin pérdida de datos.

## Dependencias
- `crm-metering-core` (bloqueante): cuenta END_USER, saldo, `lowBalanceThreshold`, publicación en
  Supabase Realtime.
- `crm-voice-whisper-async` (bloqueante): estados de `Transcription` a reflejar.

## Criterios de éxito
Ver `validation.md` — AC1…AC5 en verde, front tests verdes, `tsc` limpio.
