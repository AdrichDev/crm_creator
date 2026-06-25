# SDD v1 — Business OS para Negocios Locales

> Especificación dirigida (Spec Driven Development). Documento revisable y
> criticable **antes** de implementar. No incluye código de producción, solo
> pseudocódigo o ejemplos mínimos para aclarar el modelo.
>
> Elaborado como equipo senior: Product Manager SaaS B2B · Principal Architect ·
> Senior Full-Stack · UX/UI Designer · Especialista en CRM/reservas para negocios
> locales · Devil's Advocate · Reviewer de requisitos y riesgos.
>
> Nombre de trabajo del producto: **OperaOS** (provisional).
> Versión: SDD v1 · Estado: borrador para aprobación.

---

## 1. Resumen ejecutivo

OperaOS es un **Business OS / CRM operativo** para negocios locales que viven de
**citas, recursos, empleados y repetición de clientes**: estética, belleza,
peluquería/barbería y fisioterapia ligera en primera fase; restaurantes y
gimnasios/box en fases posteriores.

La tesis central del producto es una abstracción única:

> **Una reserva consume tiempo de uno o varios recursos** (y, opcionalmente, de un
> empleado), validado contra disponibilidad, horarios y ausencias.

Esa abstracción —`Booking` ↔ `Resource` ↔ `Employee` ↔ `Service`— es lo que
permite que un mismo **core** sirva a una camilla de fisio, un sillón de
barbería, una cabina de láser, una mesa de restaurante o una clase de CrossFit
con aforo. Sobre el core se activan **packs sectoriales** que añaden campos,
reglas y vistas específicas sin duplicar el dominio.

Recomendación del equipo: **MVP enfocado en estética + peluquería/barbería +
fisio ligera**, multi-tenant desde el día uno, monolito modular (no
microservicios), nóminas solo como PDF, sin facturación fiscal ni IA en v1.
Diferenciación = operativa real del negocio local (no-shows, huecos muertos,
rebooking, bonos, ocupación de recursos), no "otro CRM".

El mayor riesgo no es técnico sino de **scope**: querer cubrir todos los sectores
con la misma profundidad. La mitigación está en este documento: core estricto +
packs incrementales + un MVP deliberadamente pequeño y vendible.

---

## 2. Línea de negocio

- **Categoría:** SaaS vertical B2B de gestión operativa (Business OS) para
  negocios locales de servicios con cita previa / aforo / recursos.
- **Modelo de ingresos:** suscripción mensual por sede (SaaS puro), con planes
  por tamaño y por packs sectoriales activados. **No** se depende de comisiones
  por reserva (eso es marketplace y crea conflicto de incentivos con el negocio).
- **Unidad de cobro:** por **sede** (location), con descuento multi-sede.
- **Add-ons futuros:** recordatorios por WhatsApp (coste variable), pagos online
  (Stripe/Redsys), módulo IA, portal de cliente de marca.
- **Ventaja del enfoque:** ingresos recurrentes predecibles, alineados con el
  valor que recibe el dueño (ahorro de tiempo y reducción de no-shows), sin
  intermediar la relación negocio↔cliente.

---

## 3. Público objetivo

**Comprador económico:** el dueño/gerente del negocio local (no un departamento
de IT). Decide rápido, valora simplicidad y resultados, no quiere "aprender un
ERP".

**Usuarios:**

| Rol | Quién es | Necesidad principal |
|---|---|---|
| Owner | Dueño/a | Visión del negocio, configuración, métricas |
| Manager | Encargado/a de sede | Agenda, equipo, aprobaciones |
| Receptionist | Recepción | Crear/mover reservas en pocos clics |
| Professional/Employee | Estilista, fisio, coach… | Ver SU agenda sin ruido, sus documentos |
| Accountant (externo) | Gestoría | Acceso limitado a documentos |
| Customer (futuro) | Cliente final | Reservar online, gestionar su cita |

**Segmentos prioritarios (MVP):** centros de estética/belleza, peluquerías y
barberías, y clínicas de fisioterapia pequeñas (1–10 profesionales, 1–3 sedes).

**Anti-perfil (no objetivo inicial):** grandes cadenas con ERP propio,
marketplaces, negocios sin componente de cita/recurso.

---

## 4. Propuesta de valor

**Posicionamiento:** "El sistema de reservas, clientes y empleados para negocios
locales que viven de citas, turnos, recursos y repetición de clientes."

**Problemas reales que resuelve (y cómo):**

| Dolor | Solución en OperaOS |
|---|---|
| Caos de reservas por WhatsApp | Agenda única + reserva online con validación de disponibilidad |
| No-shows | Estados de reserva + recordatorios + registro histórico de no-show |
| Huecos muertos | Vista de huecos disponibles y (futuro) lista de espera/relleno |
| Clientes olvidados | Ficha de cliente con historial, última visita y próxima reserva |
| Sin control de cabinas/sillones/mesas/clases | Recurso reservable genérico con tipos y capacidad |
| Sin control de empleados | Horarios, servicios compatibles, vacaciones que bloquean agenda |
| Vacaciones manuales | Solicitud → aprobación → bloqueo automático de disponibilidad |
| Documentos/nóminas dispersos | Documentos por empleado con visibilidad y nóminas en PDF |
| Sin métricas | Dashboard de ocupación, no-shows, recurrencia, servicios top |
| Dependencia de Excel/papel/Google Calendar | Operativa integrada en una sola herramienta |

**Diferenciadores frente a Fresha/Booksy/Treatwell/Mindbody/TheFork:**

1. **Recurso reservable genérico** real (no solo "profesional"): cabina, máquina,
   camilla, mesa, clase. Pocos lo modelan bien de forma transversal.
2. **No marketplace, no comisiones:** el negocio es dueño de su cliente; precio
   plano y predecible.
3. **Portal del empleado + vacaciones + documentos** desde el MVP: la mayoría de
   competidores de agenda lo dejan fuera o lo cobran caro.
4. **UX para el dueño de barrio**, no panel corporativo.

---

## 5. Qué construir (alcance v1)

**Core común obligatorio** (multi-tenant, reutilizable por todos los sectores):

1. Multiempresa (business) y **multisede** (location).
2. Usuarios, **roles y permisos** (RBAC) por sede y por módulo.
3. Clientes (CRM operativo) con etiquetas, notas, historial.
4. Empleados (plantilla, servicios que realizan, horario, color de agenda).
5. Servicios (duración, precio, recursos/empleados requeridos, buffers).
6. **Recursos reservables genéricos** (tipo + capacidad + compatibilidades).
7. Calendario / disponibilidad (horarios de apertura, festivos, ausencias).
8. **Reservas/citas** con estados, validación de solapamientos y buffers.
9. Recordatorios (programados; envío real como integración).
10. Portal del empleado (su agenda, sus documentos, sus vacaciones).
11. Vacaciones/ausencias con aprobación y bloqueo de agenda.
12. Documentos internos + **nóminas como PDF** (no cálculo).
13. Configuración del negocio (horarios, cierres, datos básicos).
14. Dashboard + reporting básico.
15. Sistema de **etiquetas** y notas.
16. Bonos/paquetes de sesiones (clave en estética/fisio/peluquería).
17. Base para integraciones y automatizaciones futuras (modelo de eventos).

---

