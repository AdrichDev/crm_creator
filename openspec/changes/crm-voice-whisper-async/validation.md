# Validación — crm-voice-whisper-async

Historia: como **cliente final** de un tenant quiero subir un archivo de audio o vídeo y que se
transcriba en segundo plano sin arriesgar un gasto que no puedo cubrir, para poder cerrar la app
y recibir el resultado más tarde.

## Criterios de aceptación (AC)
- **AC1 (pre-check saldo):** con saldo estimado insuficiente para la duración del archivo, la
  API responde `402` antes de crear ninguna tarea en cola.
- **AC2 (subida resiliente):** con saldo suficiente, el archivo se sube a almacenamiento externo
  (Supabase Storage) y no se escribe en disco temporal del servidor; la API responde `202` con
  el `id` de la transcripción.
- **AC3 (estados observables):** el estado de una transcripción progresa exactamente
  `UPLOADING → QUEUED → TRANSCRIBING → DONE` (o `ERROR` en cualquier punto), consultable por
  `GET /transcriptions/:id`.
- **AC4 (débito atómico real):** al terminar con éxito, se debita por los segundos reales
  (medidos por FFmpeg, no la estimación) vía la RPC atómica de `crm-metering-core`, se persiste
  el texto, y reintentar el mismo job no genera un segundo débito.
- **AC5 (fallo sin cobro):** si el worker falla (Whisper error, archivo corrupto), el estado pasa
  a `ERROR` y no hay ningún débito asociado.
- **AC6 (duración real, no confiar en cliente):** la duración usada tanto para el pre-check como
  para el débito final se obtiene con FFmpeg sobre el archivo ya subido, nunca de metadatos
  enviados por el cliente.
- **AC7 (scoping):** cada transcripción queda asociada a `businessId` + cliente final; un
  cliente de un tenant no puede leer ni listar transcripciones de otro negocio o de otro cliente.

## Por tarea (Given-When-Then + test)
- **WU1.1** Modelo `Transcription` + enum `TranscriptionStatus` → Given migración aplicada, When
  `prisma migrate status`, Then sin drift y columnas nuevas coherentes con el diseño. Test:
  `back` migration/schema test.
- **WU2.1** Subida a storage externo → Given archivo válido, When se sube (mock del cliente de
  Storage), Then queda en el bucket dedicado con `storageKey` persistida y sin escritura en
  disco temporal. Test: `voice-upload.test.ts` (mock storage).
- **WU2.2** Duración con FFmpeg → Given archivo subido (fixture corta o mock del binding
  FFmpeg), When se extrae duración, Then se obtiene `durationSeconds` entero > 0; archivo
  corrupto → error controlado. Test: `ffmpeg-duration.test.ts`.
- **WU3.1** Pre-check de saldo insuficiente → Given cuenta con saldo menor al estimado (mock
  RPC de `crm-metering-core`), When se intenta encolar, Then `402` y no se crea `Transcription`
  en estado `QUEUED`. Test: `precheck-balance.test.ts`.
- **WU3.2** Pre-check de saldo suficiente → Given cuenta con saldo suficiente, When se sube el
  archivo, Then se acepta (`202`), `Transcription.status = UPLOADING` y luego `QUEUED`. Test:
  `precheck-balance.test.ts` (caso positivo).
- **WU4.1** Worker Whisper feliz → Given job en cola con archivo válido (mock cliente OpenAI),
  When el worker procesa, Then `status = DONE`, `text` persistido, y se llama exactamente una
  vez a la RPC de débito con la duración real. Test: `whisper-worker.test.ts`.
- **WU4.2** Worker Whisper con fallo → Given job cuya llamada a Whisper falla (mock error), When
  el worker procesa, Then `status = ERROR` y la RPC de débito NO se invoca. Test:
  `whisper-worker.test.ts` (caso error).
- **WU4.3** Idempotencia del job → Given un job que se reintenta después de haber llegado a
  `DONE` (simulando reintento de cola), When se vuelve a ejecutar, Then no se invoca de nuevo la
  RPC de débito (guard por estado). Test: `whisper-worker.idempotent.test.ts`.
- **WU5.1** Consulta de estado scoped → Given transcripción de negocio A, When negocio B la
  consulta por `id`, Then `404` (sin fuga cross-tenant). Test: `transcriptions.scope.test.ts`.

> Regla del repo: una tarea está DONE solo cuando su test está verde. Sin spec → no code.

## Estado
PROPUESTA — sin iniciar. Requiere que `crm-metering-core` exponga (o se acuerde en paralelo) la
RPC de débito atómico y la consulta de saldo por cuenta END_USER antes de implementar WU3/WU4.
