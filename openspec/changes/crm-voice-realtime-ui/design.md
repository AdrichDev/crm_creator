# Diseño técnico — crm-voice-realtime-ui

## 1. Migración mínima (DB)
`back/prisma/migrations/YYYYMMDDHHMMSS_voice_realtime_publication/migration.sql`:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE crm.transcripcion;
-- La tabla de cuenta END_USER (crm-metering-core) se añade por su propia migración;
-- este change no la crea ni la modifica, solo consume sus eventos si ya está publicada.
```
Sin cambios de columnas ni de tipos: solo habilita el feed de cambios.

## 2. Front — suscripción Realtime
```
front/lib/voz/realtime.ts
  subscribeTranscriptionStatus(transcriptionId, onUpdate)  → canal Supabase Realtime filtrado
                                                              por id, fallback a polling si el
                                                              canal se cae
  subscribeAccountBalance(accountRef, onUpdate)            → canal sobre la tabla de cuenta de
                                                              crm-metering-core (contrato externo)
```
- Ambas suscripciones usan la `anon key` de Supabase en el cliente (front), consistente con el
  patrón ya usado en `crm-portal-cliente`/`crm-sidebar-usuario-real` para lecturas en vivo
  scoped por RLS/filtro; el saldo certificado sigue viviendo y calculándose en backend.
- Reconexión: si el canal emite `CLOSED`/`CHANNEL_ERROR`, se dispara un `fetch` puntual de
  refresco (`GET /me/wallet` o equivalente expuesto por `crm-metering-core`) y se reintenta la
  suscripción con backoff simple.

## 3. Componentes
```
front/components/voz/saldo-widget.tsx        → barra superior fija, valor + aviso de saldo bajo
front/components/voz/estado-transcripcion.tsx → 4 pasos (Subiendo/En cola/Transcribiendo/Fin)
```
- `saldo-widget.tsx`: recibe `lowBalanceThreshold` de la cuenta (expuesto por
  `crm-metering-core`, no calculado aquí) y compara contra el saldo recibido.
- `estado-transcripcion.tsx`: mapea `TranscriptionStatus` (definido en `crm-voice-whisper-async`)
  a los 4 pasos visibles; nunca infiere un estado no confirmado por el backend.

## 4. Regla de "front nunca decide negocio"
- Ningún componente de este change llama a `/transcriptions` con lógica de bloqueo basada en el
  saldo visual; el pre-check real vive en `crm-voice-whisper-async` (`402`).
- El "saldo visual" (si se implementa alguna estimación local entre eventos) es puramente
  informativo y se marca visualmente como aproximado hasta la siguiente confirmación real.

## 5. Tests
- Front unit: `saldo-widget.test.tsx` (actualización + aviso bajo saldo), `estado-
  transcripcion.test.tsx` (orden de pasos), `realtime-fallback.test.tsx` (desconexión → fetch de
  refresco), y un test que confirma ausencia de gate de negocio local.
- No hay tests de backend nuevos más allá de verificar que la migración no toca columnas.