## 6. Qué NO construir en v1 (non-goals)

Explícitamente fuera del MVP (diseñar para no bloquearlos, pero no implementarlos):

1. CRM genérico sin lógica sectorial.
2. Marketplace (Treatwell/TheFork/Booksy).
3. Sistema de nóminas calculadas / cumplimiento laboral España.
4. Facturación fiscal completa (VERI*FACTU) — solo se deja "preparada".
5. Biometría / fichaje biométrico.
6. App móvil nativa obligatoria (web responsive primero; PWA si hace falta).
7. IA "por moda" sin caso de uso claro.
8. Pack restaurante completo y pack gym/box completo (fases 8–9).
9. TPV complejo, inventario avanzado, comisiones liquidadas.
10. Sistema clínico avanzado (solo historial básico con permisos reforzados).
11. Pagos online en el primer corte (se añaden tras MVP).

**Regla de oro:** ante la duda, va a "Non-goals". El MVP debe poder lanzarse.

---

## 7. MVP recomendado

**Verticales del MVP:** estética/belleza, peluquería/barbería, fisioterapia
ligera. Comparten agenda, clientes, empleados, servicios, recursos, bonos,
historial, recordatorios, vacaciones, documentos y portal de empleado básico.

**Incluye (corte funcional v1):**

Login · Registro de empresa · Sedes · Empleados · Roles/permisos · Clientes ·
Servicios · Recursos reservables · Agenda/calendario · Crear reserva manual ·
Reserva online · Estados (Pending/Confirmed/Cancelled/Completed/No-show, +
Checked-in opcional) · Recordatorios · Bonos/paquetes · Historial básico de
cliente · Portal del empleado · Solicitud y aprobación de vacaciones · Subida de
documentos · Nóminas PDF · Dashboard básico · Configuración del negocio.

**Excluye del MVP:** nómina calculada, facturación fiscal avanzada, TPV complejo,
inventario avanzado, IA predictiva, restaurante completo, gym/box completo,
marketplace, app nativa obligatoria.

**Decisión dudosa — Check-in/fichaje en MVP:**
- Opción A (recomendada): incluir estado **Checked-in** en la reserva (un clic),
  sin control horario laboral. Pros: aporta señal de no-show y "en curso", coste
  bajo. Contras: no es fichaje legal.
- Opción B: fichaje de jornada del empleado. Pros: control horario. Contras:
  abre expectativas legales (registro de jornada España) y biometría → fuera.
- **Recomendación:** A en MVP; B (sin biometría) como módulo opcional fase 4+.

---

## 8. Módulos del sistema (detalle)

Para cada módulo: funcionalidades, entidades, campos clave, reglas, permisos,
edge cases y criterios de aceptación (CA). El modelo de datos formal está en §12.

### 8.1 Empresas y sedes
- **Funcionalidades:** crear empresa; crear/editar sedes; horarios de apertura;
  cierres y festivos; datos fiscales básicos; canales de contacto; zona horaria;
  moneda; idioma (futuro).
- **Entidades:** `Business`, `Location`, `BusinessSettings`, `OpeningHours`, `Holiday`.
- **Reglas:** toda sede pertenece a una empresa; la disponibilidad se calcula con
  `OpeningHours` ∩ (no `Holiday`) ∩ (no ausencias). Zona horaria a nivel de sede.
- **Permisos:** Owner CRUD total; Manager edita su sede; resto solo lectura.
- **Edge cases:** sede sin horarios → no permite reservas; cambio de zona horaria
  no debe mover reservas existentes (se guardan en UTC + tz de sede).
- **CA:** un Owner crea empresa + sede con horarios y la sede queda reservable.

### 8.2 Usuarios, roles y permisos (RBAC)
- **Funcionalidades:** crear/invitar usuarios; asignar rol; limitar por sede y por
  módulo; "el empleado solo ve sus citas"; manager ve su sede; admin ve todo.
- **Entidades:** `User`, `Role`, `Permission`, `Membership` (user×business×sede×rol).
- **Roles iniciales:** Owner, Admin, Manager, Employee, Receptionist, Professional,
  Accountant(externo), Customer(futuro).
- **Permisos (ejemplos):** customers.read/create/edit, bookings.read/create/cancel,
  agenda.read.own/all, billing.read, employees.manage, timeoff.approve,
  documents.upload/read.own/read.all, settings.manage.
- **Decisión — modelo de permisos:**
  - Opción A: RBAC por rol con scope de sede (recomendado MVP). Simple, suficiente.
  - Opción B: ABAC/políticas finas por recurso. Potente pero sobreingeniería en v1.
  - **Recomendación:** A, con permisos atómicos agrupados por rol y `scope`
    (`own` | `location` | `business`).
- **Reglas:** Professional/Employee → `agenda.read.own`; Manager → `*.location`;
  Owner/Admin → `*.business`. Accountant → solo `documents.read.all` (o subset).
- **Edge cases:** usuario en varias sedes/empresas (Membership múltiple); revocar
  acceso no borra histórico; último Owner no puede auto-eliminarse.
- **CA:** un Employee autenticado solo ve sus reservas y sus documentos.

### 8.3 Clientes (CRM operativo)
- **Funcionalidades:** crear/editar/buscar; notas; etiquetas; historial de
  reservas y servicios; bonos; preferencias; consentimientos (sectores sensibles).
- **Entidad:** `Customer`. **Campos:** nombre, apellidos, teléfono, email, fecha
  nacimiento, género (opcional), dirección (opcional), canal de captación, notas,
  etiquetas, preferencias (JSON), consentimiento comunicaciones (bool+fecha),
  alta, última visita (derivada), próxima reserva (derivada), estado
  (Activo/Inactivo/Bloqueado/Potencial).
- **Reglas:** cliente **Bloqueado** no puede reservar online; teléfono o email al
  menos uno; "última visita" y "próxima reserva" se calculan, no se editan.
- **Permisos:** customers.read/create/edit por sede/empresa según rol.
- **Edge cases:** duplicados (sugerir merge por teléfono/email); RGPD: borrado →
  anonimizar manteniendo histórico agregado.
- **CA:** crear cliente, reservarle una cita y ver esa cita en su historial.

### 8.4 Empleados
- **Funcionalidades:** crear/editar/baja; rol; sede; servicios que realiza;
  horario semanal; color en agenda; vacaciones; documentos; nóminas PDF;
  rendimiento básico.
- **Entidad:** `Employee` (1:0..1 con `User` si tiene acceso al portal).
- **Campos:** nombre, apellidos, email, teléfono, rol, sede, especialidad, alta,
  estado, color, servicios asignados (N:M), horario semanal, vacaciones
  disponibles/usadas, comisión (opcional, sin liquidación en v1).
- **Reglas:** un servicio solo puede asignarse a empleados compatibles; baja →
  no asignable a nuevas reservas (histórico intacto).
- **Permisos:** employees.manage (Owner/Admin/Manager-sede).
- **Edge cases:** empleado sin `User` (no usa portal) válido; cambio de sede no
  reasigna reservas pasadas.
- **CA:** asignar a un empleado 2 servicios y que solo esos aparezcan al reservar.

