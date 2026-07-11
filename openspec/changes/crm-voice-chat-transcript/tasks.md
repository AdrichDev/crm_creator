# Tareas — crm-voice-chat-transcript

Nivel 2. Depende de `crm-ai-proxy` (contrato de `/ai-proxy/chat`) y `crm-voice-whisper-async`
(transcripciones `DONE`). Agentic Runtime gate antes de cualquier push.

## WU1 — Modelo de datos + migración
- [ ] 1.1 Enum `ChatMessageRole` + modelo `TranscriptChatMessage`.
- [ ] 1.2 Migración aditiva (sin DROP).
- [ ] 1.3 Test schema/migration status.

## WU2 — Back: reenvío a ai-proxy + guard de estado
- [ ] 2.1 `POST /transcriptions/:id/messages`: guard `status=DONE`, arma contexto, llama a
  `POST /ai-proxy/chat`, persiste turno user+assistant.
- [ ] 2.2 `GET /transcriptions/:id/messages`: historial cronológico.
- [ ] 2.3 Manejo explícito de error de saldo (402 de `ai-proxy`): no persiste turno assistant.
- [ ] 2.4 Truncado/resumen del contexto (`context-window.ts`) por umbral configurable.
- [ ] 2.5 Tests: guard estado, reenvío feliz (mock), fallo saldo (mock), truncado, historial.

## WU3 — Front: vista de chat
- [ ] 3.1 `chat-transcript.tsx`: historial + input; input deshabilitado si no `DONE`.
- [ ] 3.2 Manejo de error de saldo como aviso (no como mensaje del asistente).
- [ ] 3.3 Test front unit.

## Cierre
- [ ] Z.1 back+front tests verdes, `tsc` limpio.
- [ ] Z.2 Agentic Runtime review antes de push.
- [ ] Z.3 Confirmar contrato final de `crm-ai-proxy` (forma exacta de request/response) y
  actualizar `design.md` si difiere de lo asumido.
