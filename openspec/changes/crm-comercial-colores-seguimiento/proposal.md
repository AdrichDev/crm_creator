# crm-comercial-colores-seguimiento

## Intención
Sobre el módulo `comercial` ya entregado (`crm-comercial-campo`, WU1-9), añadir lo que el cliente
pide para su día a día: (1) ver en el mapa **quién gasta mucho, quién poco y quién merece
seguimiento** mediante color, (2) un **panel de seguimiento** que concentre compromisos abiertos
y (3) **notificaciones internas** de recordatorios vencidos/del día.

## Problema
Hoy el mapa colorea solo por estado de visita; la categoría ABC (proxy de gasto) es un badge que
solo se ve abriendo la ficha. No existe una vista que concentre "qué tengo abierto con quién"
(seguimientos, próximas acciones, recordatorios vencidos), ni ningún aviso: si el comercial no
abre la ficha, el compromiso se pierde.

## Alcance
- **A. Modo de color del mapa (front):** selector exclusivo "Colorear por: **Estado de visita** |
  **Categoría (gasto)**". En modo gasto: A=alto (dorado/verde), B=medio (azul), C=bajo (gris);
  la leyenda cambia con el modo y la dimensión no coloreada se conserva como badge en popup/ficha.
  Preferencia de modo persistida (localStorage/tenant-config UI state).
- **B. Panel "Seguimiento" (front, pestaña dentro de `/comercial`):** lista unificada ordenada por
  urgencia: recordatorios vencidos → hoy → próximos → clientes en estados `esPendiente` con
  `proximaAccionEn`. Acciones inline: completar recordatorio, abrir ficha, "Ir".
- **C. Contadores back:** endpoint ligero `/reminders/summary` (vencidos, hoy, próximos 7 días)
  por usuario/negocio.
- **D. Notificaciones internas (front):** campana en el header/sidebar con badge = vencidos+hoy,
  dropdown con los ítems y deep-link a la ficha. Polling suave (revalidación al enfocar/al abrir).
  **Sin push ni email en este change** — canal externo queda para fase posterior sobre la cola
  n8n existente.

## Fuera de alcance
Push/email/notificaciones nativas, geofencing (RF-22), transcripción audio, cambios en el modelo
ABC (los 3 niveles bastan; "gasto" real desde ventas/facturas = fase posterior con datos),
Google Calendar (→ `crm-citas-google-calendar`).

## Decisiones
- **Toggle exclusivo, nunca mezcla (§16.3 del doc de criterios):** un solo significado del color
  por vista + leyenda visible siempre (regla de negocio 9). Evita el "todo con colores" que el
  propio doc marca como riesgo.
- **ABC = proxy de gasto:** no se inventa un cálculo automático de gasto; A/B/C ya modela
  prioridad comercial (definición §9.3). La automatización por facturación real es fase 3 (RF-25
  territory) y requiere datos de ventas del cliente.
- **Notificaciones in-app primero:** cero dependencias nuevas, cero permisos móviles; el canal
  externo (n8n → email/WhatsApp) se decide con el cliente después ("ya veríamos cómo").
- **Sin modelo nuevo:** todo sale de `Reminder`, `Visit.proximaAccionEn` y `VisitState.esPendiente`
  ya existentes. C es solo un agregado.

## Riesgos
- Doble semántica de color puede confundir si la leyenda no es obvia → leyenda pegada al selector
  y título del modo activo.
- Polling de contadores en móvil → endpoint summary barato (count agregado, sin listas).

## Rollback
Front reversible (ocultar selector/pestaña/campana). Endpoint summary aditivo, sin migración.

## Dependencias
`crm-comercial-campo` hecho y su migración aplicada en Supabase (prerequisito duro: sin las
tablas `Reminder`/`VisitState` en la DB real no hay e2e).

## Criterios de éxito
Comercial distingue en el mapa gasto alto/bajo con un toggle, ve todos sus compromisos abiertos
en una sola vista y la campana avisa de vencidos. back+front tests + tsc verdes, sin regresión
del mapa actual.