### 8.5 Recursos reservables (núcleo diferencial)
- **Funcionalidades:** CRUD de recursos genéricos configurables por tipo.
- **Entidad:** `Resource`. **Tipos:** TABLE, ROOM, CABIN, CHAIR, BED, MACHINE,
  CLASS_SLOT, TRAINER, COURT, SPACE, OTHER.
- **Campos:** nombre, tipo, sede, capacidad, estado, servicios compatibles (N:M),
  empleados compatibles (N:M), ubicación interna, descripción, `metadata` JSON
  (campos sectoriales).
- **Reglas:** un recurso no puede tener dos reservas solapadas (salvo capacidad>1,
  p. ej. clase con aforo o mesa combinable); recurso inactivo no recibe reservas.
- **Decisión — capacidad y aforo:**
  - `capacity = 1` → recurso exclusivo (cabina, camilla, sillón, mesa simple).
  - `capacity > 1` → aforo compartido (clase, mesa grande): permite N reservas
    concurrentes hasta capacidad. Cubre gym/box y restaurante sin re-modelar.
- **Edge cases:** mesas combinables (futuro: `ResourceGroup`); máquina compartida
  por 2 cabinas (recurso transversal a sede).
- **CA:** crear "Cabina Láser 1" (cap. 1) y "Clase 19:00" (cap. 16) y que la
  reserva respete cada capacidad.

### 8.6 Servicios
- **Funcionalidades:** CRUD; categoría; duración; precio; impuesto; empleados
  compatibles; recursos requeridos; requiere consentimiento; requiere bono;
  reservable online; color; buffer antes/después.
- **Entidad:** `Service`. **Campos:** nombre, descripción, categoría, duración,
  precio, impuesto, recurso requerido (tipo/uno concreto), profesional requerido
  (bool), activo, reservable online, color, buffer_before, buffer_after,
  requiere_consentimiento, requiere_bono.
- **Reglas:** servicio inactivo no aparece en reserva online; si requiere recurso
  y no hay disponible → no reservable; buffers afectan a disponibilidad.
- **Permisos:** services.manage (Owner/Admin/Manager).
- **Edge cases:** servicio que requiere 2 recursos (profesional + máquina);
  duración variable por profesional (futuro: override por empleado).
- **CA:** un servicio "Láser" requiere máquina + profesional y la reserva valida
  ambos.

### 8.7 Reservas / citas (corazón del sistema)
- **Funcionalidades:** crear manual/online; seleccionar cliente/servicio/empleado/
  recurso; validar disponibilidad; evitar solapamientos; cambiar estado; cancelar;
  reprogramar; no-show; notas; recordatorio.
- **Entidad:** `Booking` (+ `BookingStatusHistory`). **Campos:** sede, cliente,
  servicio, empleado (opcional), recurso(s), inicio, fin (derivado de duración +
  buffers), estado, canal (manual/online), notas, origen, creado_por.
- **Estados:** Draft → Pending → Confirmed → Checked-in → In-progress → Completed;
  y Cancelled / No-show como terminales.
- **Reglas (resumen, completo en §11):** sin solapes de empleado ni de recurso
  (respetando capacidad); empleado dentro de horario y sin ausencia; servicio
  compatible con empleado y recurso; respeta apertura/festivos/buffers.
- **Permisos:** bookings.create/cancel; agenda.read.own|location|business.
- **Edge cases:** reprogramación que invalida disponibilidad; reserva a caballo de
  cierre; doble click (idempotencia); zona horaria; reserva con bono sin sesiones.
- **CA:** intentar dos reservas solapadas del mismo recurso → la segunda se
  rechaza con mensaje claro.

### 8.8 Bonos y paquetes
- **Funcionalidades:** crear bono (plantilla); asignar a cliente; sesiones;
  caducidad; consumir; ver restantes; renovar; cancelar; asociar a servicios.
- **Entidades:** `Package` (plantilla), `CustomerPackage` (instancia del cliente),
  `PackageSession` (consumo, idealmente ligado a un `Booking`).
- **Reglas:** no consumir más sesiones que las disponibles; bono caducado no
  consume; consumo preferente automático al completar una reserva del servicio.
- **Edge cases:** reembolso/anulación de sesión consumida; bono que cubre varios
  servicios; transferencia entre clientes (no en v1).
- **CA:** bono de 5 sesiones; tras completar 5 reservas, queda a 0 y no permite más.

### 8.9 Portal del empleado
- **Empleado:** ve su agenda, sus turnos, solicita vacaciones, ve estado,
  ve documentos, descarga nóminas, recibe comunicados, ve avisos.
- **Manager/Admin:** aprueba/rechaza vacaciones, sube documentos/nóminas, ve
  ausencias, ve calendario del equipo, configura turnos.
- **Reglas:** el empleado solo ve SUS datos (agenda/documentos); aislamiento por
  `Membership`.
- **CA:** un empleado solicita vacaciones y solo ve sus propias solicitudes y citas.

### 8.10 Vacaciones y ausencias
- **Entidad:** `EmployeeTimeOffRequest`. **Estados:** Pending/Approved/Rejected/
  Cancelled. **Tipos:** vacaciones, baja, permiso.
- **Reglas:** aprobada → bloquea automáticamente la disponibilidad del empleado en
  ese rango; no se pueden asignar citas a empleado ausente; histórico permanente.
- **Edge cases:** ausencia que choca con reservas ya existentes → avisar y forzar
  reprogramación; solicitudes solapadas.
- **CA:** aprobar vacaciones bloquea la agenda y oculta esos huecos en reserva.

### 8.11 Documentos y nóminas (PDF)
- **Entidades:** `Document`, `EmployeeDocument`. **Tipos:** nómina, contrato,
  certificado, interno, otro. **Visibilidad:** privado-empleado | sede | empresa.
- **Reglas:** nóminas **no se calculan**, solo se almacenan; el empleado solo ve
  sus documentos; Owner/Admin ven todos; ficheros en storage privado con URL
  firmada y caducidad.
- **CA:** Admin sube nómina a un empleado; solo ese empleado (y Admin/Owner) la ve
  y descarga.

### 8.12 Dashboard y reporting (MVP)
- **KPIs MVP:** reservas de hoy, por estado, clientes nuevos vs recurrentes,
  huecos disponibles, no-shows, servicios más reservados, ocupación por empleado,
  ocupación por recurso, próximas vacaciones, facturación estimada (si hay precio).
- **KPIs futuros:** ticket medio, LTV, churn, retención, rebooking rate, ocupación
  por franja, rentabilidad por servicio, productividad por empleado, inactivos,
  riesgo de abandono.
- **CA:** el dashboard muestra correctamente las reservas de hoy y los no-shows.

---

## 9. Packs sectoriales

Cada pack = campos (`metadata`/tablas de extensión) + reglas + vistas, activado
por `sector_modules`. No duplican el core.

### 9.1 Pack Estética (MVP)
- Recursos: cabinas, máquinas. Bonos. Historial de tratamiento. Consentimientos.
  (Fase posterior: fotos antes/después, inventario, comisiones, recordatorio
  pre/post tratamiento.)
- Campos específicos: tipo de cabina, máquina requerida, contraindicaciones,
  consentimiento obligatorio, nº de sesión, evolución, próxima sesión recomendada.
- Entidad de extensión: `TreatmentNote` (cliente, booking, evolución, producto).

