# Propuesta ? Paridad CRM con facturas y pedidos de AA

**Nivel Gru: 4 ? Cr?tica.** Cruza modelo, rutas, UI comercial y compatibilidad con contratos existentes.
**Estado: SPEC (aprobado el alcance, pendiente implementaci?n).**

## Contexto
`creador_CRM` ya tiene piezas de ventas y facturas, pero su experiencia actual no replica el flujo
documental de `agents-agency`. El usuario pidi? llevar a CRM el mismo comportamiento visual y operativo
de facturas y pedidos, respetando adem?s el orden de ejecuci?n definido: primero facturas AA, luego
sidebar AA y despu?s la paridad CRM.

## Intenci?n
1. Implementar en CRM una pantalla de `Facturas` equivalente a la de AA: listado, m?tricas, vista previa e impresi?n.
2. Llevar a CRM el flujo visual y funcional de pedidos/presupuestos de AA.
3. Mantener compatibilidad con la API y numeraci?n actuales cuando ya existan consumidores.
4. Evitar que el flujo TPV/carrito siga siendo la referencia principal para documentos comerciales.

## Decisiones
- AA se toma como referencia funcional para documentos comerciales.
- La experiencia principal de `Facturas` en CRM deja de ser un CRUD gen?rico y pasa a ser documental.
- La numeraci?n actual asignada por servidor debe conservarse cuando forme parte del contrato vigente.
- La adaptaci?n debe respetar compatibilidad con endpoints existentes mientras se introduce la nueva UI.

## Alcance
- Pantalla `Facturas` de CRM con m?tricas, listado, estados, vista previa e impresi?n.
- Flujo de pedidos/presupuestos en CRM alineado visualmente con AA.
- Ajustes de modelo y API necesarios para sostener la paridad sin romper contratos actuales.

## Fuera de alcance
- Integraciones contables externas o cobro online.
- Rehacer toda la vertical comercial fuera de pedidos/presupuestos y facturas.
- Rebranding completo no necesario para la paridad funcional.

## Riesgos
- Romper contratos existentes de facturas al redise?ar la experiencia.
- Mezclar el flujo TPV con el flujo documental comercial.
- Introducir divergencias entre AA y CRM si se implementa la UI sin cerrar antes los cambios previos en AA.

## Dependencias
Este cambio depende de `aa-facturas-desde-presupuestos-aceptados` y `aa-navegacion-lateral-agrupada`, y debe ejecutarse despu?s de ambos.

