# Criterios del proyecto
## CRM comercial geolocalizado para gestión de clientes, visitas y rutas

**Fecha:** 29/06/2026  
**Versión:** 1.0  
**Estado:** Documento base para validación funcional, estimación y propuesta técnica  
**Tipo de proyecto:** Aplicación CRM para comercial de campo con mapa, rutas, notas y seguimiento de clientes

---

## 1. Resumen ejecutivo

El cliente necesita una aplicación para gestionar su actividad comercial diaria en la calle. La necesidad principal no es crear una página web ni un ecommerce, sino disponer de una herramienta tipo CRM visual y geolocalizada que permita ver todos los clientes sobre un mapa, identificar cuáles están visitados o pendientes, dejar notas de visita, crear recordatorios y abrir rutas de navegación hacia cada cliente.

La aplicación debe funcionar como una herramienta de trabajo para comerciales: rápida, sencilla, centrada en mapa y pensada para usar desde el móvil mientras se visitan clientes.

La solución debe permitir que el comercial pueda responder en pocos segundos a estas preguntas:

- ¿Qué clientes tengo cerca de donde estoy ahora?
- ¿A quién he visitado ya y quién me falta por visitar?
- ¿Qué clientes son prioritarios por volumen de compra?
- ¿Qué notas o compromisos tengo pendientes con cada cliente?
- ¿Cuál es la siguiente visita o recordatorio asociado a este cliente?
- ¿Cómo inicio la ruta hasta el cliente desde mi ubicación actual?

El proyecto debe plantearse por fases. La primera fase debe resolver la operativa comercial básica. Las funcionalidades más avanzadas, como IA, transcripción automática de audio, geofencing, calendario bidireccional, rutas inteligentes y backoffice remoto, deben entrar como fases posteriores para evitar sobredimensionar el presupuesto inicial.

---

## 2. Necesidad real detectada

### 2.1 Problema de negocio

El cliente gestiona una cartera de clientes y prospectos que visita físicamente. Actualmente necesita una forma más clara y ordenada de controlar sus visitas, notas, rutas y prioridades comerciales.

El problema no está en vender online, sino en mejorar la gestión de la calle:

- Localizar clientes sobre un mapa.
- Saber visualmente quién está visitado y quién está pendiente.
- Guardar información de cada visita.
- Recordar compromisos futuros.
- Priorizar clientes según importancia comercial.
- Aprovechar mejor los desplazamientos.
- Preparar el sistema para que en el futuro una persona pueda ayudarle a organizar citas y rutas desde remoto.

### 2.2 Oportunidad

Una aplicación bien diseñada puede convertirse en el panel diario del comercial. En vez de consultar notas sueltas, memoria, WhatsApp, Google Maps y calendario por separado, el comercial tendría un único lugar desde el que gestionar cliente, visita, nota, tarea y ruta.

---

## 3. Objetivo del producto

Desarrollar una aplicación CRM geolocalizada para comerciales que permita gestionar clientes y prospectos desde una vista de mapa, controlar estados de visita mediante colores o iconos, registrar notas e historial comercial, crear recordatorios y facilitar la navegación hacia cada cliente.

### Objetivos concretos

- Centralizar clientes y prospectos en una única base de datos.
- Mostrar los clientes en un mapa con marcadores visuales.
- Diferenciar clientes por estado de visita y clasificación comercial.
- Registrar notas e historial de cada cliente.
- Crear tareas y recordatorios vinculados a clientes.
- Abrir rutas en Google Maps desde la ubicación actual.
- Permitir filtros por estado, prioridad, zona y tipo de cliente.
- Preparar la arquitectura para futuras integraciones con calendario, audio, IA y backoffice.

---

## 4. Usuarios y roles

### 4.1 Comercial principal

Usuario principal de la aplicación. Usa el sistema desde el móvil para consultar clientes, visitar, dejar notas, cambiar estados, crear recordatorios y abrir rutas.

