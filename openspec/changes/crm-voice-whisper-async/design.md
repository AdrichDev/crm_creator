# Diseño técnico — crm-voice-whisper-async

## 1. Modelo de datos (Prisma, aditivo)

Convención del repo: modelo en inglés, columnas físicas castellano snake_case vía `@map`,
multi-tenant `businessId @map("negocio_id")`, dinero en `Decimal(12,6)`.

### 1.1 Enum `TranscriptionStatus`
```prisma
enum TranscriptionStatus { UPLOADING QUEUED TRANSCRIBING DONE ERROR }
```

### 1.2 `Transcription` (`transcripcion`)
```prisma
model Transcription {
  id              String   @id @default(cuid())
  businessId      String   @map("negocio_id")
  business        Business @relation(fields: [businessId], references: [id], onDelete: Cascade)
  customerId      String   @map("cliente_id")               // cliente final (Customer existente)
  customer        Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)
  // accountId referencia la cuenta END_USER de crm-metering-core (no se redefine aquí; se
  // resuelve por businessId+customerId contra su tabla de cuentas al hacer el pre-check/débito).
  storageKey      String   @map("storage_key")               // ruta en bucket dedicado
  mimeType        String   @map("mime_type")
  durationSeconds Int?     @map("duracion_segundos")         // null hasta que FFmpeg la calcula
  estimatedCostUsd Decimal? @db.Decimal(12, 6) @map("coste_estimado_usd")
  billedCostUsd   Decimal? @db.Decimal(12, 6) @map("coste_facturado_usd")
  status          TranscriptionStatus @default(UPLOADING) @map("estado")
  text            String?  @map("texto")
  errorMessage    String?  @map("mensaje_error")
  createdAt       DateTime @default(now()) @map("creado_en")
  updatedAt       DateTime @updatedAt @map("actualizado_en")
  @@index([businessId, customerId])
  @@index([businessId, status])
  @@map("transcripcion")
}
```
> `Customer` ya soporta `userId` opcional hacia `auth.users` para el cliente final autenticado
> (patrón `crm-autoregistro-cliente`). La cuenta END_USER de `crm-metering-core` se asume
> resoluble por `(businessId, customerId)`; este change no crea ni modifica esa tabla.

## 2. Almacenamiento — puerto/adaptador
```
back/src/lib/voice/storage.ts   → interface VoiceStoragePort {
                                     createUploadSession(...): { uploadUrl, storageKey }
                                     getFile(storageKey): stream
                                   }
back/src/lib/voice/supabase-storage.ts → impl. bucket dedicado `crm-voice` (NO `crm-media`),
                                          subida resumable (tus vía Storage API o multipart
                                          propio); privado (no público como `crm-media`).
```
- El archivo se sube directamente al bucket (URL firmada o proxy resumable), nunca pasa por
  disco temporal del proceso Express.
- Patrón de puerto igual al `GeocoderPort` de `crm-comercial-campo`: interfaz + adaptador
  intercambiable.

## 3. Duración — FFmpeg
```
back/src/lib/voice/ffmpeg.ts → getDurationSeconds(storageKey|stream): Promise<number>
```
- Se ejecuta tras confirmar que la subida está completa en storage (no sobre el stream a medio
  subir).
- Archivo inválido/corrupto → excepción controlada → `Transcription.status = ERROR`,
  `errorMessage` descriptivo, sin encolar.

## 4. Pre-check de saldo (consume `crm-metering-core`, no lo redefine)
```
back/src/lib/voice/pricing.ts → estimateCostUsd(durationSeconds, tariff): Decimal
back/src/lib/voice/metering-client.ts → checkBalance(businessId, customerId, estimatedCostUsd)
                                          → boolean (true = cubre el máximo estimado)
```
- Rechazo: `estimatedCostUsd > saldo disponible` → `402` con código `INSUFFICIENT_BALANCE`,
  archivo eliminado del bucket temporal si aplica, `Transcription` no llega a `QUEUED`.
- La tarifa (USD/segundo) la resuelve `crm-metering-core`; este módulo no la fija.

## 5. Cola de tareas (BullMQ + Redis, NO `process.nextTick`)
```
back/src/lib/voice/queue.ts     → Queue 'whisper-transcription' (BullMQ)
back/src/workers/whisper-worker.ts → Worker que consume la cola
```
- Job payload: `{ transcriptionId }` (mínimo, sin datos sensibles; el worker relee de DB).
- El worker es un proceso/entrypoint separado del servidor Express (arrancable independiente),
  igual que se recomienda para cualquier cola real en producción.

## 6. Flujo (worker)
```
[Job: transcriptionId]
   │
   ▼
Transcription.status = TRANSCRIBING
   │
   ▼
Descargar de storage (storageKey) → OpenAI Whisper API (master key server-side)
   │
   ├── Error Whisper → status=ERROR, errorMessage, FIN (sin débito)
   │
   ▼
Éxito: texto recibido
   │
   ▼
Transacción atómica:
   ├── 1. RPC crm-metering-core: débito por durationSeconds real (idempotente por transcriptionId)
   ├── 2. Transcription.text = texto, billedCostUsd = resultado RPC, status = DONE
   └── si la RPC falla → status=ERROR (no se persiste texto como DONE sin cobro registrado)
```
- **Idempotencia:** antes de invocar la RPC de débito, el worker comprueba
  `status IN (TRANSCRIBING)`; si ya está `DONE` o `ERROR` (reintento tardío de un job ya
  procesado), no vuelve a debitar ni a sobrescribir el resultado.

## 7. Back — rutas (Express)
| Ruta | Métodos | Notas |
|---|---|---|
| `/transcriptions` | POST (iniciar subida), GET (listar por cliente final) | POST hace pre-check de saldo antes de aceptar |
| `/transcriptions/:id` | GET | estado + texto (si `DONE`); scoped por `businessId`+`customerId` |
| `/transcriptions/:id/upload-complete` | POST | marca fin de subida resumible, dispara FFmpeg + encolado |

Registrado en `back/src/routes/index.ts` bajo el middleware de auth de cliente final existente
(mismo patrón que `me.ts`/`customers.ts` para scoping). Nuevo archivo:
`back/src/routes/transcriptions.ts`.

## 8. Migración
`back/prisma/migrations/YYYYMMDDHHMMSS_voice_whisper_async/migration.sql`: `CREATE TYPE
"TranscriptionStatus"`, `CREATE TABLE transcripcion` + índices + FKs a `negocio`/`cliente`. Sin
DROP. Aplica el usuario (gotcha EPERM `prisma generate` en Windows → `--no-engine` si falla).

## 9. Tests
- Back node:test: pre-check saldo (mock RPC metering-core), FFmpeg duración (mock/fixture),
  worker feliz/error (mock cliente OpenAI), idempotencia del job, scoping cross-tenant.
- No se testea la implementación real de la RPC de débito (pertenece a `crm-metering-core`);
  se mockea su contrato.
