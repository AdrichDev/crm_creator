# Delta spec — crm-core (castellano + Supabase total)

## ADDED Requirements

### Requisito: API y modelos en castellano
El back DEBE exponer y persistir los datos de negocio con identificadores en castellano. Los
modelos Prisma renombran sus campos a castellano manteniendo `@map` a la columna existente.

#### Escenario: lectura de un módulo
- DADO un negocio con datos en `crm`
- CUANDO el front pide `GET /api/<modulo>`
- ENTONCES la respuesta usa claves en castellano idénticas al shape que la página renderiza.

### Requisito: cero almacenamiento local de datos
En modo API el front NO DEBE leer/escribir datos de negocio ni config en `localStorage`.
Única clave local admitida: `saas.business.id` (tenant activo) y la preferencia de tema.

#### Escenario: sin fallback mock
- DADO un módulo sin registros
- CUANDO el back responde vacío
- ENTONCES la página muestra estado vacío (no datos mock).

### Requisito: consola de agencia sobre Supabase
La consola `/` DEBE listar y crear negocios (tenants) desde Supabase (row-level), permitir abrir
uno (→ `/panel`), volver a la consola y cerrar sesión.

#### Escenario: crear y abrir un CRM
- DADO un usuario agencia autenticado
- CUANDO crea un negocio y pulsa Abrir
- ENTONCES entra a `/panel` con ese tenant activo y sus datos de Supabase.

### Requisito: esquema sin columnas muertas
Cada tabla DEBE contener solo columnas usadas por alguna ruta o por el front. Los derivados
(visitas, gastoTotal, segmento, etc.) se calculan en el back, no se almacenan.
