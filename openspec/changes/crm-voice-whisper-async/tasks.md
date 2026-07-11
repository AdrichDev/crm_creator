# Tareas — crm-voice-whisper-async

Nivel 3. Orden por dependencia (modelo → storage/ffmpeg → pre-check → cola/worker → rutas).
Bloqueante: `crm-metering-core` debe exponer contrato de saldo/débito (aunque sea mockeado en
tests) antes de cerrar WU3/WU4. Agentic Runtime gate antes de cualquier push.

## WU1 — Modelo de datos + migración (back/DB)
- [ ] 1.1 Enum `TranscriptionStatus` + modelo `Transcription`.
- [ ] 1.2 Migración aditiva `..._voice_whisper_async/migration.sql` (sin DROP).
- [ ] 1.3 Test schema/migration status.

## WU2 — Storage externo + duración
- [ ] 2.1 `VoiceStoragePort` + adaptador Supabase Storage (bucket `crm-voice`, privado, resumable).
- [ ] 2.2 `ffmpeg.ts` — extracción de duración desde archivo ya subido.
- [ ] 2.3 Test subida (mock storage) + test duración (mock/fixture FFmpeg) + caso corrupto.

## WU3 — Pre-check de saldo (consume crm-metering-core)
- [ ] 3.1 `pricing.ts` — estimación de coste por duración.
- [ ] 3.2 `metering-client.ts` — consulta de saldo (contrato de `crm-metering-core`, mockeado si
  aún no existe implementación real).
- [ ] 3.3 `POST /transcriptions`: rechazo 402 sin saldo, aceptación 202 con saldo.
- [ ] 3.4 Test pre-check positivo/negativo.

## WU4 — Cola + worker + débito atómico
- [ ] 4.1 `queue.ts` (BullMQ) — definición de la cola `whisper-transcription`.
- [ ] 4.2 `whisper-worker.ts` — consumo de job, llamada a OpenAI Whisper, transición de estados.
- [ ] 4.3 Débito atómico vía RPC de `crm-metering-core` al pasar a `DONE`; guard de idempotencia.
- [ ] 4.4 Test worker feliz, worker con error (sin débito), idempotencia ante reintento.

## WU5 — Rutas de consulta + scoping
- [ ] 5.1 `GET /transcriptions/:id` y `GET /transcriptions` (listado por cliente final).
- [ ] 5.2 `POST /transcriptions/:id/upload-complete` (dispara FFmpeg + pre-check + encolado).
- [ ] 5.3 Test scoping cross-tenant (negocio A no ve transcripción de negocio B).

## Cierre
- [ ] Z.1 back tests verdes, `tsc` limpio.
- [ ] Z.2 Agentic Runtime review antes de push.
- [ ] Z.3 Confirmar contrato final acordado con `crm-metering-core` (nombre de RPC, forma de
  `UsageEvent`, resolución de cuenta por `businessId`+`customerId`) y actualizar `design.md` si
  cambia.