### 9.2 Pack Peluquería/Barbería (MVP)
- Recursos: sillones + profesionales. Elección de profesional favorito. Rebooking.
  (Posterior: fórmulas de color, productos usados, fotos, comisiones.)
- Campos: fórmula de color, corte habitual, preferencias, profesional favorito,
  frecuencia recomendada.
- Entidad de extensión: `ClientStylePref` / `ServiceFormula`.

### 9.3 Pack Fisioterapia / clínica ligera (MVP, con cuidado de privacidad)
- Recursos: camillas/cabinas + fisios. Historial clínico básico. Consentimientos.
  Plantillas de evolución. Bonos. Permisos reforzados.
- Campos: motivo de consulta, antecedentes, evolución, tratamiento, ejercicios,
  consentimiento, profesional responsable, tipo de sesión, sesiones restantes.
- Entidad: `ClinicalRecord` (acceso restringido, cifrado en reposo, auditoría).
- **Aviso:** datos de salud (RGPD art. 9). Acceso por permiso reforzado, registro
  de accesos (fase posterior), minimización de datos. Ver §18.

### 9.4 Pack Restaurante (fase 8, NO MVP)
- Plano de sala, mesas, zonas, capacidad min/max, mesas combinables, turnos,
  duración estimada, reservas online, walk-ins, waitlist, no-shows, alergias.
- Reutiliza `Resource(type=TABLE, capacity=N)` + `metadata` (zona, combinables).
- Entidad de extensión: `TableReservationMeta` (comensales, turno, alergias).

### 9.5 Pack Gimnasio/Box (fase 9, NO MVP)
- Membresías, clases con aforo, coaches, salas, reserva de plaza, lista de espera,
  check-in, no-show; (posterior: pagos recurrentes, penalizaciones, leads, prueba
  gratis, retención).
- Reutiliza `Resource(type=CLASS_SLOT, capacity=aforo)` + `Membership` (cliente).
- Entidades: `Membership`, `ClassBooking` (especialización de Booking con aforo).

> **Principio:** mesas, clases y cabinas son **el mismo `Resource`** con distinto
> `type` y `capacity`. Los packs añaden campos y vistas, no un dominio nuevo.

---

## 10. Casos de uso (formato completo)

Plantilla: Actor · Objetivo · Precondiciones · Flujo principal · Alternativos ·
Reglas · Validaciones · Resultado · Criterios de aceptación. Se detallan 3
representativos; el resto (lista §10.x) sigue la misma plantilla en backlog.

### UC-07 Cliente reserva cita online
- **Actor:** Cliente (no autenticado o con datos mínimos).
- **Objetivo:** reservar un servicio en una fecha/hora válida.
- **Precondiciones:** sede con reserva online activa; servicio reservable online;
  cliente no bloqueado.
- **Flujo principal:** elige servicio → (opcional) profesional → el sistema
  calcula huecos válidos (horario ∩ recurso ∩ empleado ∩ buffers ∩ sin ausencias)
  → elige hueco → introduce datos de contacto/consentimiento → confirma → reserva
  en estado Pending/Confirmed → se programa recordatorio.
- **Alternativos:** sin profesional preferente → asignación automática; no hay
  huecos → ofrecer próximas fechas o lista de espera (futuro).
- **Reglas:** R1–R7, R13, R15 (§11). **Validaciones:** disponibilidad atómica
  (transacción), consentimiento si el servicio lo exige, formato de contacto.
- **Resultado:** reserva creada + confirmación + recordatorio programado.
- **CA:** dos clientes no pueden reservar el mismo recurso/hueco (el segundo ve el
  hueco desaparecer); la reserva respeta apertura y buffers.

### UC-14/15/16 Empleado solicita vacaciones → Manager aprueba → agenda bloqueada
- **Actores:** Employee, Manager, Sistema.
- **Flujo:** empleado crea `TimeOffRequest` (rango, tipo) → Manager ve pendiente →
  aprueba → el sistema marca el rango como no disponible para ese empleado y
  excluye sus huecos de la reserva online.
- **Reglas:** R8; si hay reservas en el rango, se listan para reprogramar.
- **CA:** tras aprobar, los huecos del empleado desaparecen de la agenda y de la
  reserva online en ese rango.

### UC-19/20 Admin crea bono → cliente consume sesión
- **Actores:** Admin, Sistema. **Flujo:** Admin crea `Package` (5 sesiones, 90
  días) → lo asigna a un cliente (`CustomerPackage`) → al completar una reserva del
  servicio cubierto, se consume 1 sesión (`PackageSession`) → se muestran
  restantes.
- **Reglas:** R9; no consumir si caducado o a 0.
- **CA:** a la 6ª reserva, el sistema no permite consumir y avisa "bono agotado".

### 10.x Casos de uso MVP (catálogo, misma plantilla en backlog)
UC-01 Owner crea empresa · UC-02 crea sede · UC-03 Admin crea empleado · UC-04
asigna rol · UC-05 crea servicio · UC-06 crea recurso · UC-07 reserva online ·
UC-08 recepción crea cita manual · UC-09 sistema valida disponibilidad · UC-10
envía recordatorio · UC-11 empleado ve su agenda · UC-12 cliente cancela · UC-13
admin marca no-show · UC-14 solicita vacaciones · UC-15 aprueba · UC-16 bloquea
agenda · UC-17 sube nómina PDF · UC-18 empleado descarga nómina · UC-19 crea bono
· UC-20 consume sesión · UC-21 owner revisa dashboard · UC-22 huecos disponibles ·
UC-23 clientes inactivos · UC-24 ocupación por recurso · UC-25 productividad por
empleado.

---

## 11. Reglas de negocio

| # | Regla | Tipo |
|---|---|---|
| R1 | Un empleado no puede tener dos reservas solapadas | Invariante |
| R2 | Un recurso no puede solaparse por encima de su capacidad | Invariante |
| R3 | Un servicio solo se asigna a empleados compatibles | Validación |
| R4 | Servicio que requiere recurso no se reserva sin recurso disponible | Validación |
| R5 | Reserva online respeta horarios de apertura de la sede | Validación |
| R6 | Reserva respeta buffers (antes/después) del servicio | Validación |
| R7 | No se reserva en festivo/cierre salvo configuración explícita | Validación |
| R8 | Vacaciones aprobadas bloquean la disponibilidad del empleado | Invariante |
| R9 | Un bono no consume más sesiones de las disponibles ni caducado | Invariante |
| R10 | Un empleado solo ve sus documentos | Autorización |
| R11 | Un manager ve empleados/datos de su sede | Autorización |
| R12 | Un owner ve todas las sedes de su empresa | Autorización |
| R13 | Cliente bloqueado no puede reservar online | Validación |
| R14 | Recurso inactivo no recibe reservas | Validación |
| R15 | Servicio inactivo no aparece en reserva online | Validación |
| R16 | Un no-show queda registrado en histórico | Auditoría |
| R17 | Modificaciones sensibles dejan traza (futuro: audit_logs) | Auditoría |
| R18 | Datos clínicos requieren permisos reforzados | Seguridad |
| R19 | Nóminas no se calculan, solo se almacenan como documento | Alcance |
| R20 | Facturación fiscal avanzada no forma parte de la v1 | Alcance |

**Validación de disponibilidad (pseudocódigo):**

