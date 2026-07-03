# Validation: crm-e2e-aislamiento-bd

## Historia de usuario

Como desarrollador, quiero que `npm test` no toque la BD real y que los e2e limpien lo
que crean, para que la base de producción no acumule datos basura de tests.

## Criterios de aceptación

- AC1: `npm test` NO ejecuta ningún `*.e2e.test.ts` (cero conexiones/escrituras a BD).
- AC2: `npm run test:e2e` ejecuta solo los e2e (mantienen su auto-skip si no hay back
  vivo o SUPABASE_LIVE es falso).
- AC3: con el back vivo, un run de `test:e2e` termina sin dejar filas nuevas en
  `crm.negocio` (nombres `Biz %`) ni usuarios `%@test.local` nuevos.
- AC4: si un cleanup falla, el error sale por consola (no se traga).
- AC5: `purge-test-residue.mjs --dry-run` lista los residuos sin borrar nada;
  `--apply` los elimina y reporta conteos.

## Escenario Given-When-Then

- Given la BD real con residuos `Biz %` y `%@test.local` de runs anteriores
- When ejecuto `node scripts/purge-test-residue.mjs --apply` y después `npm test`
- Then los residuos desaparecen y `npm test` corre verde sin crear ninguna fila nueva.

## Tests por tarea

| Tarea | Test | Estado |
|---|---|---|
| T1 scripts separados | `npm test` corre verde sin ningún fichero e2e en el listado del runner | pendiente |
| T2 cleanup fiable | run de `test:e2e` con back vivo → conteo antes/después de `Biz %` y `%@test.local` sin incremento | pendiente |
| T3 purge script | `--dry-run` no modifica conteos; `--apply` los deja a cero | pendiente |
