# Spec — Migración CRM a Supabase (Gherkin)

```gherkin
# language: es

Característica: Front consume datos del back (no localStorage)
  Como CRM ya migrado
  Quiero que el front lea/escriba vía REST al back
  Para que ningún dato viva en localStorage ni en docker local

  Antecedentes:
    Dado un usuario con sesión Supabase válida
    Y un negocio activo asociado por Membership

  Escenario: getBackend selecciona el backend REST
    Dado que "NEXT_PUBLIC_API_URL" y "NEXT_PUBLIC_SUPABASE_*" están seteadas
    Cuando el front arranca
    Entonces "getBackend()" devuelve "apiBackend"
    Y ninguna operación de datos lee o escribe en "localStorage"

  Escenario: cada request lleva auth y tenant
    Dado el backend REST activo
    Cuando el front hace una petición de datos al back
    Entonces la cabecera "Authorization" es "Bearer <access_token de Supabase>"
    Y la cabecera "x-business-id" contiene el negocio activo

  Escenario: regresión segura sin API_URL
    Dado que "NEXT_PUBLIC_API_URL" no está seteada
    Cuando el front arranca
    Entonces "getBackend()" devuelve "localBackend"
    Y el comportamiento previo (localStorage) se mantiene


Característica: Back lee/escribe en Supabase schema crm
  Como autoridad de datos del CRM
  Quiero operar sobre crm.* en Supabase y validar tokens vía JWKS
  Para tener paridad con agents-agency

  Escenario: arranque fail-closed sin URL real
    Dado "SUPABASE_URL" con valor placeholder
    Cuando el back arranca
    Entonces "assertAuthSecrets" lanza error
    Y el servidor no acepta peticiones

  Escenario: token válido resuelve membership y admite CRUD
    Dado un "DATABASE_URL" apuntando a Supabase con schema "crm"
    Y un access_token de Supabase válido
    Cuando se llama "GET /api/customers" con ese token
    Entonces la respuesta es 200
    Y Prisma opera sobre "crm.*" en Supabase

  Escenario: token inválido o expirado es rechazado
    Dado un access_token inválido o expirado
    Cuando se llama una ruta protegida
    Entonces la respuesta es 401

  Escenario: migración aditiva sin DROP de aa
    Cuando se aplica la migración Prisma del schema "crm" sobre Supabase
    Entonces no se ejecuta ningún "DROP" de objetos del schema "aa"

  Escenario: service_role nunca en el navegador
    Cuando se inspecciona el bundle del front
    Entonces "SUPABASE_SERVICE_ROLE_KEY" no aparece
    Y solo el back la usa


Característica: Tenancy row-level (sin schema-per-tenant)
  Como modelo de aislamiento aprobado
  Quiero aislar por businessId en un único schema crm
  Para eliminar los schemas Postgres dinámicos del docker

  Escenario: provisionar un negocio nuevo no crea schema
    Cuando se provisiona un proyecto o negocio nuevo
    Entonces se crea un "Business" y un "Membership"
    Y los datos se aíslan por "businessId"
    Pero no se crea ningún schema Postgres dinámico

  Escenario: retiro del modelo schema-per-tenant
    Cuando la migración está completa
    Entonces "buildTenantSchemaSql" no tiene call-sites
    Y "tenants_registry" y "crm_project" están retirados o migrados a filas con "businessId"

  Escenario: datos dinámicos migrados a row-level
    Dado que existían datos en schemas dinámicos del docker
    Cuando se ejecuta la migración de datos
    Entonces esos datos quedan como filas en "crm.*" con su "businessId"


Característica: Login estable (sin congelado)
  Como usuario del front CRM
  Quiero iniciar sesión sin que la UI se congele
  Para acceder al panel de forma fiable

  Escenario: login con sesión previa persistida
    Dado un navegador normal con sesión Supabase persistida
    Cuando el usuario inicia sesión
    Entonces el login resuelve sin quedar congelado en "Entrando..."

  Escenario: paridad normal vs incógnito
    Cuando el usuario inicia sesión en incógnito
    Entonces el comportamiento es idéntico al del navegador normal

  Escenario: sin llamadas Supabase síncronas dentro del lock
    Dado el hook de auth del front CRM
    Cuando se dispara "onAuthStateChange"
    Entonces ningún "supabase.auth.*" se llama de forma síncrona dentro del callback
    Y el trabajo se difiere con "setTimeout(…, 0)" si aplica


Característica: Sin acoplamiento a docker/local
  Como migración completada
  Quiero eliminar toda conexión a Postgres docker y cookies AA
  Para que el CRM dependa solo de Supabase y del back

  Escenario: ninguna conexión al Postgres docker
    Cuando se recorre el flujo completo (login + CRUD)
    Entonces no hay ninguna petición a "localhost:5434"
    Y no se envían cookies de agents-agency

  Escenario: pool docker eliminado
    Cuando la migración está completa
    Entonces "lib/server/db.ts" está eliminado o sin call-sites
    Y "app/api/ai/generate" no usa "getPool()"

  Escenario: selector de clientes sin cookie
    Cuando se usa "app/api/clients" o "clients/[id]"
    Entonces autentica con "Bearer" (no cookie)
    O consume "crm.customer" vía el back

  Escenario: docker-compose sin db-crm activo
    Cuando se levanta el entorno de desarrollo
    Entonces "db-crm" está retirado del flujo
    O marcado como opcional/legacy
```