### 4.2 Administrador

Usuario con permisos para gestionar configuración, estados, categorías, usuarios y datos maestros.

### 4.3 Backoffice o asistente remoto

Rol previsto para una fase posterior. Podrá organizar citas, revisar clientes pendientes, preparar rutas y ayudar al comercial desde distancia.

### 4.4 Cliente final o comprador

No se considera usuario directo de esta aplicación en la primera fase. El sistema está orientado a uso interno comercial, no a venta pública.

---

## 5. Alcance funcional por fases

### 5.1 Fase 1 - MVP operativo comercial

La primera fase debe resolver el núcleo de la necesidad. Debe ser una versión usable por el comercial en su día a día.

Incluye:

- Acceso de usuario.
- Alta, edición y consulta de clientes.
- Importación inicial de clientes desde Excel o CSV.
- Geolocalización de clientes mediante dirección o coordenadas.
- Vista de mapa con marcadores.
- Estados visuales por color o icono.
- Clasificación ABC de clientes.
- Ficha de cliente.
- Historial de notas.
- Registro de visitas.
- Listado de clientes pendientes.
- Filtros por estado, categoría y zona.
- Botón para abrir ruta en Google Maps.
- Recordatorios internos básicos.
- Gestión básica de prospectos.

### 5.2 Fase 2 - Automatización e integraciones

Incluye funcionalidades de mayor complejidad técnica que mejoran productividad, pero no son imprescindibles para validar el producto.

Incluye:

- Transcripción de audio a texto para notas.
- Integración con Google Calendar o Microsoft Outlook.
- Notificaciones push.
- Alertas por proximidad GPS.
- Panel de backoffice para asistente remoto.
- Sincronización más avanzada entre dispositivos.
- Modo offline parcial para consulta y notas.

### 5.3 Fase 3 - Inteligencia comercial y optimización

Incluye funcionalidades avanzadas orientadas a eficiencia, análisis y escalado.

Incluye:

- Rutas inteligentes sugeridas.
- Priorización automática de clientes.
- Recomendaciones de visita por zona, estado y potencial.
- Panel de métricas comerciales.
- Análisis de frecuencia de visitas.
- IA para extraer tareas desde notas.
- Integraciones con ERP, facturación o ventas.

### 5.4 Proyecto futuro independiente - Web o ecommerce para marca propia

La futura web/ecommerce para una marca propia orientada a Estados Unidos queda fuera del alcance actual. Debe tratarse como proyecto independiente cuando la marca, el catálogo, la logística, los precios, el mercado y la estrategia de venta estén definidos.

---

## 6. Fuera de alcance de la primera fase

Queda expresamente fuera de la primera fase:

- Ecommerce.
- Pasarela de pago.
- Catálogo público de productos para venta online.
- Web de captación avanzada.
- Automatización de marketing.
- Integraciones con marcas representadas.
- ERP completo.
- Facturación.
- Gestión de almacén.
- Rutas inteligentes automáticas.
- Geofencing en segundo plano.
- IA que tome decisiones comerciales.
- Transcripción de audio si no se aprueba como módulo adicional.
- Integración bidireccional con calendario si no se aprueba como fase 2.
- App nativa publicada en App Store o Google Play, salvo que se cierre como alcance específico.

---

## 7. Requerimientos funcionales

