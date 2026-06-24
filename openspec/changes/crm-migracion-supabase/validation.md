# Validación — crm-migracion-supabase

> **Regla de OK:** una tarea solo se marca `[x]` cuando su **test** pasa en verde.
> Cada tarea trae: Historia de usuario · Criterios de aceptación (qué se espera, no cómo) ·
> Escenarios Given-When-Then · Test que la valida (el cómo).
> Estado test: 🔴 no escrito · 🟡 escrito/falla · 🟢 verde.

**Convención de tests**
- Back (Vitest): `back/src/**/__tests__/*.test.ts` · `npm run test`
- Front unit (Vitest): `front/lib/**/__tests__/*.test.ts` · `npm run test`
- Front e2e (Playwright): `front/tests/*.spec.ts` · `npm run test:e2e`
- Smoke real (BD/red): `psql`/`curl` documentado — gate humano.

---

## Fase 0 — Prerrequisitos (humano)

### 0.1 Credenciales del Supabase compartido
**Historia:** Como responsable del proyecto quiero las credenciales del Supabase compartido para que back y front puedan autenticar y leer datos.
**Criterios de aceptación:**
- Están disponibles `URL`, `anon key` y `service_role key`.
- Las credenciales son válidas (el proyecto responde).
- Si alguna falta o es inválida → no se avanza a Fase 1.

```gherkin
Escenario: las credenciales responden
  Dado el endpoint de salud del proyecto Supabase
  Cuando consulto su estado
  Entonces responde 200
```
**Test/validación:** `curl ${SUPABASE_URL}/auth/v1/health` → 200. — [ ] OK

### 0.2 DATABASE_URL con schema crm
**Historia:** Como migrador quiero un `DATABASE_URL` que apunte al schema `crm` para que Prisma opere en el espacio correcto.
**Criterios de aceptación:**
- La conexión abre sin error.
- El `search_path` resuelve `crm`.

```gherkin
Escenario: la conexión apunta a crm
  Dado el DATABASE_URL de Supabase con "?schema=crm"
  Cuando abro una conexión
  Entonces el search_path incluye "crm"
```
**Test/validación:** `psql "$DATABASE_URL" -c "show search_path"`. — [ ] OK

### 0.3 Decisión sobre datos vivos en docker
**Historia:** Como responsable quiero decidir si hay datos reales en docker para saber si toca migrarlos o arrancar limpio.
**Criterios de aceptación:**
- Queda registrada la decisión: "migrar" o "limpio".
- Si "migrar" → activa la tarea 4.2; si "limpio" → 4.2 se marca N/A.

```gherkin
Escenario: decisión registrada
  Dado el estado actual del Postgres docker
  Cuando reviso si contiene datos de negocio
  Entonces registro "migrar" o "limpio" en tasks.md 0.3
```
**Test/validación:** nota explícita en `tasks.md` 0.3. — [x] OK (2026-06-19: docker con 5 schemas tenant VACÍOS + public solo metadata → decisión "limpio"; 4.2 N/A).

### 0.4 Es el mismo Supabase que AA
**Historia:** Como arquitecto quiero confirmar que es el Supabase de AA para cumplir el plan "1 Supabase, schemas aa/crm".
**Criterios de aceptación:**
- El `project ref` coincide con el de AA.

```gherkin
Escenario: mismo proyecto que AA
  Dado el SUPABASE_URL del CRM y el de AA
  Cuando comparo su project ref
  Entonces son idénticos
```
**Test/validación:** comparación manual de `SUPABASE_URL`. — [ ] OK

---

## Fase 1 — Esquema crm en Supabase

### 1.1 Migración Prisma aditiva
**Historia:** Como migrador quiero aplicar el esquema CRM sin destruir nada de AA para no romper el otro producto del Supabase compartido.
**Criterios de aceptación:**
- Tras migrar, existen las tablas del CRM en el schema `crm`.
- La migración no elimina ningún objeto del schema `aa`.
- Caso error: si la migración intenta un `DROP` sobre `aa` → se rechaza y no se aplica.

```gherkin
Escenario: migración no destruye aa
  Dado el SQL de migración generado para el schema crm
  Cuando reviso su contenido
  Entonces no contiene DROP TABLE ni DROP SCHEMA sobre objetos de aa
```
**Test:** 🔴 `back/src/__tests__/migration-additive.test.ts` · `npm run test -- migration-additive`. — [ ] OK

### 1.2 Seed Business + Membership
**Historia:** Como administrador quiero un negocio y mi membresía sembrados para poder entrar y ver datos desde el primer arranque.
**Criterios de aceptación:**
- Existe al menos un `Business`.
- Existe un `Membership` que enlaza mi usuario con ese negocio.
- Campos que retorna el seed: `business.id`, `membership.userId`, `membership.businessId`, `membership.role`.

