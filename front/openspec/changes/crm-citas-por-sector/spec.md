# Spec — Citas por sector

## Requisitos

### Requisito: Resolución de formulario/columnas por vertical

El front DEBE resolver la forma del módulo Citas desde
`CITAS_SECTOR_FIELDS[vertical]`. Si el vertical activo no tiene entrada en el
catálogo, DEBE usar el formulario y columnas genéricos actuales (sin ningún
cambio de comportamiento).

#### Escenario C-S1 — Vertical sin entrada en el catálogo

- DADO un negocio vertical `peluqueria`
- CUANDO el admin abre "Nueva cita"
- ENTONCES ve el formulario genérico actual (cliente, servicio, profesional, fecha, hora, estado), sin cambios

#### Escenario C-S2 — Vertical representativo

- DADO un negocio vertical `centro-deportivo`
- CUANDO el admin abre "Nueva cita"
- ENTONCES ve el modal "Nuevo entrenamiento" (no el genérico), y la tabla de Citas muestra las columnas Equipo/Campo/Día/Hora/Entrenador/Estado

---

### Requisito: Entrenamiento (centro-deportivo) sin campo "Cliente"

El modal "Nuevo entrenamiento" DEBE pedir: equipo (`Team` del negocio),
campo/instalación (`Resource` con `tipo = COURT`), entrenador (`Employee`),
día de la semana, hora de inicio y fin. NO DEBE mostrar un selector de
cliente individual — el "asistente" es el equipo completo.

#### Escenario C-S3 — Crear entrenamiento

- DADO un club con equipo "Alevín B" y campo "Pista 2" (`Resource` tipo `COURT`)
- CUANDO el admin crea un entrenamiento con equipo=Alevín B, campo=Pista 2, día=Martes, hora=18:00–19:30
- ENTONCES se crea un `Booking` con `teamId` apuntando a Alevín B, `customerId = null`, vinculado a Pista 2, con `startAt`/`endAt` calculados para el próximo martes en esas horas

#### Escenario C-S4 — XOR equipo/cliente

- DADO una petición al router de bookings con `teamId` Y `customerId` a la vez
- CUANDO el back valida
- ENTONCES devuelve `400` `XOR_REQUIRED` (mismo contrato que ya usa `categories.ts` para `TeamMember`)

#### Escenario C-S5 — Ni equipo ni cliente

- DADO una petición sin `teamId` ni `customerId`
- CUANDO el back valida
- ENTONCES devuelve `400` `XOR_REQUIRED`

---

### Requisito: Clase (fitness) con instructor, sala y aforo informativo

El modal "Nueva clase" DEBE pedir: clase (`Service` existente), instructor
(`Employee`), sala (`Resource` con `tipo` en `ROOM`/`SPACE`), día de la
semana, hora. El cliente es OPCIONAL (una clase es grupal; se puede crear sin
lista de asistentes en esta fase). El aforo (`Resource.capacidad`) se
muestra de forma informativa junto al selector de sala, sin bloquear el
envío si ya hay más bookings que capacidad (ver Open Question en design.md).

#### Escenario C-S6 — Crear clase sin cliente

- DADO un gimnasio con la clase "Spinning" y la sala "Sala 1" (capacidad 20)
- CUANDO el admin crea una clase sin seleccionar cliente
- ENTONCES el `Booking` se crea con `customerId = null` y `teamId = null`, vinculado a Spinning y Sala 1

---

### Requisito: Reunión (comerciales) con cuenta, comercial y canal

El modal de comerciales DEBE seguir pidiendo cliente (relabelado "Cuenta") y
empleado (relabelado "Comercial") como hoy, y AÑADIR un campo `canal`
(presencial | videollamada). Es el cambio MÁS PEQUEÑO de los 3
representativos — reutiliza el modal base con un campo extra condicional.

#### Escenario C-S7 — Reunión con canal

- DADO un negocio vertical `comerciales`
- CUANDO el admin crea una reunión con canal="Videollamada"
- ENTONCES la ficha de la reunión muestra el canal, y la columna "Canal" aparece en la tabla

---

### Requisito: Sin regresión en verticales no representativos

Los 8 verticales sin entrada en `CITAS_SECTOR_FIELDS` (peluquería, estética,
hostelería, clínica, escalada, veterinario, abogados, taller, custom) DEBEN
comportarse EXACTAMENTE igual que antes de este change.

#### Escenario C-S8 — Regresión negativa

- DADO cualquiera de los 8 verticales no representativos
- CUANDO se ejecuta la suite de tests existente del módulo Citas
- ENTONCES todos los tests previos siguen en verde sin modificarlos