```
function checkAvailability(loc, service, employee?, resource?, start):
  end = start + service.duration
  windowStart = start - service.buffer_before
  windowEnd   = end   + service.buffer_after
  assert within(OpeningHours[loc], start, end)            // R5
  assert not isHoliday(loc, start) or loc.allowOnHoliday  // R7
  if employee:
    assert service in employee.services                   // R3
    assert not overlaps(employee.bookings, windowStart, windowEnd)  // R1
    assert not isOnTimeOff(employee, start, end)          // R8
  if service.requiresResource:
    r = resource ?? pickResource(service, loc, windowStart, windowEnd)
    assert r != null and r.active                         // R4, R14
    assert concurrent(r.bookings, start, end) < r.capacity // R2
  return OK   // ejecutar dentro de transacción con lock para evitar carreras
```

---

## 12. Modelo de datos inicial

Multi-tenant: **toda** tabla de negocio lleva `business_id` (y `location_id`
cuando aplica). Estrategia: BD compartida + RLS por tenant (ver §15). IDs `uuid`
(o `cuid` si se usa Prisma). `created_at`/`updated_at` en todas.

> Convención: PK `id`; FKs `*_id`; índices en todas las FKs y en columnas de
> filtrado/orden frecuentes. `metadata jsonb` solo donde aporta flexibilidad real.

### Núcleo

**businesses** — empresa (tenant raíz).
`id, name, legal_name?, tax_id?, default_currency, default_timezone, plan,
created_at, updated_at`. Índices: `(id)`. Nota: raíz de aislamiento.

**locations** — sede. `id, business_id→businesses, name, address?, timezone,
currency, phone?, email?, online_booking_enabled bool, active bool, ...`.
Índices: `(business_id)`. Restricción: `name` único por business.

**business_settings** — ajustes por categoría. `business_id, location_id?,
category, data jsonb, updated_at`. PK `(business_id, location_id, category)`.

**opening_hours** — horario semanal de la sede. `id, location_id, weekday(0-6),
open_time, close_time`. Índice `(location_id, weekday)`. Permite varios tramos.

**holidays** — cierres/festivos. `id, location_id, date, name?, is_open bool`.
Índice `(location_id, date)`.

**users** — cuenta de acceso. `id, email unique, password_hash|auth_provider,
first_name, last_name, status, created_at`. (Si Supabase Auth: espejo de auth.users.)

**roles** — `id, business_id?, key, name` (roles sistema + custom por business).

**permissions** — `id, key, description`. **role_permissions** `(role_id,
permission_id, scope)` scope ∈ own|location|business.

**memberships** — pertenencia. `id, user_id, business_id, location_id?, role_id,
created_at`. Índices `(user_id)`, `(business_id)`. Un user puede tener varias.

### Personas y catálogo

**employees** — `id, business_id, location_id, user_id?(→users), first_name,
last_name, email?, phone?, specialty?, color, status, hire_date?, vacation_total,
vacation_used, commission?`. Índices `(business_id)`, `(location_id)`, `(user_id)`.

**employee_services** — N:M `(employee_id, service_id)`.

**employee_schedules** — turno semanal. `id, employee_id, weekday, start_time,
end_time`. Índice `(employee_id, weekday)`.

**customers** — `id, business_id, first_name, last_name?, phone?, email?, birth_date?,
gender?, address?, acquisition_channel?, notes?, preferences jsonb, consent_comms
bool, consent_at?, status, created_at`. Derivados (vista/campo calculado):
`last_visit`, `next_booking`. Índices `(business_id)`, `(business_id, phone)`,
`(business_id, email)`. Restricción: al menos phone o email.

**customer_tags / tags** — etiquetas. `tags(id, business_id, name, color)`,
`customer_tags(customer_id, tag_id)`.

**services** — `id, business_id, name, description?, category?, duration_min,
price numeric, tax?, requires_resource bool, resource_type?, requires_professional
bool, online_bookable bool, color, buffer_before, buffer_after, requires_consent
bool, requires_package bool, active bool`. Índices `(business_id)`,
`(business_id, active)`.

**resources** — `id, business_id, location_id, name, type(enum), capacity int
default 1, status, location_note?, description?, metadata jsonb`. Índices
`(business_id)`, `(location_id, type)`. **resource_services** N:M,
**resource_employees** N:M (compatibilidades).

### Reservas

**bookings** — `id, business_id, location_id, customer_id?, service_id,
employee_id?, start_at timestamptz, end_at timestamptz, status(enum), channel(enum
manual|online), notes?, created_by, source?, created_at, updated_at`. Índices
`(business_id)`, `(location_id, start_at)`, `(employee_id, start_at)`,
`(customer_id)`, `(status)`. Restricción de exclusión (Postgres `EXCLUDE USING
gist`) para evitar solapes por empleado/recurso (ver nota).

**booking_resources** — N:M reserva↔recurso `(booking_id, resource_id)` (un
servicio puede usar varios recursos; un recurso de aforo recibe varias reservas).

**booking_status_history** — `id, booking_id, from_status, to_status, changed_by,
changed_at, reason?`. Índice `(booking_id, changed_at)`.

> **Nota anti-solape (R1/R2):** además de la validación en servicio (transacción
> con lock), se recomienda constraint de exclusión temporal en Postgres
> (`tstzrange`) por `employee_id` y por `resource_id` (cuando capacity=1) para
> garantía a nivel de BD. Para aforo>1 se valida en aplicación.

### Vacaciones, documentos, bonos

**employee_time_off_requests** — `id, business_id, employee_id, type, start_date,
end_date, status(enum), reason?, decided_by?, decided_at?, created_at`. Índice
`(employee_id, start_date)`.

**documents** — `id, business_id, owner_type(employee|business), title, type(enum
nomina|contrato|certificado|interno|otro), file_path, visibility(enum own|location|
business), uploaded_by, created_at`. **employee_documents** — vínculo
`(document_id, employee_id)` o `owner_id` directo en documents. Índice
`(business_id)`, `(employee_id)`.

**packages** — plantilla. `id, business_id, name, sessions_total, validity_days,
price?, active`. **package_services** N:M servicios incluidos.

**customer_packages** — instancia. `id, business_id, customer_id, package_id,
sessions_total, sessions_used, purchased_at, expires_at, status`. Índice
`(customer_id)`.

**package_sessions** — consumo. `id, customer_package_id, booking_id?, used_at,
note?`. Índice `(customer_package_id)`.

### Plataforma

**notifications** — `id, business_id, type, channel(email|sms|whatsapp|inapp),
target, payload jsonb, scheduled_at, sent_at?, status`. Índice `(scheduled_at,
status)`.

**sector_modules** — packs activos por tenant. `(business_id, module_key, enabled,
config jsonb)`. PK `(business_id, module_key)`.

**audit_logs (futuro)** — `id, business_id, actor_id, action, entity, entity_id,
diff jsonb, created_at`. Índice `(business_id, created_at)`.

**Decisión — generación de huecos:** no se materializan slots; se calcula
disponibilidad on-the-fly desde `opening_hours` − reservas − ausencias − festivos.
Pros: sin explosión de filas, flexible. Contra: cálculo en cada consulta →
mitigar con índices y caché por día/sede.

---

## 13. APIs (REST, contratos)

