# crm-voice-chat-transcript

> ⚠️ **RE-SCOPE PENDIENTE (09/07/2026, decisión B):** el chat sobre el transcript usa la **key de IA
> del tenant** (OpenAI/Gemini/Anthropic vía `getTenantSecret`), NO `crm-ai-proxy` (BORRADO) ni cobro
> por tokens (`crm-metering-core` MUERTO). Al reescribir se retira toda referencia a proxy/metering/
> saldo; queda un endpoint fino que llama al proveedor con la key del tenant. No implementar como está.

## Intención
Permitir que el cliente final **chatee sobre un transcript ya generado** (resumen, ideas clave,
preguntas, extracción de tareas) como si hablara con un asistente, reutilizando el proxy de IA
del CRM en lugar de reimplementar una integración de LLM propia para el módulo voz.

## Problema
`crm-voice-whisper-async` deja un texto plano guardado en `Transcription.text`, pero el cliente
final no tiene forma de explotarlo más allá de leerlo entero. No tiene sentido montar una
integración de LLM y una medición de tokens paralela a la que ya gestiona `crm-ai-proxy`
(y en última instancia `crm-metering-core`) para el resto del CRM.

## Alcance
- Endpoint que envía el transcript (o un contexto derivado de él) + historial reciente al proxy
  de IA existente (`POST /ai-proxy/chat`), devolviendo la respuesta del asistente.
- Persistencia opcional de historial de conversación por transcripción
  (`TranscriptChatMessage`: `role` user/assistant, `content`, `createdAt`) para continuidad.
- Front: vista de chat simple ligada a una transcripción en estado `DONE`.
- El cobro por tokens ocurre en la **misma cuenta END_USER** que pagó la transcripción, a través
  del mecanismo que ya use `crm-ai-proxy` — este change no define un cobro nuevo ni paralelo.

## Fuera de alcance
- Generación del transcript en sí (`crm-voice-whisper-async`).
- Widget de saldo / estados en tiempo real (`crm-voice-realtime-ui`).
- Notificaciones push (`crm-voice-push`).
- Edición del transcript original (el chat no modifica `Transcription.text`).
- Reimplementación de la llamada al LLM o de la medición de tokens (vive en `crm-ai-proxy`).

## Decisiones
- **Reutilizar `crm-ai-proxy` sin reimplementarlo**: este change es un consumidor de
  `POST /ai-proxy/chat`; no reimplementa llamada a proveedor LLM ni medición de tokens.
- **Solo transcripciones `DONE`**: no se puede abrir un chat sobre una transcripción en
  `UPLOADING/QUEUED/TRANSCRIBING/ERROR` — no hay texto que ofrecer como contexto.
- **Contexto acotado**: el transcript completo no se reenvía sin límite en cada turno (crece el
  coste de tokens con transcripts largos); se trunca/resumen antes de usarse como contexto del
  sistema (detalle de umbral en `design.md`).
- **Historial persistido, no solo en memoria de front**: permite continuar la conversación tras
  cerrar la app, igual que el resto de vistas del CRM.

## Riesgos
- Coste de tokens crece con transcripts largos si no se trunca correctamente el contexto.
- Acoplamiento al contrato de `crm-ai-proxy`: si su forma de request/response cambia, este change
  debe actualizarse (dependencia declarada, no redefinida aquí).
- Sin saldo (denegado por `crm-ai-proxy`/`crm-metering-core`), el mensaje no debe quedar en un
  estado ambiguo (enviado pero sin respuesta) — debe fallar de forma explícita y visible.

## Rollback
Módulo aditivo: tabla `TranscriptChatMessage` nueva y una ruta nueva; desactivable sin tocar
`Transcription` ni ninguna otra tabla existente.

## Dependencias
- `crm-ai-proxy` (bloqueante): proxy de IA existente/planeado del CRM (`POST /ai-proxy/chat`) que
  gestiona la llamada al LLM y el cobro por tokens contra `crm-metering-core`. Este change
  referencia su contrato; no lo define.
- `crm-voice-whisper-async` (bloqueante): transcripciones existentes en estado `DONE`.

## Criterios de éxito
Ver `validation.md` — AC1…AC5 en verde, back+front tests verdes, `tsc` limpio.