| ID | Prioridad | Requerimiento | Criterio de aceptación |
|---|---:|---|---|
| RF-01 | P0 | El usuario debe poder iniciar sesión de forma segura. | Solo usuarios autorizados acceden a clientes, notas, mapa y recordatorios. |
| RF-02 | P0 | El sistema debe permitir crear, editar, eliminar y consultar clientes. | Un cliente puede guardarse con nombre, dirección, contacto, teléfono, email, estado, categoría y notas. |
| RF-03 | P0 | El sistema debe permitir importar clientes desde Excel o CSV. | Tras la importación, los clientes aparecen en el listado y pueden geolocalizarse. |
| RF-04 | P0 | El sistema debe mostrar clientes en un mapa. | Al abrir la vista de mapa se muestran marcadores de los clientes con coordenadas válidas. |
| RF-05 | P0 | El sistema debe permitir asignar coordenadas a clientes mediante dirección o coordenadas manuales. | Un cliente con dirección válida queda ubicado en el mapa; si falla, queda marcado como pendiente de geolocalización. |
| RF-06 | P0 | El usuario debe poder cambiar el estado de visita de un cliente. | Al marcar un cliente como visitado, pendiente, seguimiento o inactivo, el cambio se guarda y se refleja visualmente. |
| RF-07 | P0 | El sistema debe representar estados mediante colores o iconos. | El mapa y el listado muestran el color/icono correspondiente al estado configurado. |
| RF-08 | P0 | El sistema debe permitir clasificar clientes por categoría ABC. | El usuario puede marcar clientes como A, B o C sin perder el estado de visita. |
| RF-09 | P0 | El sistema debe diferenciar estado de visita y categoría comercial. | Un cliente puede ser “Visitado” y a la vez “Cliente A”, sin mezclar ambos conceptos. |
| RF-10 | P0 | El usuario debe poder consultar una ficha completa de cliente. | Desde mapa o listado se abre una ficha con datos, estado, categoría, notas, visitas y recordatorios. |
| RF-11 | P0 | El usuario debe poder añadir notas a un cliente. | Cada nota queda guardada con fecha, hora y usuario, y aparece en el historial cronológico. |
| RF-12 | P0 | El usuario debe poder registrar una visita. | Una visita queda asociada a cliente, fecha, resultado, nota y próxima acción opcional. |
| RF-13 | P0 | El usuario debe poder ver clientes pendientes de visitar. | Existe una vista o filtro que muestra únicamente clientes pendientes o con seguimiento abierto. |
| RF-14 | P0 | El usuario debe poder filtrar clientes por estado, categoría y zona. | Los filtros actualizan listado y mapa sin perder coherencia de datos. |
| RF-15 | P0 | El usuario debe poder abrir la ruta hacia un cliente en Google Maps. | Al pulsar “Ir” se abre Google Maps con destino configurado desde la ubicación actual del usuario. |
| RF-16 | P0 | El usuario debe poder crear recordatorios básicos asociados a cliente. | Un recordatorio aparece vinculado al cliente y puede marcarse como pendiente o completado. |
| RF-17 | P1 | El sistema debe permitir gestionar prospectos o posibles clientes. | Un prospecto puede crearse, ubicarse en mapa, recibir notas y convertirse en cliente. |
| RF-18 | P1 | El sistema debe mostrar clientes cercanos a la ubicación actual. | Al permitir ubicación, se puede ordenar o filtrar por cercanía aproximada. |
| RF-19 | P1 | El sistema debe permitir configurar colores o iconos de estado. | El administrador puede definir la leyenda visual usada en mapa y listado. |
| RF-20 | P2 | El sistema debe convertir audio a texto para notas. | Una nota grabada desde micrófono se transcribe y queda editable antes de guardarse. |
| RF-21 | P2 | El sistema debe integrarse con calendario. | Un recordatorio o cita puede crearse en calendario externo cuando el usuario lo confirme. |
| RF-22 | P2 | El sistema debe emitir avisos por proximidad. | Si el usuario entra en una zona cercana a clientes pendientes, recibe una alerta conforme a permisos y configuración. |
| RF-23 | P2 | El sistema debe permitir acceso de backoffice. | Un usuario autorizado puede programar citas o preparar rutas para el comercial. |
| RF-24 | P3 | El sistema debe sugerir rutas inteligentes. | La aplicación propone una ruta en función de ubicación, clientes pendientes y prioridad comercial. |
| RF-25 | P3 | El sistema debe usar IA para detectar tareas en notas. | El sistema sugiere recordatorios a partir de frases como “volver la semana que viene”, siempre con confirmación del usuario. |

