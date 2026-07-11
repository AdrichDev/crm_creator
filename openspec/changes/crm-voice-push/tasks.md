# Tareas — crm-voice-push

Nivel 2. Depende de `crm-voice-whisper-async` (worker + transición a `DONE`). Agentic Runtime
gate antes de cualquier push (del código, no confundir con el push de notificaciones).

## WU1 — Modelo de datos + migración
- [ ] 1.1 Enum `PushPlatform` + modelo `PushDeviceToken`.
- [ ] 1.2 Migración aditiva (sin DROP).
- [ ] 1.3 Test schema/migration status.

## WU2 — Rutas de registro/baja
- [ ] 2.1 `POST /push-tokens` (alta, scoped por cliente final autenticado).
- [ ] 2.2 `DELETE /push-tokens/:id` (baja).
- [ ] 2.3 Test alta/baja.

## WU3 — Puerto de envío + disparo
- [ ] 3.1 `PushSenderPort` + stub de test (sin credenciales reales).
- [ ] 3.2 `dispatch-push.ts`: envío a todos los tokens `valido=true` del cliente final, best
  effort.
- [ ] 3.3 Limpieza de token inválido tras respuesta `invalid_token`.
- [ ] 3.4 Punto de integración documentado en el worker de `crm-voice-whisper-async` (llamada
  tras `Transcription.status = DONE`).
- [ ] 3.5 Test disparo multi-token, fallo no bloqueante, limpieza de token inválido.

## Cierre
- [ ] Z.1 back tests verdes, `tsc` limpio.
- [ ] Z.2 Agentic Runtime review antes de push.
- [ ] Z.3 Coordinar con `crm-voice-whisper-async` el cableado real de la llamada
  `dispatchPush` dentro de su worker (una línea tras `DONE`).
- [ ] Z.4 Configuración real de credenciales FCM/APNs — fuera de alcance de este documento,
  gestionar como tarea de infraestructura aparte.
