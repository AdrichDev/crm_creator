# Devil notes — crm-autoregistro-cliente (Nivel 4)

## Riesgos y decisiones cuestionadas

1. **Contraseña generada por email (descartado).**
   El usuario pidió inicialmente "enviar una contraseña que ha de guardar". Se descartó: enviar
   contraseña en claro por email es replayable, queda en el buzón y rompe la política existente
   (token set-password, sin claro). Decisión: **enlace de verificación → el cliente fija su propia
   contraseña**. Más seguro y coherente.

2. **Enumeración de cuentas en registro.**
   Un `409 email_taken` revelaría qué emails están registrados. Decisión: **respuesta neutra 200**
   siempre, igual que `forgot-password`. El usuario legítimo recibe email; si ya existía, se le puede
   enviar un aviso "ya tienes cuenta" (futuro). NO se confirma existencia al cliente HTTP.

3. **`username` único pero opcional en BD.**
   Declararlo `String` NOT NULL rompería las filas `User` existentes (admins/empleados sin username).
   Decisión: `String?` con `@unique` (Postgres permite múltiples NULL). Los nuevos clientes sí lo llevan.

4. **Gating de login.**
   Bloquear `status != active` puede convertirse en oráculo ("este email existe pero no verificado").
   Mitigación: mantener `bcrypt.compare` dummy + mensaje 403 solo tras credenciales válidas; el
   atacante necesita la contraseña correcta para distinguir 403 de 401 → fuga mínima aceptable.

5. **RBAC del rol CLIENT.**
   `cliente` es "solo vistas". Riesgo: que por reusar el panel pueda llamar endpoints de escritura
   de admin. Verificación V.5 debe comprobar que el back no concede a `CLIENT` operaciones de
   administración (no basta con ocultar en UI).

6. **Multi-tenant en register-client.**
   El cliente se asocia al negocio del header `x-business-id`. Si el header se puede falsificar, un
   cliente podría registrarse en otro negocio. Aceptable en este alcance (el CRM generado fija su
   propio businessId); endurecer si se expone públicamente.

7. **Reúso de `consumeTokenAndSetPassword`.**
   Generalizar a `verify_email` no debe debilitar el flujo `invite/reset`. Mantener la invalidación
   de tokens hermanos y el sellado de `passwordChangedAt`.

## Pendiente de confirmar en implementación
- ¿El CRM generado fija `saas.business.id` en login/arranque? (necesario para `x-business-id`).
- Mensaje de "ya tienes cuenta" para emails repetidos (futuro, fuera de alcance).
