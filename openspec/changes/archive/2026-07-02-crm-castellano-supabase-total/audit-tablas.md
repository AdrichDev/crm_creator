# Auditoría de tablas (Fase 3.1) — generada por subagente, read-only

Scope: back/src, front/*. Schema/migraciones/sql excluidos del conteo. Whitelist de
`routes/index.ts` cuenta como USED. INFRA = id/FK/businessId/userId/locationId/timestamps.

## Modelos MUERTOS completos (sin ruta ni acceso prisma) → candidatos a DROP
- `BusinessSetting` (config_negocio)
- `EmployeeSchedule` (horario_empleado)
- `Document` (documento) + enums `DocumentType`, `DocVisibility`
- `Notification` (notificacion)
- `SaleLine` (linea_venta): expuesto solo vía `Sale.include.lines` pero NUNCA se crea → todos sus
  escalares muertos. Drop requiere quitar el `include: { lines: true }` de `/sales`.

## Columnas MUERTAS en modelos vivos → candidatas a DROP
- Business: `legalName`, `taxId`, `defaultCurrency`, `defaultTimezone`, `plan`
- Holiday: `name`
- Customer: `fechaNacimiento`, `genero`, `canalCaptacion`, `preferencias`, `consentimientoComms`, `consentimientoEn`
- Package: `active`
- PackageSession: `usedAt`, `note`

## USED solo en back (front no consume) — decisión de producto, no estrictamente muertas
- Employee: `hireDate`, `vacationTotal`, `vacationUsed`, `commission`
- Resource: `locationNote`, `metadata`

## FRONT pide y el modelo NO tiene
- Cliente: visitas/gastoTotal/segmento/ultimaVisita = DERIVABLES (ya en customers.ts).
  `cif`, `contacto` = necesitan columna o decisión (B2B; Estudio Lúa B2C no usa). `documentos` =
  necesita relación (Document está muerto y no enlaza a Customer). `extra` = reutilizar `preferencias` Json.
- Empleado: `rol` (texto libre) — Employee no tiene columna role (el rol vive en Membership enum).
- Venta: `items` (count) = DERIVABLE (count SaleLine) — pero SaleLine no se escribe.
- Resena (reviews): SIN modelo backing — 100% mock front.

## Notas para el DROP (destructivo, Supabase)
- Migración destructiva → recipe [[crm-prisma-migration-gotcha]] + HUMAN-IN-THE-LOOP.
- Datos en columnas muertas = nulos/vacíos → bajo riesgo, pero DROP es irreversible.
- Antes de dropear SaleLine: quitar include en `/sales`.