Convenciones: JSON; auth `Bearer` JWT; tenant resuelto del token (no del path);
errores `{ error: { code, message, details? } }`; paginación `?page&pageSize`;
`409` para conflicto de disponibilidad; `422` validación; `403` permisos.

### Auth
- `POST /auth/register` → crea business + owner. Req `{business, owner}` → `201
  {token, user, business}`. Val: email único. 
- `POST /auth/login` `{email,password}` → `{token, user, memberships}`.
- `POST /auth/logout` → `204`. `GET /auth/me` → `{user, memberships, permissions}`.

### Business / Locations
- `GET /businesses/current` · `PATCH /businesses/current` (perm settings.manage).
- `GET /locations` · `POST /locations` · `PATCH /locations/:id`.

### Employees / Customers / Services / Resources (CRUD análogo)
- `GET/POST /employees`, `GET/PATCH/DELETE /employees/:id` (perm employees.manage).
- `GET/POST /customers`, `GET/PATCH/DELETE /customers/:id` (perm customers.*).
- `GET/POST /services`, `GET/PATCH/DELETE /services/:id`.
- `GET/POST /resources`, `GET/PATCH/DELETE /resources/:id`.

### Bookings (núcleo)
- `POST /bookings/check-availability` Req `{locationId, serviceId, employeeId?,
  resourceId?, date}` → `200 {slots:[{start,end,employeeId,resourceId}]}`. Aplica
  R1–R7. **CA:** nunca devuelve un hueco que viole una regla.
- `POST /bookings` `{locationId, customerId?, serviceId, employeeId?, resourceId?,
  start}` → `201 {booking}` | `409 {error:availability}`. Transacción con lock.
- `GET /bookings?from&to&employeeId?&status?` (scope por permiso/rol).
- `GET /bookings/:id` · `PATCH /bookings/:id` (reprograma → revalida).
- `POST /bookings/:id/cancel|complete|no-show` → registra en `status_history`;
  `complete` puede consumir bono.

### Time off / Documents / Packages / Dashboard
- `GET/POST /time-off`, `PATCH /time-off/:id/approve|reject` (perm timeoff.approve).
  approve → bloquea disponibilidad.
- `GET/POST /documents` (multipart → storage privado), `GET /documents/:id`
  (URL firmada), `DELETE /documents/:id`. Filtra por visibilidad/rol.
- `GET/POST /packages`, `POST /customers/:id/packages`,
  `POST /customer-packages/:id/consume-session` (valida R9).
- `GET /dashboard/summary|bookings|occupancy|employees` (agregados por sede/fecha).

Para cada endpoint el backlog detalla: request, response, validaciones, permisos,
errores y CA (plantilla común).

---

## 14. Arquitectura técnica

**Estilo:** **monolito modular** (no microservicios en MVP). Separación por
módulos de dominio con capas: `domain` (entidades + reglas) · `application`
(casos de uso/servicios) · `infrastructure` (BD, storage, email) · `interface`
(API REST + UI). Microservicios solo si una pieza (p. ej. motor de
disponibilidad) lo justifica más adelante.

**Stack recomendado (justificado):**

| Capa | Elección | Por qué |
|---|---|---|
| Frontend | **Next.js (App Router) + React + TS + Tailwind** | SSR/SEO para reserva online pública, DX, alineado con agents-agency |
| Backend | **Node.js + Express o NestJS** | NestJS aporta modularidad/DI que encaja con monolito modular; Express si se prioriza simplicidad. **Rec.: NestJS** para imponer límites de módulo |
| ORM/DB | **PostgreSQL + Prisma** | Postgres por RLS, `tstzrange`/exclusion constraints (clave para solapes) y `jsonb`; Prisma ya usado en agents-agency |
| Auth | **Supabase Auth** o Auth.js | Supabase si se usa su Postgres+Storage; si no, Auth.js. JWT con claims de tenant |
| Storage | **Supabase Storage / S3** | Documentos y nóminas privados con URL firmada |
| Emails | **Resend / SendGrid** | Recordatorios y transaccional |
| WhatsApp | Integración futura (Meta API/360dialog) | Coste variable, fase posterior |
| Pagos | Stripe (intl) / Redsys (ES) futuro | Tras MVP |
| Hosting | Vercel (front) + Railway/Render/Fly (API) + Supabase (DB) | Simplicidad operativa |

> **Nota de coherencia con agents-agency:** ese repo ya es Node + Express +
> Prisma + Postgres. Recomendación: **reutilizar su backend** (Express/Prisma) y
> añadir OperaOS como **módulos de dominio** dentro de él, en vez de levantar otro
> stack. Si se prefiere aislamiento, NestJS aparte conectado al mismo Postgres.
> Decidir en Fase 0 (ver §16).

**Seguridad / Auth / Authz:**
- JWT con `userId`; el `business_id`/sede activos se resuelven de `memberships`.
- **Autorización** por permisos atómicos + `scope` (own|location|business),
  evaluada en middleware y en la capa de aplicación.
- **Multi-tenant:** RLS en Postgres por `business_id` como segunda barrera además
  de los filtros de aplicación (defensa en profundidad).
- **Datos clínicos:** permiso reforzado + (futuro) registro de accesos; cifrado en
  reposo de ficheros; minimización.
- **Documentos:** bucket privado, URLs firmadas con caducidad corta.

**Notificaciones / eventos:** modelo de **eventos de dominio** (BookingCreated,
BookingCancelled, NoShowMarked, TimeOffApproved, PackageLowSessions…) que alimenta
recordatorios y futuras automatizaciones. En MVP, cola simple (tabla
`notifications` + worker/cron); evolucionable a cola dedicada.

**Testing:** unitarios del **motor de disponibilidad** y reglas (críticos);
integración de API (supertest/vitest); e2e de los 5 flujos clave (Playwright).
**Observabilidad:** logs estructurados (pino), Sentry, métricas básicas.
**Escalabilidad:** índices + caché de disponibilidad por día/sede; lectura/escritura
en el mismo Postgres en MVP; sharding por tenant no necesario a esta escala.

---

## 15. UX/UI Spec

**Principios:** clara, moderna, muy fácil; pensada para el dueño de barrio;
responsive y rápida; lenguaje simple; acciones directas; estados visuales;
confirmación en acciones críticas; errores que explican cómo resolver.

**Navegación (menú lateral), priorizada:**
1. **Hoy** (resumen accionable del día) · 2. **Agenda** · 3. **Clientes** ·
4. **Crear reserva** (acción siempre accesible) · 5. **Empleados** ·
6. **Servicios** · 7. **Recursos** · 8. **Bonos** · 9. **Vacaciones** ·
10. **Documentos** · 11. **Configuración**.

**Pantallas MVP (Admin/Owner):** Login · Registro empresa · Dashboard/Hoy ·
Agenda (día/semana, por empleado y por recurso) · Crear reserva (modal en pocos
clics) · Detalle reserva · Clientes · Detalle cliente (historial, bonos) ·
Empleados · Detalle empleado · Servicios · Recursos · Bonos · Vacaciones ·
Documentos · Configuración · Configuración de reserva online pública.

**Pantallas Empleado (portal):** Login · Mi agenda · Mis turnos · Mis vacaciones ·
Solicitar vacaciones · Mis documentos · Mis nóminas · Comunicados.

