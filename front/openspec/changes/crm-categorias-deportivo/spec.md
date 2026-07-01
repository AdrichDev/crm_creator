# Spec — Módulo Categorías / Equipos (centro-deportivo)

## Requisitos

### Requisito: Gestión de equipos (CRUD)

Solo usuarios con rol `ADMIN` o `MANAGER` DEBEN poder crear, editar y eliminar (soft-delete)
equipos. Cualquier usuario autenticado PUEDE listar y consultar equipos.

Un equipo DEBE tener: `nombre`, `deporte` (enum), `temporada`, `color`; y PUEDE tener
`descripcion`. El campo `deporte` DEBE ser uno de:
`futbol_11`, `futbol_7`, `futbol_sala`, `baloncesto`, `natacion`, `halterofilia`, `otro`.

La lista de equipos DEBE estar paginada y mostrar tarjeta con nombre, deporte (badge/emoji),
temporada y número de miembros activos.

#### Escenario C-S1 — Crear equipo exitoso

- DADO un usuario `ADMIN` en `/categorias`
- CUANDO rellena nombre, deporte y temporada y confirma
- ENTONCES el equipo aparece en la lista con el badge de deporte correcto y `0 miembros`

#### Escenario C-S2 — Soft-delete respeta datos

- DADO un equipo con miembros activos
- CUANDO `ADMIN` lo elimina
- ENTONCES el equipo desaparece de la lista; los registros `Customer`/`Employee` vinculados permanecen intactos

---

### Requisito: Membresía N:N (TeamMember)

Un `Customer` (jugador/socio) o `Employee` (staff) PUEDE pertenecer a múltiples equipos
simultáneamente. `TeamMember` DEBE referenciar exactamente uno de `customerId` | `employeeId`
(XOR obligatorio, validado en back).

Cada `TeamMember` DEBE guardar: `posicion` (texto libre en BD), `dorsal` (opcional), `rol`
(`jugador` | `staff`), `fechaAlta`.

#### Escenario C-S3 — Socio en dos equipos

- DADO un `Customer` ya vinculado al equipo "Cadete A"
- CUANDO `ADMIN` lo añade también al equipo "Juvenil B"
- ENTONCES el `Customer` aparece en el grid de miembros de ambos equipos

#### Escenario C-S4 — XOR FK rechaza ambas FK vacías

- DADO una petición `POST /categories/:id/members` sin `customerId` ni `employeeId`
- CUANDO el back valida
- ENTONCES devuelve `400` con mensaje de error

---

### Requisito: Desplegable de posiciones según deporte

El front DEBE derivar las opciones del desplegable `posicion` del campo `team.deporte`.
Deportes con posiciones predefinidas: `futbol_11` (10 opciones), `futbol_7` (5), `futbol_sala`
(5), `baloncesto` (5). Para `natacion`, `halterofilia` y `otro` DEBE mostrarse campo de texto
libre. Cuando el miembro es staff (Employee) el desplegable DEBE ofrecer las opciones de rol
de entrenador/staff independientemente del deporte.

#### Escenario C-S5 — Posiciones fútbol 11

- DADO un equipo con `deporte = futbol_11`
- CUANDO `ADMIN` abre el modal "Añadir jugador"
- ENTONCES el desplegable muestra exactamente: Portero, Defensa central, Lateral derecho,
  Lateral izquierdo, Mediocentro, Mediapunta, Extremo derecho, Extremo izquierdo,
  Delantero centro, Segundo delantero

#### Escenario C-S6 — Deporte sin posiciones predefinidas

- DADO un equipo con `deporte = natacion`
- CUANDO `ADMIN` abre el modal "Añadir jugador"
- ENTONCES el campo `posicion` es un `<input type="text">` libre (sin desplegable)

---

### Requisito: Contactos de emergencia y minoría de edad

`TeamMember` DEBE persistir un campo JSON `contactosEmergencia: [{nombre, telefono, relacion}]`.

Si el miembro vinculado tiene `fechaNacimiento` que indica edad < 18 años:
- El back DEBE rechazar guardar el `TeamMember` sin al menos 1 contacto de emergencia (`422`).
- El front DEBE mostrar un aviso bloqueante antes de enviar.

Si el miembro es mayor de edad, 0–2 contactos son opcionales.

#### Escenario C-S7 — Menor sin contacto → error bloqueante

- DADO un `Customer` con `fechaNacimiento` hace 15 años
- CUANDO `ADMIN` intenta añadirlo a un equipo sin rellenar `contactosEmergencia`
- ENTONCES el front bloquea el envío con aviso visible Y el back devuelve `422` si la petición llega igualmente

#### Escenario C-S8 — Mayor de edad sin contacto → OK

- DADO un `Customer` con `fechaNacimiento` hace 25 años
- CUANDO `ADMIN` lo añade sin contactos de emergencia
- ENTONCES el `TeamMember` se crea correctamente (`201`)

#### Escenario C-S9 — Drawer muestra banner de menor

- DADO un `TeamMember` cuyo `Customer` tiene edad < 18
- CUANDO el usuario abre el drawer "Info"
- ENTONCES el drawer muestra un banner "Menor de edad" y lista los contactos de emergencia;
  si hay 0 contactos muestra advertencia visual

---

### Requisito: Filtros en detalle de equipo

La página `/categorias/[id]` DEBE ofrecer tres filtros: **Todos**, **Jugadores** (solo
`customerId` no nulo), **Entrenadores/Staff** (solo `employeeId` no nulo).

#### Escenario C-S10 — Filtro entrenadores

- DADO un equipo con 3 jugadores y 2 entrenadores
- CUANDO el usuario activa el filtro "Entrenadores"
- ENTONCES el grid muestra únicamente los 2 miembros con `rol = staff`

---

### Requisito: Emojis del vertical centro-deportivo

`BY_VERTICAL['centro-deportivo']` en `icons.ts` DEBE definir un emoji para cada módulo del
vertical. El módulo `categorias` DEBE usar el emoji `🏟️`. Los demás módulos DEBEN tener
emojis temáticos coherentes con el deporte.