```gherkin
Escenario: seed deja un negocio y una membresía
  Dado una base crm vacía
  Cuando ejecuto el seed
  Entonces hay 1 o más Business
  Y existe un Membership con mi userId
```
**Test:** 🔴 `back/src/__tests__/seed.test.ts` · `npm run test -- seed`. — [ ] OK

### 1.3 Conexión lee crm
**Historia:** Como migrador quiero comprobar que la app lee del schema `crm` en Supabase para confirmar el cableado de datos.
**Criterios de aceptación:**
- Una consulta simple devuelve resultados (array, sin error).

```gherkin
Escenario: lectura básica de crm
  Dado Prisma conectado a Supabase (schema crm)
  Cuando consulto la tabla de negocios
  Entonces recibo un array sin error
```
**Test:** 🔴 `back/src/__tests__/db-connection.test.ts` · `npm run test -- db-connection`. — [ ] OK

---

## Fase 2 — Back a Supabase

### 2.1 / 2.2 Arranque fail-closed con secretos reales
**Historia:** Como responsable de seguridad quiero que el back no arranque con secretos de prueba para evitar exponer un entorno sin auth real.
**Criterios de aceptación:**
- Con `SUPABASE_URL` placeholder → el arranque falla con error claro.
- Con secretos reales → arranca normal.
- Caso error: mensaje indica qué variable falta.

```gherkin
Escenario: bloqueo con placeholder
  Dado SUPABASE_URL con valor placeholder
  Cuando inicio el back
  Entonces lanza error y no acepta peticiones

Escenario: arranque con secretos reales
  Dado SUPABASE_URL y SERVICE_ROLE_KEY reales
  Cuando inicio el back
  Entonces arranca y acepta peticiones
```
**Test:** 🟡 `back/src/lib/__tests__/auth.test.ts` (assertAuthSecrets) + 🔴 `back/src/__tests__/boot.test.ts` · `npm run test -- auth boot`. — [ ] OK

### 2.3 CRUD protegido por token Supabase
**Historia:** Como operador del CRM quiero que solo usuarios autenticados accedan a los datos para proteger la información del negocio.
**Criterios de aceptación:**
- Con token válido → `GET /api/customers` devuelve 200 y la lista del negocio.
- Sin token o token inválido/expirado → 401.
- Token de otro negocio sin membresía → 403.
- Campos que retorna: lista de `customer` con los campos del módulo (sin datos de otros negocios).

```gherkin
Escenario: acceso con token válido
  Dado un access_token de Supabase válido con membresía
  Cuando llamo GET /api/customers
  Entonces recibo 200 y solo clientes de mi negocio

Escenario: rechazo sin token válido
  Dado un token inválido o ausente
  Cuando llamo GET /api/customers
  Entonces recibo 401
```
**Test:** 🟡 `back/src/routes/__tests__/customers-auth.e2e.test.ts` · `npm run test -- customers-auth`. — [ ] OK

### 2.4 Suite back verde
**Historia:** Como equipo quiero la suite del back en verde para no introducir regresiones con la migración.
**Criterios de aceptación:**
- Todos los tests del back pasan.

```gherkin
Escenario: regresión back
  Dado el código del back migrado
  Cuando ejecuto la suite
  Entonces todos los tests pasan
```
**Test:** toda la suite · `npm run test`. — [ ] OK

---

## Fase 3 — Front a REST

### 3.1 Selección de backend por entorno
**Historia:** Como operador quiero que la app use el servidor real cuando está configurado para no trabajar sobre datos locales de prueba.
**Criterios de aceptación:**
- Con `NEXT_PUBLIC_API_URL` seteada → la app usa el backend REST.
- Sin ella → mantiene el modo local (regresión segura).

```gherkin
Escenario: backend REST activo
  Dado NEXT_PUBLIC_API_URL configurada
  Cuando la app resuelve su backend
  Entonces usa el backend REST (apiBackend)

Escenario: modo local sin configuración
  Dado NEXT_PUBLIC_API_URL ausente
  Cuando la app resuelve su backend
  Entonces usa el backend local
```
**Test:** 🔴 `front/lib/data/__tests__/get-backend.test.ts` · `npm run test -- get-backend`. — [ ] OK

### 3.2 Login no se congela
**Historia:** Como usuario quiero iniciar sesión sin que la pantalla se quede congelada en "Entrando..." para poder acceder al panel.
**Criterios de aceptación:**
- El login resuelve aunque haya una sesión previa guardada en el navegador.
- El comportamiento es igual en navegador normal y en incógnito.
- Caso error: credenciales incorrectas → mensaje de error, no congelado.