### Leyenda de prioridad

- **P0:** imprescindible para primera entrega.
- **P1:** recomendable para una primera versión sólida, pero negociable.
- **P2:** segunda fase o módulo adicional.
- **P3:** evolución avanzada.

---

## 8. Requerimientos no funcionales

| ID | Categoría | Requerimiento | Criterio de aceptación |
|---|---|---|---|
| RNF-01 | Usabilidad | La aplicación debe estar pensada para uso móvil en calle. | Las acciones principales se hacen con pocos clics y botones visibles. |
| RNF-02 | Rendimiento | Mapa y listado deben cargar de forma fluida con la cartera inicial de clientes. | El usuario puede consultar mapa y filtros sin esperas excesivas en condiciones normales. |
| RNF-03 | Seguridad | Los datos de clientes deben estar protegidos por autenticación y permisos. | Un usuario no autenticado no puede acceder a información comercial. |
| RNF-04 | Privacidad | El sistema debe tratar datos personales conforme a RGPD. | Los datos de contacto, notas y ubicación se almacenan con control de acceso y finalidad clara. |
| RNF-05 | Trazabilidad | Cambios relevantes deben quedar registrados. | El sistema conserva fecha y usuario en notas, visitas y cambios de estado. |
| RNF-06 | Escalabilidad | La arquitectura debe permitir añadir calendario, audio, IA y backoffice después. | El MVP no debe bloquear futuras integraciones. |
| RNF-07 | Compatibilidad | Debe funcionar correctamente desde móvil. | La versión inicial debe ser responsive o PWA, salvo decisión de app nativa. |
| RNF-08 | Disponibilidad | El sistema debe evitar pérdida de notas ante cortes puntuales. | Si se pierde conexión durante edición, el usuario no debe perder el texto escrito. |
| RNF-09 | Mantenibilidad | El código debe separar CRM, mapa, notas, rutas y usuarios. | La solución no debe quedar como una pantalla monolítica difícil de ampliar. |
| RNF-10 | Integraciones | Las integraciones externas deben ser desacopladas. | Fallos en Google Maps, calendario o transcripción no deben romper el CRM principal. |

---

## 9. Modelo de datos mínimo recomendado

### 9.1 Cliente

Campos mínimos:

- ID interno.
- Nombre comercial.
- Razón social, si aplica.
- Persona de contacto.
- Teléfono.
- Email.
- Dirección.
- Localidad.
- Provincia.
- Código postal.
- Latitud.
- Longitud.
- Estado de visita.
- Categoría ABC.
- Tipo: cliente o prospecto.
- Fecha de última visita.
- Fecha de próxima acción.
- Observaciones generales.
- Activo/inactivo.

### 9.2 Estado de visita

Campos mínimos:

- ID.
- Nombre del estado.
- Color.
- Icono.
- Orden.
- Si cuenta como pendiente o cerrado.

Estados iniciales recomendados:

- Pendiente de visitar.
- Visitado.
- Seguimiento pendiente.
- Revisitar.
- Inactivo.

### 9.3 Categoría comercial ABC

Campos mínimos:

- ID.
- Nombre: A, B o C.
- Descripción.
- Prioridad.

Definición recomendada:

- **A:** cliente de alta prioridad o alto volumen.
- **B:** cliente de prioridad media.
- **C:** cliente de baja compra, baja actividad o mantenimiento.

### 9.4 Nota

Campos mínimos:

- ID.
- Cliente asociado.
- Usuario autor.
- Texto.
- Fecha y hora.
- Origen: manual, audio transcrito o importación.
- Audio asociado, si aplica en fase posterior.

### 9.5 Visita

Campos mínimos:

- ID.
- Cliente asociado.
- Usuario comercial.
- Fecha y hora.
- Resultado de la visita.
- Nota asociada.
- Próxima acción.
- Estado posterior del cliente.

