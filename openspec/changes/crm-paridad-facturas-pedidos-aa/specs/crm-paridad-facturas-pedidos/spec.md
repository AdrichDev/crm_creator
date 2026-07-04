# Spec ? Paridad comercial CRM con AA

## UC-1 ? Facturas CRM con flujo documental
**GIVEN** que existen facturas en CRM
**WHEN** el operador abre `Facturas`
**THEN** el sistema DEBE mostrar una experiencia documental equivalente a AA, con listado, m?tricas, estados y acci?n `Ver / Imprimir`.

- AC-1.1 La experiencia principal NO DEBE depender solo del CRUD gen?rico actual.
- AC-1.2 La vista previa e impresi?n DEBEN usar un documento coherente con el flujo comercial.

## UC-2 ? Compatibilidad con contratos existentes
**GIVEN** que ya hay consumidores de endpoints de facturas en CRM
**WHEN** se introduce la nueva experiencia comercial
**THEN** el sistema DEBE mantener compatibilidad con los contratos existentes o proveer una transici?n no disruptiva.

- AC-2.1 `/api/invoices` y rutas equivalentes NO DEBEN romperse sin migraci?n controlada.
- AC-2.2 La numeraci?n asignada por servidor DEBE seguir mostr?ndose WHEN forme parte del contrato vigente.

## UC-3 ? Pedidos y presupuestos alineados con AA
**GIVEN** un operador que necesita crear o consultar un documento comercial
**WHEN** usa el flujo de pedidos/presupuestos en CRM
**THEN** la UI DEBE comportarse visualmente como AA y NO DEBE obligarle a pasar por el TPV como flujo principal.

- AC-3.1 El documento DEBE permitir listado, edici?n operativa y vista previa imprimible dentro del patr?n comercial esperado.
- AC-3.2 La terminolog?a visible DEBE ser coherente con el modelo de AA.

## UC-4 ? Estados e indicadores coherentes
**GIVEN** facturas con diferentes estados comerciales
**WHEN** el sistema calcula m?tricas y renderiza documentos
**THEN** el mapeo de estados DEBE conservar un significado ?nico y consistente para cobrado, pendiente o anulaciones equivalentes.

- AC-4.1 Los importes agregados DEBEN derivarse de estados persistidos y no de inferencias ambiguas en cliente.
- AC-4.2 La UI y el documento DEBEN reflejar el mismo estado comercial para una misma factura.