```gherkin
Escenario: login con sesión previa
  Dado un navegador con sesión Supabase guardada
  Cuando inicio sesión
  Entonces accedo sin quedar congelado en "Entrando..."

Escenario: el callback de sesión no se bloquea
  Dado el hook de auth del front
  Cuando cambia el estado de sesión
  Entonces no se llama a Supabase de forma síncrona dentro del callback
```
**Test:** 🔴 `front/lib/auth/__tests__/auth-callback.test.ts` · `npm run test -- auth-callback`. — [ ] OK

### 3.3 Cada petición lleva identidad y negocio
**Historia:** Como operador quiero que mis peticiones identifiquen quién soy y en qué negocio trabajo para ver y tocar solo mis datos.
**Criterios de aceptación:**
- Cada petición de datos incluye el token de sesión.
- Cada petición incluye el identificador del negocio activo.
- Caso error: sin negocio activo → no se envía el header y el back responde 403.

```gherkin
Escenario: cabeceras de identidad
  Dado una sesión activa y un negocio seleccionado
  Cuando el front pide datos al back
  Entonces la petición lleva el token de sesión
  Y lleva el identificador del negocio activo
```
**Test:** 🟡 `front/lib/api/__tests__/client.test.ts` · `npm run test -- api/client`. — [ ] OK

### 3.4 Datos vienen del servidor, no del navegador
**Historia:** Como operador quiero que los datos que veo vengan del servidor para que sean los reales y compartidos, no copias locales.
**Criterios de aceptación:**
- Al abrir un módulo, la lista se pide al servidor.
- El navegador no guarda los datos de negocio localmente.

```gherkin
Escenario: lista desde el servidor
  Dado un usuario autenticado
  Cuando abro el listado de clientes
  Entonces los datos se piden al servidor
  Y el navegador no almacena esos datos localmente
```
**Test:** 🔴 `front/tests/login-data.spec.ts` (Playwright) · `npm run test:e2e -- login-data`. — [ ] OK

### 3.5 Suite front verde
**Historia:** Como equipo quiero la suite del front en verde para asegurar que la migración no rompe la UI.
**Criterios de aceptación:** todos los tests del front (unit + e2e) pasan.

```gherkin
Escenario: regresión front
  Dado el front migrado
  Cuando ejecuto unit y e2e
  Entonces todos los tests pasan
```
**Test:** `npm run test && npm run test:e2e`. — [ ] OK

---

## Fase 4 — Retirar acoplamiento docker (DESTRUCTIVA — OK humano)

### 4.1 Alta de negocio sin schema dinámico
**Historia:** Como administrador quiero dar de alta un negocio nuevo de forma simple para empezar a operar sin infraestructura extra por proyecto.
**Criterios de aceptación:**
- Crear un negocio nuevo genera su registro y mi membresía.
- No se crea ningún espacio de base de datos separado por proyecto.
- Caso error: alta duplicada del mismo negocio → no crea otro, responde conflicto.

```gherkin
Escenario: alta row-level
  Dado un proyecto/negocio nuevo
  Cuando lo provisiono
  Entonces se crea su registro de negocio y mi membresía
  Pero no se crea ningún schema de base de datos dinámico
```
**Test:** 🔴 `front/app/api/projects/__tests__/provision.test.ts` · `npm run test -- provision`. — [ ] OK

### 4.2 Migración de datos vivos
**Historia:** Como responsable quiero conservar los datos existentes al migrar para no perder información de los negocios en marcha.
**Criterios de aceptación:**
- Cada dato migrado conserva a qué negocio pertenece.
- El número de registros origen y destino coincide por tabla.
- Si la decisión 0.3 fue "limpio" → N/A documentado.

```gherkin
Escenario: datos migrados íntegros
  Dado datos en el almacenamiento anterior
  Cuando ejecuto la migración
  Entonces cada registro queda asociado a su negocio
  Y los conteos por tabla coinciden origen/destino
```
**Test:** 🔴 `back/src/__tests__/data-migration.test.ts` · `npm run test -- data-migration`. — [ ] OK (o N/A)

### 4.3 Generación IA sin base local
**Historia:** Como operador quiero que la generación con IA no dependa de la base local para que funcione en el entorno migrado.
**Criterios de aceptación:**
- La función de generación opera sin conexión a la base de datos local.

```gherkin
Escenario: IA sin base local
  Dado el entorno migrado
  Cuando ejecuto una generación con IA
  Entonces no se abre ninguna conexión a la base de datos local
```
**Test:** 🔴 `front/app/api/ai/__tests__/generate-no-pool.test.ts` · `npm run test -- generate-no-pool`. — [ ] OK

### 4.4 Selector de clientes autenticado por token
**Historia:** Como operador quiero seleccionar clientes de forma segura para que solo se muestren con mi sesión válida.
**Criterios de aceptación:**
- La carga de clientes usa el token de sesión, no cookies.
- Caso error: sin sesión → no devuelve datos.

