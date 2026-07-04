# Validaci?n ? crm-paridad-facturas-pedidos-aa

Historia: como operador de CRM quiero gestionar pedidos/presupuestos y facturas con el mismo
modelo visual y documental de Agents Agency, para no trabajar con dos flujos comerciales distintos.

## Criterios de aceptaci?n (AC)
- **AC1:** `Facturas` en CRM muestra listado, m?tricas, estados y documento imprimible como experiencia principal.
- **AC2:** CRM ofrece pedidos/presupuestos con una interacci?n visual equivalente a AA.
- **AC3:** la numeraci?n de facturas asignada por servidor se conserva cuando forme parte del contrato actual.
- **AC4:** los estados visibles de facturas mantienen un significado coherente para c?lculos y documento.
- **AC5:** los endpoints actuales de facturas siguen siendo compatibles tras introducir la nueva experiencia.

## Por tarea (Dado-Cuando-Entonces + test)
- **A.1-A.3 modelo y contratos** ? **DADO** el modelo comercial actual de CRM, **CUANDO** se adapta para soportar pedidos/facturas documentales, **ENTONCES** conserva compatibilidad con contratos vigentes y cubre las nuevas necesidades de UI. Test: schema + contract tests.
- **B.1-B.4 facturas UI** ? **DADO** facturas existentes en CRM, **CUANDO** el operador abre `Facturas`, **ENTONCES** ve m?tricas, listado, estados y `Ver / Imprimir` como en AA. Test: UI/e2e documental.
- **C.1-C.4 pedidos/presupuestos** ? **DADO** un operador creando un documento comercial, **CUANDO** usa el nuevo flujo, **ENTONCES** puede trabajar pedidos/presupuestos con patr?n visual equivalente a AA y sin depender del TPV como v?a principal. Test: UI/e2e comercial.
- **D.1 compatibilidad API** ? **DADO** consumidores de endpoints existentes, **CUANDO** se despliega el cambio, **ENTONCES** los contratos previos siguen respondiendo correctamente. Test: API regression.
- **D.2 numeraci?n y estados** ? **DADO** facturas nuevas y existentes, **CUANDO** se renderizan documento y m?tricas, **ENTONCES** la numeraci?n y el mapeo de estados siguen siendo coherentes. Test: unit + snapshot documental.

> Regla del repo: una tarea est? DONE solo cuando su test est? verde. Sin spec, no hay implementaci?n v?lida.

