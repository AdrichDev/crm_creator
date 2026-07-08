# Propuesta: Enchufe Universal / API Pública

## Intención
Habilitar una API Headless pública en creador_CRM para la recepción de leads y la gestión de reservas de forma externa, sin requerir autenticación completa de usuario de Supabase.

## Alcance
- Nuevo enrutador /public con Rate Limiting.
- Endpoint POST /public/leads para inyectar prospectos.
- Endpoint GET /public/availability para consultar horarios libres.
- Endpoint POST /public/bookings para generar reservas.

## Riesgos y Dependencias
- Riesgo de spam: mitigado con \express-rate-limit\.
- Dependencia: La BD debe soportar inserción usando solo usinessId para multi-tenant.

