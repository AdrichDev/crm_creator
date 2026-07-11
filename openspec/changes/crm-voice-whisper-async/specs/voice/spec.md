# Spec delta — Capacidad: Voz (módulo)

## ADDED Requirements

### Requirement: Subida resiliente a almacenamiento externo
El sistema DEBE subir archivos de audio/vídeo a almacenamiento externo (Supabase Storage u
equivalente), nunca a disco temporal del servidor de aplicación.

#### Scenario: Subida completa
- **Given** un cliente final con saldo suficiente
- **When** sube un archivo de audio/vídeo
- **Then** el archivo queda en el bucket dedicado y `Transcription.storageKey` lo referencia

### Requirement: Pre-check de saldo antes de encolar
El sistema DEBE estimar el coste máximo por duración y rechazar la subida con `402` si el saldo
de la cuenta END_USER (gestionada por `crm-metering-core`) no lo cubre, antes de crear ninguna
tarea en cola.

#### Scenario: Saldo insuficiente
- **Given** una cuenta END_USER con saldo menor al coste estimado
- **When** se intenta subir un archivo
- **Then** la API responde `402` y no se encola ninguna transcripción

### Requirement: Procesamiento asíncrono en cola real
El sistema DEBE procesar la transcripción en una cola de tareas real (no en el mismo ciclo de
petición HTTP, no mediante `process.nextTick`), permitiendo que el cliente cierre la app tras
subir el archivo.

### Requirement: Estados observables de la transcripción
El sistema DEBE exponer el estado de una transcripción como una máquina de estados observable:
`UPLOADING → QUEUED → TRANSCRIBING → DONE` o `ERROR` en cualquier punto.

#### Scenario: Fallo del worker
- **Given** un job cuya llamada a Whisper falla
- **When** el worker lo procesa
- **Then** `Transcription.status = ERROR` y no se registra ningún débito

### Requirement: Débito atómico por duración real
El sistema DEBE debitar la cuenta END_USER por los segundos reales de audio (medidos con
FFmpeg), no por la estimación previa, mediante una operación atómica idempotente por
transcripción.

#### Scenario: Débito único ante reintento
- **Given** una transcripción que ya alcanzó `DONE`
- **When** el job se reprocesa por un reintento de cola
- **Then** no se invoca un segundo débito ni se sobrescribe el resultado

### Requirement: Scoping por negocio y cliente final
El sistema DEBE restringir el acceso a una transcripción a su `businessId` y `customerId`
propietarios; ninguna otra combinación negocio/cliente puede leerla.
