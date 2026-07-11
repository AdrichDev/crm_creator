# crm-voice-push

> ✅ **RE-SCOPE MÍNIMO (09/07/2026, decisión B):** esta change NO dependía de metering — SE SALVA casi
> igual. Único ajuste al reescribir: alinear con `crm-voice-whisper-async` ya reescopado (worker que
> transcribe con la key del tenant, sin metering). El modelo/endpoint/disparo de push no cambian.

## Intención
Notificar al cliente final mediante **push** cuando su transcripción termina, para que no tenga
que mantener la app abierta ni revisarla manualmente (coherente con la promesa de
`crm-voice-whisper-async` de poder "cerrar la app" tras subir el archivo).

## Problema
`crm-voice-whisper-async` deja el resultado disponible en estado `DONE`, pero sin un mecanismo
de aviso el cliente final solo se entera si vuelve a abrir la app o la deja abierta esperando
(justo lo que el módulo de subida asíncrona pretende evitar).

## Alcance
- Registro de token de dispositivo por cliente final: `PushDeviceToken` (`id`, `endUserId`
  → `Customer`, `platform` ANDROID|IOS, `token`, `createdAt`).
- Endpoint de alta/baja de token.
- Emisión de push desde el worker de `crm-voice-whisper-async` en el momento en que una
  transcripción pasa a `DONE` (y, opcionalmente, a `ERROR`, para avisar del fallo).
- Un cliente final puede tener varios tokens activos (multi-dispositivo); el push se envía a
  todos los activos.

## Fuera de alcance
- Wispr / dictado en vivo (no forma parte de esta iniciativa).
- Widget de saldo / estados en tiempo real (`crm-voice-realtime-ui`).
- Chat sobre transcript (`crm-voice-chat-transcript`).
- Gestión detallada de credenciales/certificados FCM y APNs (secretos, proyectos de Firebase,
  perfiles de aprovisionamiento) — se asume infraestructura de envío ya configurada a nivel de
  proyecto; este change se centra en el modelo, el endpoint y el punto de disparo.

## Decisiones
- **Multi-dispositivo**: un `endUserId` puede tener N `PushDeviceToken` activos; el envío es a
  todos, no solo al último registrado.
- **Best effort, no bloqueante**: un fallo al enviar el push NO revierte ni bloquea el estado
  `DONE` de la transcripción — el resultado ya está disponible en la app independientemente de
  si la notificación llega.
- **Limpieza de tokens inválidos**: un token que falla de forma indicativa de invalidez (p. ej.
  "not registered"/"unregistered" del proveedor) se marca inválido tras el fallo y no se
  reintenta indefinidamente; no se define aquí un ciclo de reintentos elaborado.
- **Puerto/adaptador**: la emisión real (FCM/APNs) se aísla detrás de una interfaz
  (`PushSenderPort`), igual que el patrón `GeocoderPort` de `crm-comercial-campo`, para poder
  testear con un stub sin credenciales reales.

## Riesgos
- Gestión de credenciales de FCM/APNs (secretos por entorno) es responsabilidad de
  infraestructura del proyecto, no de este documento; si no está configurada, el envío real
  falla mientras el modelo/endpoint siguen siendo válidos (permite desarrollar y testear con un
  stub).
- Tokens caducados no limpiados generan ruido de errores en logs si no se marca invalidez tras
  el primer fallo indicativo.

## Rollback
Módulo aditivo: tabla `PushDeviceToken` nueva + un hook de disparo en el worker existente de
`crm-voice-whisper-async`. Desactivable retirando el hook y la ruta de registro, sin tocar
`Transcription` ni otras tablas.

## Dependencias
- `crm-voice-whisper-async` (bloqueante): el disparo de push ocurre en la transición de
  `Transcription.status` a `DONE` (o `ERROR`) dentro de su worker.

## Criterios de éxito
Ver `validation.md` — AC1…AC5 en verde, back tests verdes, `tsc` limpio.
