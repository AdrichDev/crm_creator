# Diseño técnico — crm-voice-push

## 1. Modelo de datos (Prisma, aditivo)

### 1.1 Enum `PushPlatform`
```prisma
enum PushPlatform { ANDROID IOS }
```

### 1.2 `PushDeviceToken` (`token_dispositivo_push`)
```prisma
model PushDeviceToken {
  id          String   @id @default(cuid())
  businessId  String   @map("negocio_id")
  business    Business @relation(fields: [businessId], references: [id], onDelete: Cascade)
  customerId  String   @map("cliente_id")            // cliente final (Customer existente)
  customer    Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)
  platform    PushPlatform @map("plataforma")
  token       String   @map("token")
  valido      Boolean  @default(true) @map("valido")  // false tras fallo indicativo de invalidez
  createdAt   DateTime @default(now()) @map("creado_en")
  updatedAt   DateTime @updatedAt @map("actualizado_en")
  @@unique([customerId, token])
  @@index([businessId, customerId, valido])
  @@map("token_dispositivo_push")
}
```

## 2. Puerto de envío
```
back/src/lib/voice/push-sender.ts → interface PushSenderPort {
                                       send(token, payload): Promise<'ok'|'invalid_token'|'error'>
                                     }
back/src/lib/voice/fcm-apns-sender.ts → impl. real FCM (Android) / APNs (iOS); requiere
                                          credenciales de proyecto (fuera de alcance de detalle,
                                          asumidas configuradas por infraestructura).
back/src/lib/voice/push-sender.test-stub.ts → stub para tests (sin credenciales reales).
```
- Igual patrón que `GeocoderPort`/`VoiceStoragePort`: interfaz + adaptador intercambiable.

## 3. Rutas (Express)
| Ruta | Métodos | Notas |
|---|---|---|
| `/push-tokens` | POST (registrar), GET (listar propios) | scoped por `customerId` autenticado |
| `/push-tokens/:id` | DELETE | baja explícita del token |

Nuevo archivo: `back/src/routes/push-tokens.ts`, registrado bajo el middleware de auth de
cliente final.

## 4. Punto de integración con el worker de whisper-async
```
back/src/workers/whisper-worker.ts (de crm-voice-whisper-async)
  ...
  Transcription.status = DONE
  → dispatchPush(customerId, { title: 'Transcripción lista', transcriptionId })
```
- `dispatchPush` (definido en este change, `back/src/lib/voice/dispatch-push.ts`):
  1. Lee tokens `valido=true` del `customerId`.
  2. Llama a `PushSenderPort.send` para cada uno (en paralelo, best effort).
  3. Si la respuesta es `invalid_token`, marca `PushDeviceToken.valido = false`.
  4. Cualquier error de envío se loguea; nunca revierte ni afecta `Transcription.status`.
- Este change **añade** `dispatch-push.ts` y documenta el punto exacto de la llamada dentro del
  worker de `crm-voice-whisper-async`; la modificación puntual de ese worker (una línea de
  invocación tras `DONE`) se coordina con ese change al implementarse.

## 5. Migración
`back/prisma/migrations/YYYYMMDDHHMMSS_voice_push/migration.sql`: `CREATE TYPE "PushPlatform"`,
`CREATE TABLE token_dispositivo_push` + índices + FK a `negocio`/`cliente`. Sin DROP.

## 6. Tests
- Back node:test: registro/baja de token, disparo a múltiples tokens (mock `PushSenderPort`),
  fallo de envío no bloquea `DONE`, limpieza de token inválido tras respuesta `invalid_token`.
- No se testea la integración real con FCM/APNs (credenciales de infraestructura); se usa el
  stub del puerto.