### 9.6 Recordatorio o tarea

Campos mínimos:

- ID.
- Cliente asociado.
- Título.
- Descripción.
- Fecha prevista.
- Estado: pendiente, completado, cancelado.
- Usuario responsable.
- Origen: manual, calendario o IA.

### 9.7 Usuario

Campos mínimos:

- ID.
- Nombre.
- Email.
- Rol.
- Estado activo/inactivo.
- Fecha de último acceso.

---

## 10. Criterios de aceptación por módulo

### 10.1 Mapa de clientes

**Given** que existen clientes con coordenadas válidas  
**When** el usuario abre la vista de mapa  
**Then** el sistema muestra un marcador por cada cliente localizado  
**And** el color o icono representa su estado actual.

**Given** que un cliente no tiene coordenadas válidas  
**When** se carga el mapa  
**Then** el cliente no debe aparecer mal ubicado  
**And** debe mostrarse como pendiente de geolocalización en un listado de revisión.

### 10.2 Cambio de estado por color o icono

**Given** que el usuario está en la ficha de un cliente o en el mapa  
**When** cambia el estado de visita  
**Then** el sistema guarda el nuevo estado  
**And** actualiza el marcador, el listado y la ficha del cliente.

**Given** que el usuario cambia la categoría ABC  
**When** guarda el cambio  
**Then** el sistema actualiza la prioridad comercial  
**And** no modifica por error el estado de visita.

### 10.3 Listado de pendientes

**Given** que existen clientes pendientes de visitar  
**When** el usuario abre la vista de pendientes  
**Then** el sistema muestra únicamente clientes pendientes, en seguimiento o por revisar  
**And** permite abrir su ficha o ruta.

### 10.4 Ficha de cliente y notas

**Given** que el usuario abre la ficha de un cliente  
**When** añade una nota  
**Then** la nota queda guardada en el historial  
**And** se muestra con fecha, hora y usuario.

**Given** que un cliente tiene varias notas  
**When** el usuario consulta el historial  
**Then** las notas aparecen ordenadas cronológicamente  
**And** no se sobrescriben notas anteriores.

### 10.5 Registro de visitas

**Given** que el usuario ha visitado un cliente  
**When** registra la visita  
**Then** el sistema guarda fecha, resultado, nota y próxima acción  
**And** actualiza la fecha de última visita.

### 10.6 Rutas con Google Maps

**Given** que el cliente tiene ubicación válida  
**When** el usuario pulsa el botón “Ir”  
**Then** el sistema abre Google Maps o la app de navegación configurada  
**And** el destino aparece cargado automáticamente.

**Given** que el cliente no tiene ubicación válida  
**When** el usuario intenta iniciar ruta  
**Then** el sistema bloquea la acción  
**And** muestra un aviso indicando que falta dirección o coordenadas.

### 10.7 Recordatorios

**Given** que el usuario crea un recordatorio vinculado a cliente  
**When** guarda la tarea  
**Then** el recordatorio aparece en la ficha del cliente  
**And** también aparece en la vista de próximos pendientes.

### 10.8 Prospectos

**Given** que el usuario encuentra un posible nuevo cliente  
**When** crea un prospecto  
**Then** el sistema lo guarda como prospecto  
**And** permite añadir dirección, notas, estado y próxima acción.

**Given** que un prospecto empieza a trabajar con el comercial  
**When** el usuario lo convierte en cliente  
**Then** el historial de notas y visitas se conserva.

### 10.9 Backoffice futuro

**Given** que existe un usuario backoffice autorizado  
**When** crea una cita o tarea para el comercial  
**Then** el comercial la ve en su panel  
**And** puede aceptarla, modificarla o marcarla como completada.

---

## 11. Casos de error y comportamiento esperado

