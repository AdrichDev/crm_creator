# Tareas — crm-voice-realtime-ui

Nivel 2. Front-only + migración mínima de publicación Realtime. Depende de `crm-metering-core`
(cuenta + `lowBalanceThreshold` + publicación Realtime) y `crm-voice-whisper-async` (estados de
`Transcription`). Agentic Runtime gate antes de cualquier push.

## WU1 — Migración: publicación Realtime
- [ ] 1.1 `ALTER PUBLICATION supabase_realtime ADD TABLE crm.transcripcion` (sin tocar columnas).
- [ ] 1.2 Test que verifica que la migración no introduce cambios de esquema.

## WU2 — Front: suscripción y fallback
- [ ] 2.1 `realtime.ts`: suscripción a estado de transcripción + suscripción a saldo de cuenta.
- [ ] 2.2 Fallback a consulta puntual ante desconexión del canal (con backoff simple).
- [ ] 2.3 Test de suscripción (mock canal) + test de fallback (mock desconexión).

## WU3 — Componentes de UI
- [ ] 3.1 `saldo-widget.tsx`: valor en vivo + aviso de saldo bajo (`lowBalanceThreshold`).
- [ ] 3.2 `estado-transcripcion.tsx`: 4 pasos en orden, sin inferir estados no confirmados.
- [ ] 3.3 Test de ambos componentes (actualización, aviso, orden de pasos).

## WU4 — Regla "front nunca decide negocio"
- [ ] 4.1 Verificar/test que ningún componente de este change bloquea una acción de negocio
  basándose solo en el saldo visual estimado localmente.

## Cierre
- [ ] Z.1 front tests verdes, `tsc` limpio.
- [ ] Z.2 Agentic Runtime review antes de push.
- [ ] Z.3 Confirmar nombre real de tabla/columna de saldo expuesta por `crm-metering-core` y
  ajustar `realtime.ts` si difiere de lo asumido.