```gherkin
Escenario: clientes por token
  Dado una sesión válida
  Cuando cargo el selector de clientes
  Entonces la petición se autentica con el token de sesión
  Pero no usa cookies
```
**Test:** 🔴 `front/app/api/clients/__tests__/clients-bearer.test.ts` · `npm run test -- clients-bearer`. — [ ] OK

### 4.5 Sin pool a la base local
**Historia:** Como migrador quiero eliminar el acceso a la base local para que el CRM dependa solo de Supabase.
**Criterios de aceptación:**
- No quedan usos del pool a la base local en el código.

```gherkin
Escenario: pool local retirado
  Dado el código migrado
  Cuando busco referencias al pool de la base local
  Entonces no existe ninguna
```
**Test:** 🔴 `front/tests/no-pg-pool.spec.ts` (check estático) · `npm run test -- no-pg-pool`. — [ ] OK

### 4.6 Entorno de desarrollo sin base local por defecto
**Historia:** Como desarrollador quiero levantar el entorno sin la base local para reflejar que ya no se usa.
**Criterios de aceptación:**
- Al levantar el entorno por defecto, la base local no arranca.

```gherkin
Escenario: compose sin base local
  Dado el entorno de desarrollo por defecto
  Cuando lo levanto
  Entonces el servicio de base de datos local no arranca
```
**Test:** 🔴 `back/src/__tests__/compose-no-dbcrm.test.ts` · `npm run test -- compose-no-dbcrm`. — [ ] OK

---

## Fase 5 — Verificación global y archivo

### 5.1 Flujo completo contra Supabase
**Historia:** Como operador quiero usar el CRM de punta a punta contra el servidor real para confirmar que la migración funciona.
**Criterios de aceptación:**
- Login + crear/editar/borrar en clientes, servicios y citas.
- El dato persiste tras recargar (no era una copia local).

```gherkin
Escenario: CRUD persistente
  Dado un usuario autenticado
  Cuando creo, edito y borro en 3 módulos
  Y recargo la página
  Entonces los cambios persisten desde el servidor
```
**Test:** 🔴 `front/tests/crud-supabase.spec.ts` · `npm run test:e2e -- crud-supabase`. — [ ] OK

### 5.2 Cero dependencia local en el flujo
**Historia:** Como responsable quiero que el flujo no toque la base local ni AA por cookie para confirmar el corte con lo anterior.
**Criterios de aceptación:**
- Durante el flujo, no hay peticiones a la base local.
- No se envían cookies hacia AA.

```gherkin
Escenario: sin acoplamiento local
  Dado el flujo completo de uso
  Cuando lo recorro
  Entonces no hay peticiones a la base local
  Y no se envían cookies de AA
```
**Test:** 🔴 `front/tests/no-local-coupling.spec.ts` · `npm run test:e2e -- no-local-coupling`. — [ ] OK

### 5.3 Suites verde + tipos limpios
**Historia:** Como equipo quiero todo en verde y sin errores de tipos antes de cerrar.
**Criterios de aceptación:** suites back y front pasan; `tsc` sin errores en ambos paquetes.
**Test:** `npm run test` (back y front) `&& npm run test:e2e && tsc --noEmit`. — [ ] OK

### 5.4 Revisión de seguridad
**Historia:** Como responsable de seguridad quiero una revisión del flujo de auth y secretos antes de dar por buena la migración.
**Criterios de aceptación:** 0 hallazgos crítico/alto; `service_role` nunca en el front.
**Validación:** `cybersec:blueteam-coordinator` sobre el flujo Supabase. — [ ] OK

### 5.5 Cierre y archivo
**Historia:** Como equipo quiero registrar y archivar el cambio para cerrar el ciclo.
**Criterios de aceptación:** memoria guardada; scope summary emitido; carpeta movida a `openspec/changes/archive/`.
**Validación:** `mem_save` + mover carpeta. — [ ] OK

---

## Checklist final (antes de pasar a desarrollo de cada tarea)
- [ ] Historia de usuario validada con el stakeholder.
- [ ] Criterios basados en necesidad real (sin desperdicio).
- [ ] Escenarios Given-When-Then confirmados.
- [ ] Campos que se capturan/retornan nombrados (donde aplica).
- [ ] Reglas de negocio y restricciones documentadas (tenancy por negocio, secretos solo en back).
- [ ] Casos de error definidos (401/403/conflicto/sin sesión).
- [ ] Aprobación del usuario antes de desarrollar.

## Regla de cierre
- Una tarea = `OK` solo con su test 🟢.
- Fases 4 y 5: además **OK humano** (destructivas / datos reales / seguridad).
- El change se archiva (5.5) solo con **todas** las casillas `OK`.