**Pantallas Cliente (futuro):** página pública de reserva → servicio → profesional
(opcional) → fecha/hora → datos/consentimiento → confirmación → gestión
(cancelar/reprogramar).

**Patrones UX:**
- **Agenda** con dos ejes conmutables: por **empleado** y por **recurso** (clave
  para cabinas/mesas/clases). Drag para mover/reprogramar (revalida).
- **Crear reserva**: cliente → servicio → (huecos válidos calculados) → confirmar.
  Nunca ofrecer un hueco inválido.
- **Estados** con color y etiqueta (Pending/Confirmed/Completed/No-show…).
- **Estados vacíos** con acción ("Aún no tienes clientes — crea el primero").
- **Errores** explicativos ("Ese sillón ya está ocupado a esa hora; prueba 16:30").
- **Confirmaciones** en cancelar/no-show/eliminar.
- **Mobile**: la recepción y el empleado deben poder operar desde el móvil.

**Decisión — vista por defecto:** abrir en **Hoy** (no en Agenda completa) para
dar valor inmediato: citas de hoy, no-shows, huecos, próximas acciones.

---

## 16. Plan SDD (Spec Driven Development)

Flujo de trabajo por feature: **Spec → Revisión → Tests de aceptación → Build →
Demo**. Cada feature parte de: caso(s) de uso + reglas + contrato de API +
pantalla + CA. No se implementa sin spec aprobada.

Artefactos por feature: (1) ficha de caso de uso, (2) contrato de endpoint, (3)
esquema de datos afectado, (4) wireframe/estado de pantalla, (5) lista de CA y
tests mínimos. Este documento es el SDD v1 "paraguas"; cada feature tendrá su
mini-spec derivada.

---

## 17. Plan de implementación por fases

Cada fase: objetivo · funcionalidades · entidades · APIs · pantallas · CA · tests
mínimos · riesgos · fuera de alcance.

**Fase 0 — Discovery (1–2 sem).** Objetivo: validar supuestos y decidir si OperaOS
vive **dentro de agents-agency** o como servicio aparte. Salida: decisión de
arquitectura, 3–5 entrevistas a negocios, este SDD aprobado. CA: documento firmado.