| Caso | Resultado esperado |
|---|---|
| Cliente sin nombre | No se permite guardar y se muestra el campo obligatorio. |
| Cliente sin dirección ni coordenadas | Se guarda como cliente no geolocalizado y no aparece en mapa hasta corregirse. |
| Dirección no encontrada | Se informa del fallo y se permite introducir coordenadas manuales. |
| Permiso de ubicación denegado | El mapa sigue funcionando, pero no se calcula cercanía desde ubicación actual. |
| Fallo al abrir Google Maps | Se muestra la dirección copiable y un mensaje de error controlado. |
| Nota sin conexión | La nota se conserva localmente hasta poder sincronizar, si se implementa modo offline. |
| Duplicado en importación | El sistema avisa de posible duplicado por nombre, teléfono o dirección. |
| Usuario sin permisos | Se bloquea la acción y se muestra mensaje claro. |
| Cambio de estado accidental | El sistema debe permitir corregir el estado y conservar trazabilidad. |
| Integración externa caída | El CRM principal sigue funcionando aunque calendario, mapas o audio fallen. |
| Audio no transcrito | Se conserva el audio o se permite guardar una nota manual alternativa. |
| Recordatorio vencido | Aparece como pendiente vencido hasta que el usuario lo complete o reprograme. |

---

## 12. Reglas de negocio

1. Un cliente puede tener muchas notas.
2. Un cliente puede tener muchas visitas.
3. Un cliente solo debe tener un estado de visita activo a la vez.
4. La categoría ABC es independiente del estado de visita.
5. Un cliente puede pasar de prospecto a cliente sin perder historial.
6. Una nota no debe sobrescribir otra nota anterior.
7. Una visita puede generar una próxima acción o recordatorio.
8. Un cliente sin ubicación válida no debe mostrarse en una posición inventada del mapa.
9. Los colores deben tener una leyenda visible para evitar confusión.
10. Las acciones automáticas propuestas por IA o calendario deben requerir confirmación del usuario en fases iniciales.

---

## 13. Decisiones técnicas recomendadas

### 13.1 Tipo de aplicación

Para primera fase se recomienda una aplicación web responsive o PWA antes que una app nativa completa.

Motivo:

- Menor coste inicial.
- Más rápida de desarrollar.
- Funciona en móvil y escritorio.
- Facilita un futuro panel de backoffice.
- Permite validar el producto antes de publicar en tiendas.

Una app nativa puede valorarse después si se necesitan notificaciones avanzadas, geofencing en segundo plano, offline completo o integración profunda con el dispositivo.

### 13.2 Mapa

Opciones posibles:

- Google Maps Platform.
- Mapbox.
- Leaflet/OpenStreetMap.

Para una primera fase, Google Maps es la opción más familiar para el usuario y encaja con el requisito de abrir rutas directamente.

### 13.3 Backend y base de datos

Se recomienda arquitectura con backend y base de datos propia, no depender solo de hojas de cálculo.

Componentes recomendados:

- Backend API.
- Base de datos relacional.
- Autenticación.
- Servicio de geocodificación.
- Módulo de clientes.
- Módulo de notas.
- Módulo de visitas.
- Módulo de tareas.
- Módulo de mapa/rutas.

### 13.4 Integraciones externas

Las integraciones con mapas, calendario, transcripción e IA deben encapsularse en servicios separados. Así, si una integración falla o cambia precios/API, no rompe el núcleo del CRM.

---

## 14. Visión del Project Manager

### 14.1 Prioridad real

El foco no debe ponerse inicialmente en IA, audio o rutas automáticas. El foco debe ser que el comercial pueda trabajar mejor desde el día uno.

Prioridad correcta:

1. Datos de clientes limpios.
2. Mapa usable.
3. Estados por color.
4. Notas e historial.
5. Pendientes y recordatorios.
6. Ruta a Google Maps.
7. Prospectos.

### 14.2 Riesgo de alcance

El proyecto puede crecer demasiado si se mezcla CRM, app móvil nativa, IA, calendario, geofencing, ecommerce y backoffice en una misma primera entrega.

