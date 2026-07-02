# Proposal: Geolocalización real de clientes (batch + corrección de datos)

## Intent

Bug reportado (02/07/2026): "las direcciones no están bien geolocalizadas en el mapa,
ha de ser real". Diagnóstico sobre Supabase:
- 49 clientes con `geo_estado = PENDING` y sin coordenadas: nunca se geocodificaron
  (el geocoder Nominatim del back solo corre en create/update de customer con dirección;
  los sembrados directos a DB no pasan por ahí).
- 20 clientes "OK" (demo Comercial IA) tienen coordenadas sembradas a mano en rejilla
  sintética, no reales (ej.: "Calle Alcalá, 20, Madrid" guardada en 40.3768,-3.7438;
  la real es ~40.4179,-3.699). Además todos comparten CP 28001 aunque las calles no
  correspondan a ese distrito.
- El back YA tiene un puerto de geocodificación real (`back/src/lib/geo/nominatim.ts`,
  Nominatim OSM) con tests. Falta un mecanismo batch y corregir los datos existentes.

## Scope

### In Scope
1. **Endpoint batch** `POST /customers/geocode/rerun` (autenticado, rol gestor):
   - Procesa clientes del negocio con `geo_estado IN (PENDING, FAILED)` y dirección.
   - Parámetro `force=true`: re-geocodifica también los `OK` (para corregir sembrados).
   - Respeta el rate limit de Nominatim (máx. 1 req/s, secuencial), User-Agent ya
     configurado en el cliente existente. Responde resumen `{ok, failed, skipped}`.
   - Lotes acotados (p. ej. máx. 60 por invocación) para no bloquear el proceso.
2. **Front comercial**: botón/acción "Re-geolocalizar pendientes" en la vista de mapa
   o en la lista de pendientes de geolocalizar (RF-05 ya existente), que invoca el
   endpoint y refresca el mapa.
3. **Corrección de datos**: ejecutar el rerun con `force` sobre el negocio demo para
   que los 20 sembrados obtengan coordenadas reales y los 49 PENDING se resuelvan.
   Los que Nominatim no resuelva quedan `FAILED` y visibles en pendientes (RF-05).

### Out of Scope
- Cambiar de proveedor de geocoding (Nominatim se mantiene).
- Edición manual de coordenadas (ya soportada: coords manuales tienen prioridad).
- Normalización postal de las direcciones demo (solo coords; el CP sembrado no se toca).

## Level

Nivel 2-3: back + front + datos persistentes, servicio externo con rate limit.
Ejecución del rerun sobre datos reales → aprobación humana antes de lanzarlo (el
endpoint queda listo; el disparo lo hace el usuario o Gru con su visto bueno).
