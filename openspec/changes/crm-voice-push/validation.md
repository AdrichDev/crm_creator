# Validación — crm-voice-push

Historia: como **cliente final** quiero recibir una notificación cuando mi transcripción esté
lista, para no tener que revisar la app constantemente ni dejarla abierta.

## Criterios de aceptación (AC)
- **AC1 (registro):** al registrar un token válido (`platform` + `token`), queda asociado al
  cliente final correspondiente.
- **AC2 (disparo en DONE):** al pasar una transcripción a `DONE`, se dispara un push a todos los
  tokens activos del cliente final propietario.
- **AC3 (no bloqueante):** un fallo en el envío del push no revierte ni bloquea el estado `DONE`
  de la transcripción; el resultado sigue disponible igual.
- **AC4 (limpieza de tokens inválidos):** un token que falla con un error indicativo de invalidez
  (no registrado/expirado) se marca inválido y no se usa en envíos posteriores.
- **AC5 (multi-dispositivo):** un cliente final con varios tokens activos recibe el intento de
  push en todos ellos, no solo en el más reciente.

## Por tarea (Given-When-Then + test)
- **WU1.1** Modelo `PushDeviceToken` → Given migración aplicada, When `prisma migrate status`,
  Then sin drift. Test: schema/migration test.
- **WU2.1** Registro de token → Given un cliente final autenticado, When hace `POST
  /push-tokens` con `platform`+`token` válidos, Then el token queda persistido asociado a su
  `endUserId`. Test: `push-tokens.test.ts`.
- **WU2.2** Baja de token → Given un token existente, When se hace `DELETE /push-tokens/:id`,
  Then deja de usarse en envíos posteriores. Test: `push-tokens.test.ts`.
- **WU3.1** Disparo en DONE → Given una transcripción con 2 tokens activos del mismo cliente
  final (mock `PushSenderPort`), When el worker la marca `DONE`, Then se invoca el envío para
  ambos tokens. Test: `push-dispatch.test.ts`.
- **WU3.2** No bloqueante → Given un envío que falla (mock error de red), When ocurre durante la
  transición a `DONE`, Then `Transcription.status` sigue siendo `DONE` (el fallo de push no
  revierte nada). Test: `push-dispatch.test.ts` (caso fallo).
- **WU3.3** Limpieza de token inválido → Given un envío que responde "no registrado" (mock),
  When se procesa la respuesta, Then el token se marca inválido y no aparece en el siguiente
  cálculo de tokens activos. Test: `push-token-cleanup.test.ts`.

> Regla del repo: una tarea está DONE solo cuando su test está verde. Sin spec → no code.

## Estado
PROPUESTA — sin iniciar. Depende de que `crm-voice-whisper-async` exista con su worker y su
transición a `DONE` disponible como punto de integración.