Recomendación:

- Cerrar un MVP concreto.
- Validarlo con datos reales.
- Medir uso real en calle.
- Añadir automatizaciones después.

### 14.3 Entregables recomendados para propuesta

- Documento de alcance funcional.
- Diseño de pantallas clave.
- Modelo de datos.
- Estimación por fases.
- Presupuesto del MVP.
- Presupuesto opcional de módulos fase 2.

---

## 15. Visión del desarrollador senior

### 15.1 Riesgos técnicos principales

- Geocodificación incorrecta de direcciones.
- Costes o límites de APIs de mapas.
- Permisos de ubicación en móvil.
- Geofencing fiable en segundo plano.
- Sincronización offline.
- Duplicados de clientes al importar.
- Mezcla confusa entre estado de visita y categoría ABC.
- Notas de audio con baja precisión si hay ruido en calle.
- Integración de calendario con conflictos de agenda.

### 15.2 Recomendaciones de implementación

- Separar estado de visita y categoría ABC desde el modelo de datos.
- Crear una leyenda visual clara de colores.
- No hacer geofencing en MVP; empezar con “clientes cercanos” bajo demanda.
- No automatizar citas sin confirmación del usuario.
- Guardar todas las notas con histórico inmutable.
- Preparar importación con detección de duplicados.
- Crear un módulo de “clientes sin geolocalizar”.
- Usar PWA/responsive para validar antes de app nativa.
- Diseñar servicios externos desacoplados.

---

## 16. Devil's Advocate

Esta sección recoge puntos críticos que conviene decir claramente antes de vender o presupuestar el proyecto.

### 16.1 No es Zoho completo

Aunque el cliente menciona Zoho como referencia, no conviene prometer un Zoho a medida en una primera fase. Zoho es una suite completa. Lo que el cliente realmente necesita es un CRM comercial de campo con mapa y seguimiento de visitas.

### 16.2 El mapa no sirve si los datos están sucios

Si las direcciones de clientes están incompletas, mal escritas o duplicadas, el mapa dará problemas. Antes de desarrollar funcionalidades avanzadas hay que preparar importación, limpieza y validación de datos.

### 16.3 Los colores pueden confundir

El cliente quiere colores para muchas cosas: visitado, pendiente, ABC, compra alta, compra baja, seguimiento. Si todo se representa solo con colores, el sistema será confuso. Hay que separar:

- Color/icono principal: estado de visita.
- Etiqueta o badge secundario: categoría ABC.

### 16.4 Geofencing puede encarecer y complicar

Avisar automáticamente cuando el comercial pase cerca de un cliente suena muy útil, pero implica permisos, consumo de batería, funcionamiento en segundo plano y posibles limitaciones del sistema operativo. Es mejor empezar con una función bajo demanda: “ver clientes cercanos”.

### 16.5 IA y audio no deben ser el núcleo del MVP

La transcripción de audio y la detección automática de tareas son útiles, pero no deben bloquear la primera entrega. Primero hay que validar que el CRM, mapa, notas y recordatorios manuales funcionan bien.

### 16.6 Ecommerce fuera de foco

El cliente ha dejado claro que la web actual es una tarjeta de presentación y que no busca vender online ahora. Meter ecommerce en este proyecto sería desviarse del problema real.

### 16.7 Backoffice futuro, no primera necesidad

El cliente prevé que en el futuro alguien pueda gestionarle citas o rutas, pero actualmente la calle la llevará él. Por tanto, el sistema debe estar preparado para multiusuario, pero el panel de backoffice completo puede ir en fase posterior.

---

## 17. Checklist de validación del MVP

La primera fase se considerará válida cuando se cumpla lo siguiente:

