# Diseño técnico — crm-voice-chat-transcript

## 1. Modelo de datos (Prisma, aditivo)

### 1.1 Enum `ChatMessageRole`
```prisma
enum ChatMessageRole { USER ASSISTANT }
```

### 1.2 `TranscriptChatMessage` (`mensaje_chat_transcripcion`)
```prisma
model TranscriptChatMessage {
  id               String   @id @default(cuid())
  businessId       String   @map("negocio_id")
  business         Business @relation(fields: [businessId], references: [id], onDelete: Cascade)
  transcriptionId  String   @map("transcripcion_id")
  transcription    Transcription @relation(fields: [transcriptionId], references: [id], onDelete: Cascade)
  role             ChatMessageRole @map("rol")
  content          String   @map("contenido")
  createdAt        DateTime @default(now()) @map("creado_en")
  @@index([businessId, transcriptionId, createdAt])
  @@map("mensaje_chat_transcripcion")
}
```
Sin `updatedAt` ni borrado: histórico de conversación, igual de espíritu que `CustomerNote`
(inmutable) de `crm-comercial-campo`.

## 2. Reenvío a `crm-ai-proxy` (no se reimplementa el LLM aquí)
```
back/src/routes/transcript-chat.ts
  POST /transcriptions/:id/messages   → valida status=DONE, arma contexto, llama a
                                          POST /ai-proxy/chat (interno), persiste user+assistant
  GET  /transcriptions/:id/messages   → historial cronológico
```
- Guard de estado: si `Transcription.status != DONE` → `409 { code: 'transcript_not_ready' }`.
- Contexto enviado al proxy: `system` = transcript truncado/resumido (ver §3) + últimos N
  turnos del historial + mensaje nuevo del usuario.
- La llamada a `crm-ai-proxy` es la única responsable de invocar al LLM y de reportar el
  consumo de tokens a `crm-metering-core`; este router no llama a ningún proveedor de IA
  directamente ni descuenta saldo por su cuenta.
- Si `crm-ai-proxy` responde error de saldo (402) o cualquier error, no se persiste el turno
  `ASSISTANT`; se propaga el error al front tal cual (sin dejar la conversación en estado
  ambiguo).

## 3. Truncado/resumen del contexto
```
back/src/lib/voice/context-window.ts → buildContext(transcriptText, history, maxChars)
```
- Umbral configurable (constante inicial, ajustable sin migración); por encima del umbral se
  recorta el transcript (o se usa un resumen ya calculado, si `crm-voice-whisper-async` llegara
  a producir uno — no asumido en esta fase, solo recorte simple).

## 4. Front
```
front/app/(crm)/voz/[id]/chat/page.tsx     → vista de chat ligada a una transcripción
front/components/voz/chat-transcript.tsx   → lista de mensajes + input
front/lib/voz/chat-api.ts                  → cliente de /transcriptions/:id/messages
```
- Input deshabilitado + aviso si `Transcription.status != DONE`.
- Error de saldo (402 propagado) se muestra como aviso, no como mensaje del asistente.

## 5. Tests
- Back node:test: guard de estado, reenvío feliz (mock `ai-proxy`), fallo de saldo (mock 402),
  truncado de contexto, orden cronológico del historial.
- Front: unit de la vista (input deshabilitado según estado, render de historial, aviso de
  error).

## 6. Migración
`back/prisma/migrations/YYYYMMDDHHMMSS_voice_chat_transcript/migration.sql`: `CREATE TYPE
"ChatMessageRole"`, `CREATE TABLE mensaje_chat_transcripcion` + índices + FK a `transcripcion`.
Sin DROP.
