# Proposal: crm-generador-exclusiones

## Problema

`creador_CRM/generar.mjs` copia `back/` y `front/` completos al paquete cliente con una
denylist por nombre exacto (`EXCLUDE`, línea 91) que no cubre `backups/`, `*.sql`,
`*.dump`, `*.log` ni variantes de `.env` más allá de `.env`/`.env.local`. Ignora
`.gitignore`. Fuga CONFIRMADA: `generated/vitaldent/back/backups/crm_production_*.sql`
(76KB, dump de producción con datos de todos los tenants) dentro de un paquete destinado
a un cliente. Riesgo RGPD real. El generador no tiene ningún test.

## Solución

1. Endurecer el filtro de `copyDir`:
   - Denylist de DIRECTORIOS por nombre: los actuales + `backups`, `coverage`, `tmp`.
   - Denylist de FICHEROS por patrón: `*.sql`, `*.dump`, `*.log`, `.env*` (permitiendo
     explícitamente `*.example` — `.env.example`, `.env.local.example` son intencionales
     y deben seguir copiándose), `*.pem`, `*.key`.
   - Implementación como predicado `shouldCopy(name, isDir)` puro y exportable/testeable.
2. Test del generador: unit del predicado (casos: backups dir, .sql, .env.docker,
   .env.example permitido, código normal permitido) + test de integración ligero que
   genere en un tmpdir desde un origen sintético y verifique ausencia de patrones
   sensibles.
3. Purga de fugas ya materializadas: eliminar `generated/*/back/backups/` existentes
   (el dump de vitaldent y logs). Los backups del ORIGEN (`back/backups/`) se quedan —
   son locales y gitignored; solo dejan de copiarse.

## Alcance

- `creador_CRM/generar.mjs`.
- Test nuevo del generador.
- Borrado de `generated/vitaldent/back/backups/` (y equivalentes en otros paquetes si
  existieran).

## Fuera de alcance

- Rediseño del generador o allowlist completa (mejora futura si el generador crece).
- Limpieza de `node_modules`/`.next` post-install en generated/ (no son fugas).
