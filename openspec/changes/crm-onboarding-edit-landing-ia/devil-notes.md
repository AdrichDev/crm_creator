# Devil Notes — Onboarding edit + landing ZIP + IA en consonancia

## 1. ZIP arbitrario servido como página pública = riesgo #1
UC-2 sirve HTML/CSS/JS del cliente en ruta pública `/(landing)` en el MISMO origen que el CRM, con login que entra al CRM. Es servir JS no confiable en tu dominio. Mismo origen = el JS de la landing puede leer cookies/localStorage/JWT del CRM → toma de cuenta. XSS almacenado: `<script>` exfiltra credenciales del form de login que TÚ pones encima (AC-2.2 mete login en la misma página del HTML no confiable; login y atacante comparten DOM). AC-2.1 valida extensiones y `..` pero NO sanitiza contenido: un .html legítimo con `<script>malicioso` pasa el filtro. La spec confunde "validar el ZIP" con "neutralizar el contenido". Cambio crítico: landing NO puede vivir en el origen del CRM → sandbox/subdominio + iframe sandbox + CSP estricta; "Acceder" = enlace al login del CRM en SU origen, no form embebido. Sin esto es una puerta de entrada al CRM → REPENSAR.

## 2. ¿Quién sube el ZIP, de quién es la landing?
Spec asume ZIP benigno. ¿Lo sube el admin o el cliente final? Si es el cliente, nunca confiable. Una landing real trae trackers/pixels/widgets de terceros que se ejecutarían en tu origen. Modelo de confianza del subidor no definido.

## 3. IA editando "todo el CRM" — alcance peligroso
AC-3.1 previsualiza, AC-3.3 deshace BRANDING (bien para colores/fuentes). Pero "terminología" (AC-3.2 "si procede") es más profundo y el deshacer solo promete branding → terminología podría NO ser reversible. "Analiza el tono" → ¿manda HTML del cliente (posible PII/datos del negocio) a un LLM externo? Exfiltración a un tercero. ¿Consentimiento? ¿Proveedor? Alcance de lo que la IA toca y qué se manda al LLM no definido.

## 4. Reversibilidad: ¿de verdad?
Branding sí (guardas el anterior). Pero la landing inyectada crea ruta pública nueva, almacena assets, cambia el flujo de entrada (login delante). NO hay AC de "quitar la landing". Si sale mal o es maliciosa, ¿cómo se desinyecta? Reversibilidad ESTRUCTURAL no cubierta, solo la de branding.

## 5. Coste y lock-in IA
AC-3.4 vago. HTML/CSS completo = prompt grande = caro por proyecto. ¿Límite duro/mes? ¿Qué pasa al alcanzarlo? Lock-in si la consonancia depende de un modelo concreto.

## 6. Edge cases sin spec
- ZIP sin index.html (AC-2.2 lo asume).
- index.html con rutas absolutas (/assets/...) chocando con rutas del CRM.
- Tamaño "máx" sin número. ZIP bomb: 1MB→10GB extraído = DoS. AC-2.1 valida tamaño del ZIP, no del extraído. No cubierto.
- Editar (UC-1) proyecto ya terminado: quitar un módulo con datos dentro → ¿se borran/ocultan? Huérfanos. AC-1.3 dice "sin perder datos" pero no especifica.

## RECOMENDACIÓN: REPENSAR landing (UC-2); PROCEDER-CON-CAMBIOS el resto
- UC-1 editar: PROCEDER-CON-CAMBIOS (definir datos de módulos quitados).
- UC-3 IA: PROCEDER-CON-CAMBIOS (acotar alcance, reversibilidad de terminología, qué sale al LLM).
- UC-2 landing ZIP: REPENSAR. Mayor superficie de ataque del proyecto.
Cambio mínimo: 1) Aislar landing del origen CRM (sandbox/subdominio + CSP; login del CRM nunca comparte DOM con HTML no confiable). 2) Sanitizar contenido (no solo extensiones) + anti ZIP-bomb (límite descomprimido). 3) Definir "desinyectar landing". 4) Acotar qué manda la IA al LLM y si terminología es reversible. Pasar UC-2 por cybersec:* ANTES de implementar.
