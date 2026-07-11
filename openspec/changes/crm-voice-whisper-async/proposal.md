# crm-voice-whisper-async

> ⚠️ **RE-SCOPE PENDIENTE (09/07/2026, decisión B):** la transcripción la paga el **tenant con su
> propia key** (Whisper/OpenAI vía `getTenantSecret`), NO se cobra prepago al usuario final. Este
> documento aún describe el modelo viejo (pre-check de saldo, débito por segundos, `crm-metering-core`,
> cuenta END_USER, 402). **Todo eso se RETIRA** al reescribir: quedan subida resiliente + duración
> FFmpeg + cola async + worker Whisper con key del tenant + persistir texto. `crm-metering-core` y
> `crm-ai-proxy` están MUERTOS. No implementar como está.

## Intención
Añadir al CRM la capacidad de **transcripción asíncrona de audio/vídeo** (módulo voz): el
cliente final de un tenant sube un archivo, el backend valida saldo, lo procesa en segundo
plano con OpenAI Whisper y descuenta el consumo real por segundos. Es la base del módulo voz;
`crm-voice-chat-transcript`, `crm-voice-realtime-ui` y `crm-voice-push` se construyen encima.

## Problema
El CRM no tiene hoy ningún flujo de subida de archivos multimedia grandes ni de procesamiento
en segundo plano. El único precedente (`back/src/routes/upload.ts`) es multer en memoria con
límite de 5 MB pensado para imágenes de servicios/productos — no sirve para audio/vídeo largo.
No existe cola de tareas, ni integración con Whisper, ni medición de consumo por duración.
Sin este módulo no hay forma de cobrar de forma prepago un procesamiento que puede tardar
minutos y cuyo coste depende de la duración real del archivo.

## Alcance
- **Subida resiliente** a almacenamiento externo (Supabase Storage, bucket dedicado — NO el
  bucket `crm-media` de imágenes, NO disco temporal del servidor). Soporta reanudación
  (multipart/tus) para archivos grandes.
- **Extracción de duración** con FFmpeg una vez la subida está completa en el storage (no se
  confía en metadatos enviados por el cliente).
- **Pre-check de saldo**: con la duración conocida, se estima el coste máximo y se consulta el
  saldo de la cuenta END_USER (vía `crm-metering-core`); si no cubre el estimado, se rechaza con
  `402` antes de encolar nada.
- **Cola de tareas asíncrona** (BullMQ + Redis) — explícitamente NO `process.nextTick` (el plan
  fuente lo señala como no apto para producción, §16.1).
- **Worker** que llama a la API de OpenAI Whisper con la master key en servidor (nunca expuesta
  al cliente).
- Al finalizar con éxito: **débito atómico por segundos reales** contra la cuenta END_USER vía
  la RPC de `crm-metering-core` (`UsageEvent` `kind=WHISPER_SECONDS`), y persistencia del texto.
- Modelo `Transcription` con estados observables: `UPLOADING → QUEUED → TRANSCRIBING →
  DONE | ERROR`.

## Fuera de alcance (otros changes o fuera de esta iniciativa)
- Stripe / recargas de saldo (responsabilidad de `crm-metering-core`).
- Wispr Flow / dictado en vivo por streaming (no se especifica en esta iniciativa).
- Servicios nativos de background (Android `Foreground Service`, iOS `Background Audio Mode`).
- Chat sobre el transcript (`crm-voice-chat-transcript`).
- Widget de saldo / estados en tiempo real en UI (`crm-voice-realtime-ui`).
- Notificación push al finalizar (`crm-voice-push`).

## Decisiones
- **Almacenamiento externo obligatorio** (Supabase Storage u otro objeto compatible): el archivo
  nunca depende únicamente del disco temporal del proceso Express (§16.2 del plan fuente).
- **Cola real, no `process.nextTick`**: el ejemplo del plan fuente usa `process.nextTick` como
  cola improvisada; aquí se especifica BullMQ/Redis (o equivalente) desde el inicio.
- **Débito atómico vía RPC de `crm-metering-core`, no SELECT+UPDATE en dos pasos**: el ejemplo
  del plan fuente lee `saldo_usd`, calcula en memoria y hace `update` aparte — eso es una
  condición de carrera bajo concurrencia (dos transcripciones del mismo cliente en paralelo).
  Este change **consume** la RPC atómica de `crm-metering-core`; no la reimplementa ni la
  redefine.
- **Dinero en `Decimal(12,6)`** en cualquier campo monetario que este módulo persista o reciba
  (alineado con la convención pedida, más fino que el `DECIMAL(10,4)` del plan fuente).
- **Pre-check con estimación de máximo, débito con duración exacta**: el rechazo por saldo
  insuficiente ocurre con el estimado (duración × tarifa); el cobro real ocurre al terminar,
  con la duración exacta medida por FFmpeg.
- **Idempotencia del job**: un mismo `transcriptionId` no puede debitarse dos veces aunque el
  worker reintente (reintento de cola, caída a mitad de proceso, etc.).

## Riesgos
- Archivo corrupto o formato no soportado → FFmpeg debe fallar de forma controlada
  (`Transcription.status = ERROR`, sin encolar llamada a Whisper, sin débito).
- Job de cola no idempotente podría reprocesar y debitar dos veces si el worker cae entre la
  llamada a Whisper y el registro del débito → debe protegerse con guard de estado (ver
  `design.md`).
- Whisper no admite reembolso parcial: si el débito falla después de una llamada exitosa a la
  API, el proveedor absorbe ese coste puntual (aceptado como riesgo residual, no se especifica
  compensación automática en esta fase).
- Archivos muy largos pueden agotar el tiempo de ejecución del worker; no se fija un límite duro
  de duración en esta fase (se documenta como conocido, no bloqueante).

## Rollback
Módulo aditivo: tabla `Transcription` nueva, bucket de storage nuevo, cola nueva. Desactivable
retirando la ruta de subida y deteniendo el worker, sin tocar datos ni tablas existentes.

## Dependencias
- **`crm-metering-core`** (bloqueante): cuenta END_USER, tarifas, pre-check de saldo y RPC de
  débito atómico. Este change referencia su contrato (cuenta, `UsageEvent`, RPC); no lo define
  ni lo redefine. Debe existir (o desarrollarse en paralelo con contrato acordado) antes de que
  este change pueda considerarse completo.
- Prisma 7 + Supabase schema `crm`, convención `@map` castellano en columnas físicas.
- `Customer` existente (con `userId` opcional hacia `auth.users`): el cliente final autenticado
  de un tenant es quien sube archivos y consume saldo.

## Criterios de éxito
Ver `validation.md` — AC1…AC7 en verde, back tests verdes, `tsc` limpio, sin fuga cross-tenant.
