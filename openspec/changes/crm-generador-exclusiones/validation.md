# Validation: crm-generador-exclusiones

## Historia de usuario

Como operador de la plataforma, quiero que los paquetes generados para clientes no
contengan jamás dumps, backups, logs ni credenciales, para no filtrar datos de
producción a terceros.

## Criterios de aceptación

- AC1: un paquete generado no contiene `backups/`, `*.sql`, `*.dump`, `*.log`, `.env`,
  `.env.local` ni ninguna variante `.env.*` (excepto `*.example`).
- AC2: `.env.example`, `.env.local.example` y el código fuente normal SÍ se copian
  (paquete sigue siendo funcional).
- AC3: las fugas ya materializadas en `generated/` quedan eliminadas.
- AC4: el predicado de filtrado tiene tests unitarios y hay un test de integración que
  genera desde origen sintético y verifica AC1/AC2.

## Escenario Given-When-Then

- Given un origen con `back/backups/prod.sql`, `back/.env.docker`, `back/.env.example`
  y `back/src/index.ts`
- When ejecuto la generación de un paquete
- Then el paquete contiene `.env.example` e `index.ts` y NO contiene `backups/`,
  `prod.sql` ni `.env.docker`.

## Tests por tarea

| Tarea | Test | Estado |
|---|---|---|
| T1 predicado shouldCopy | unit: backups/, *.sql, *.dump, *.log, .env.docker → false; .env.example, src/*.ts → true | pendiente |
| T2 integración copyDir | genera desde tmpdir sintético → verifica presencia/ausencia | pendiente |
| T3 purga generated/ | listado post-borrado sin backups/ ni *.sql en generated/*/ | pendiente |