- [ ] El usuario puede iniciar sesión.
- [ ] El usuario puede importar o crear clientes.
- [ ] Los clientes pueden tener dirección y coordenadas.
- [ ] Los clientes con coordenadas aparecen en el mapa.
- [ ] Los clientes sin coordenadas quedan identificados para revisión.
- [ ] El usuario puede cambiar estado de visita.
- [ ] El marcador cambia de color/icono según estado.
- [ ] El usuario puede asignar categoría ABC.
- [ ] Estado y categoría no se mezclan.
- [ ] El usuario puede abrir la ficha del cliente desde el mapa.
- [ ] El usuario puede añadir notas.
- [ ] Las notas se guardan con histórico.
- [ ] El usuario puede registrar visitas.
- [ ] El usuario puede ver clientes pendientes.
- [ ] El usuario puede filtrar por estado, categoría y zona.
- [ ] El usuario puede abrir ruta en Google Maps.
- [ ] El usuario puede crear recordatorios básicos.
- [ ] El usuario puede crear prospectos.
- [ ] Los errores principales están controlados.
- [ ] La solución funciona correctamente desde móvil.

---

## 18. Definition of Done

El proyecto MVP solo se considerará terminado cuando:

- [ ] Todos los requerimientos P0 estén implementados.
- [ ] Los flujos principales funcionen de extremo a extremo.
- [ ] El cliente pueda usar la aplicación desde móvil en un caso real de visita.
- [ ] El mapa muestre correctamente clientes geolocalizados.
- [ ] Los estados visuales estén correctamente definidos.
- [ ] Las categorías ABC funcionen separadas del estado de visita.
- [ ] Las notas e historial no se pierdan ni se sobrescriban.
- [ ] Los recordatorios básicos estén vinculados a clientes.
- [ ] Google Maps pueda abrir ruta hacia un cliente válido.
- [ ] Los clientes sin ubicación estén controlados.
- [ ] Exista control de acceso por usuario.
- [ ] No existan errores críticos conocidos sin documentar.
- [ ] La documentación funcional esté actualizada.
- [ ] La base técnica permita abordar fase 2 sin rehacer el sistema desde cero.

---

## 19. Preguntas necesarias para cerrar presupuesto

Antes de cerrar alcance económico y planificación, conviene confirmar:

1. ¿Cuántos clientes iniciales se van a importar?
2. ¿Los clientes están actualmente en Excel, CRM, agenda, móvil u otra fuente?
3. ¿Las direcciones están completas y normalizadas?
4. ¿El cliente usará solo móvil o también ordenador?
5. ¿Se necesita que funcione sin conexión desde la primera fase?
6. ¿Cuántos usuarios usarán la aplicación al inicio?
7. ¿Se requiere panel de backoffice desde el primer día o solo preparado a futuro?
8. ¿Qué estados exactos quiere usar el cliente?
9. ¿Qué significado comercial tendrá A, B y C?
10. ¿Quiere importar histórico de notas o empezar desde cero?
11. ¿Necesita integración real con Google Calendar en fase 1 o puede ser fase 2?
12. ¿La transcripción de audio es imprescindible o deseable?
13. ¿El aviso por proximidad debe ser automático o basta con ver clientes cercanos manualmente?
14. ¿Debe existir app nativa o es suficiente una PWA/responsive?
15. ¿Qué nivel de seguridad y copias de seguridad se requiere?

---

## 20. Recomendación final

La propuesta más sólida es vender una primera fase clara y funcional:

**CRM comercial geolocalizado con mapa, clientes, estados por color, categorías ABC, notas, visitas, recordatorios y rutas a Google Maps.**

Esta fase resuelve la necesidad principal del cliente sin inflar innecesariamente el proyecto. Después, sobre una base ya validada, se pueden añadir módulos avanzados como audio, calendario, geofencing, IA, rutas inteligentes y backoffice.

El éxito del proyecto no dependerá de parecerse a Zoho en número de funcionalidades, sino de resolver muy bien el caso concreto del cliente: gestionar mejor sus visitas comerciales en la calle.