**Fase 1 — Core SaaS.** Multiempresa, multisede, users, RBAC, configuración,
auth. Entidades: businesses, locations, users, roles, permissions, memberships,
business_settings, opening_hours, holidays. APIs: auth/*, businesses, locations.
Pantallas: login, registro, configuración. CA: owner crea empresa+sede+empleado
con roles. Tests: auth, permisos por scope. Fuera: reservas.

**Fase 2 — Agenda / reservas (núcleo).** Servicios, recursos, motor de
disponibilidad, bookings, estados, status_history. APIs: services, resources,
bookings (+check-availability, cancel/complete/no-show). Pantallas: agenda
(empleado/recurso), crear reserva, detalle. CA: R1–R7 cumplidas; no-show
registrado. Tests: disponibilidad y solapes (prioridad máxima). Fuera: online.

**Fase 3 — Clientes / servicios / recursos (consolidación) + reserva online.**
CRM, etiquetas, historial; página pública de reserva. APIs: customers, online
booking. Pantallas: clientes, detalle, reserva pública. CA: UC-07 completo. Fuera:
pagos.

**Fase 4 — Portal empleado / vacaciones / documentos.** time_off, documents,
nóminas PDF, portal. CA: aprobar vacaciones bloquea agenda (UC-14/15/16);
empleado solo ve lo suyo. Fuera: cálculo de nómina.

**Fase 5 — Bonos e historial.** packages, customer_packages, package_sessions;
consumo al completar reserva. CA: UC-19/20. 

**Fase 6 — Dashboard / reporting.** KPIs MVP + recordatorios programados
(notifications + worker). CA: §8.12. 

**Fase 7 — Packs estética / peluquería / fisio.** Campos y vistas sectoriales,
consentimientos, notas de tratamiento, historial clínico básico (permisos
reforzados). CA: cada pack añade sus campos sin tocar el core.

**Fase 8 — Pack restaurante.** Mesas/zonas/turnos/waitlist sobre `Resource`.
**Fase 9 — Pack gym/box.** Membresías/clases/aforo/check-in/lista de espera.
**Fase 10 — IA, marketing, integraciones.** WhatsApp, pagos, automatizaciones, IA
útil (no-show, inactivos, resúmenes).

---

## 18. Roadmap

- **Q1 — MVP vendible:** Fases 1–6 (estética/peluquería/fisio). Objetivo: una
  peluquería/estética/fisio opera sin Excel ni papel.
- **Q2 — Profundidad + monetización:** Fase 7 (packs) + recordatorios WhatsApp +
  pagos online; primeros clientes de pago.
- **Q3 — Expansión sectorial:** Fase 8 (restaurante) y/o 9 (gym/box) según
  tracción/demanda.
- **Q4 — Inteligencia:** Fase 10 (automatizaciones + IA útil + integraciones).

Hito de validación entre Q1 y Q2: ≥5 negocios usándolo a diario y reducción
medible de no-shows / tiempo de gestión antes de invertir en nuevos sectores.

---

## 19. Riesgos

| # | Riesgo | Prob. | Impacto | Mitigación | Decisión |
|---|---|---|---|---|---|
| 1 | Scope creep | Alta | Alto | MVP cerrado + non-goals estrictos + revisión por fase | Congelar alcance v1 |
| 2 | Abarcar demasiados sectores | Alta | Alto | Solo 3 verticales afines en MVP | Restaurante/gym a fases 8–9 |
| 3 | Competencia (Fresha, Booksy, Mindbody, TheFork) | Alta | Alto | Diferenciar en recursos genéricos + portal empleado + no-comisión | Nicho operativo, no marketplace |
| 4 | Baja adopción en negocios pequeños | Media | Alto | UX simple, onboarding guiado, import básico | Vista "Hoy" + alta en minutos |
| 5 | Complejidad legal nóminas | Media | Alto | Solo PDF, sin cálculo | Non-goal v1 |
| 6 | Complejidad fiscal facturación | Media | Alto | Preparar, no implementar | Non-goal v1 |
| 7 | Datos sanitarios (fisio) | Media | Alto | Permisos reforzados, cifrado, minimización, (futuro) auditoría | Pack fisio con cuidado |
| 8 | Integración WhatsApp (coste/políticas) | Media | Medio | Empezar por email; WhatsApp como add-on | Fase posterior |
| 9 | Dependencia de marketplace | Baja | Alto | Modelo SaaS por suscripción | No marketplace |
| 10 | Falta de diferenciación | Media | Alto | Recursos reservables + operativa real | Mensaje claro de posicionamiento |
| 11 | UX demasiado compleja | Media | Alto | Diseño "dueño de barrio", menos opciones | Tests de usabilidad |
| 12 | Modelo de permisos mal diseñado | Media | Alto | RBAC + scope desde el inicio, tests | Definido en §8.2 |
| 13 | Multi-tenant mal planteado | Media | Crítico | `business_id` en todo + RLS + tests de aislamiento | Defensa en profundidad |
| 14 | Calendario/disponibilidad mal modelados | Media | Crítico | Motor probado + exclusion constraints + tests exhaustivos | Pieza nº1 a blindar |
| 15 | Recursos reservables mal abstraídos | Media | Crítico | Modelo genérico tipo+capacidad validado con 3 sectores | Validar en Fase 0/2 |

---

## 20. Devil's Advocate (crítica honesta)

- **Demasiado ambicioso:** la lista completa (multisede + RBAC fino + bonos +
  portal + documentos + dashboard) es mucho para un "MVP". Riesgo real de tardar
  meses antes de la primera venta.
- **Módulos que sobran en el MVP:** **multisede** (la mayoría de targets tienen 1
  sede), **comisiones**, **reporting avanzado**, **roles Accountant/Receptionist**
  diferenciados. Empezar con 1 sede y 3 roles (Owner/Manager/Employee).
- **Sectores a posponer:** restaurante y gym/box no solo "más tarde": tienen
  dinámicas (waitlist, aforo en tiempo real, membresías recurrentes) que pueden
  distorsionar el core si se intentan acomodar pronto. Mantenerlos fuera hasta
  validar.
- **Deuda técnica probable:** el **motor de disponibilidad** es el punto donde se
  acumulará complejidad (buffers, multi-recurso, zonas horarias, aforo). Si se
  hace flojo, todo el producto cojea. Invertir ahí más que en pantallas bonitas.
- **Funcionalidades de dudoso valor inmediato:** historial clínico (abre riesgo
  legal sin pagar facturas todavía), comunicados internos, etiquetas avanzadas.
- **Inviabilidad/fricción legal:** datos de salud en fisio desde el MVP añade
  obligaciones RGPD art. 9; valorar lanzar primero con estética/peluquería y meter
  fisio cuando haya base sólida de permisos y auditoría.
- **Difícil de vender:** "otro sistema de reservas" en un mercado con Fresha
  (gratis para muchos) y Booksy. Sin un diferenciador nítido (recursos genéricos +
  empleados/vacaciones/documentos en el mismo sitio + sin comisiones), la venta es
  cuesta arriba.
- **Assumptions sin validar:** (a) que los negocios quieren gestionar empleados y
  documentos en la misma herramienta que la agenda; (b) que pagarán suscripción
  plana frente a alternativas gratis-con-comisión; (c) que el recurso genérico se
  entiende sin fricción en cada sector; (d) que la reserva online se adoptará.
- **Qué eliminaría para lanzar antes:** multisede, RBAC fino (3 roles), historial
  clínico, comunicados, dashboard avanzado, reporting más allá de 4 KPIs.

**Recomendación realista del Devil's Advocate:** reducir el MVP a un
**"MVP-0" de una sola sede, 3 roles, sin fisio**, centrado en agenda + recursos +
clientes + bonos + recordatorios por email + portal de empleado mínimo
(agenda + vacaciones + nómina PDF), y vender eso a estética/peluquería antes de
ampliar. Validar el recurso genérico con esos dos sectores reales.

---

## 21. Recomendación final (consenso del equipo)

1. **Construir el core estricto** del §5 con la abstracción Booking↔Resource↔
   Employee↔Service como cimiento no negociable.
2. **MVP-0 = estética + peluquería/barbería, 1 sede, 3 roles**, sin fisio y sin
   multisede. Incorporar fisio en Fase 7 cuando RBAC, permisos reforzados y (al
   menos un esbozo de) auditoría estén listos.
3. **Blindar el motor de disponibilidad** con tests desde el día uno (es el activo
   técnico diferencial y el mayor foco de deuda).
4. **Reutilizar el backend de agents-agency** (Express + Prisma + Postgres) y
   añadir OperaOS como módulos de dominio, decidido en Fase 0. La consola
   SaaS_Negocios ya generada sirve como **configurador/generador** de cada cliente
   (manifest + schema) que alimenta agents-agency.
5. **Monetizar por suscripción por sede**, nunca por comisión.
6. **Diferenciar** en: recursos genéricos reales + empleados/vacaciones/documentos
   integrados + sin comisiones + UX para dueño de barrio.
7. **Posponer** restaurante, gym/box, IA, pagos, WhatsApp y facturación hasta
   tener tracción con el MVP-0.

---

## 22. Backlog priorizado (épicas → historias, MoSCoW)

**Must (MVP-0):**
- E1 Auth & Tenant: registro empresa, login, JWT, memberships. 
- E2 Configuración: sede única, horarios, festivos.
- E3 Empleados: CRUD, servicios que realiza, horario, color.
- E4 Servicios: CRUD, duración, precio, buffers, recurso/profesional requerido.
- E5 Recursos: CRUD genérico (tipo+capacidad), compatibilidades.
- E6 Disponibilidad: motor + check-availability + tests.
- E7 Reservas: crear/mover/cancelar/completar/no-show + estados + historial.
- E8 Clientes: CRUD, etiquetas, notas, historial.
- E9 Bonos: plantillas, asignación, consumo al completar.
- E10 Portal empleado: mi agenda, mis vacaciones (solicitar), mis documentos.
- E11 Vacaciones: solicitud/aprobación + bloqueo de agenda.
- E12 Documentos/nóminas PDF: subida, visibilidad, descarga firmada.
- E13 Dashboard: Hoy + 4 KPIs (reservas, no-shows, nuevos/recurrentes, ocupación).
- E14 Recordatorios por email (programados).

**Should:** reserva online pública; roles Manager; reprogramación drag&drop;
exportar clientes; import básico.
**Could:** multisede; RBAC fino; comunicados internos; reporting avanzado.
**Won't (v1):** restaurante, gym/box, IA, pagos, WhatsApp, facturación fiscal,
nómina calculada, biometría, app nativa, marketplace.

---

## 23. Criterios de aceptación del MVP

El MVP es válido si una peluquería/estética/fisio pequeña puede: crear su empresa;
crear empleados; crear servicios; crear recursos; crear clientes; gestionar
agenda; crear reservas; recibir reservas online; **evitar solapamientos**; enviar
recordatorios; gestionar bonos; ver historial básico; solicitar y aprobar
vacaciones; subir nóminas/documentos; ver dashboard básico; y **operar sin Excel
ni agenda de papel**.

CA técnicos transversales: aislamiento multi-tenant verificado por tests; reglas
R1–R9 cubiertas por tests; el motor de disponibilidad nunca ofrece un hueco
inválido; documentos solo accesibles por su audiencia; auditoría de cambios de
estado de reserva.

---

## 24. Próximos pasos

1. **Aprobar/criticar este SDD v1** (marcar qué entra en MVP-0 y qué se recorta).
2. **Decisión de arquitectura (Fase 0):** OperaOS dentro de agents-agency
   (Express/Prisma) vs servicio NestJS aparte sobre el mismo Postgres.
3. **Validación de mercado:** 3–5 entrevistas con negocios objetivo.
4. **Aprobado el SDD →** segunda entrega: estructura de carpetas, migraciones
   Prisma, endpoints, servicios, componentes front, tests, seeds, datos mock,
   plan de despliegue, README y backlog por sprints.
5. Mientras tanto, la **consola SaaS_Negocios** (ya construida) sirve para
   prototipar y generar el paquete (manifest + schema) de cada cliente.

> Documento abierto a revisión. Señala en cada sección: aceptado / a recortar / a
> ampliar, y resolvemos las "preguntas abiertas" (modelo de permisos, multisede en
> MVP, fisio en MVP, dentro o fuera de agents-agency) antes de escribir código.
