# Dise?o ? Agenda OperaOS, Contactos, Telegram UI y Fichaje

## Enfoque t?cnico
OperaOS ya tiene la referencia visual en `AgendaWidget`; el m?dulo `/citas` debe dejar de ser tabla CRUD y convertirse en agenda full-screen. Calendar, mapas, contactos, Telegram y fichaje deben quedar integrados con patrones existentes del CRM: m?dulos configurables, tenant-aware APIs y componentes UI del panel.

## Decisiones de arquitectura

| Decisi?n | Elecci?n | Alternativa descartada | Motivo |
|---------|----------|------------------------|--------|
| Agenda can?nica | Extraer gram?tica desde `front/components/panel/widgets/agenda-widget.tsx` | Mantener tabla actual de `/citas` | El usuario pidi? exactamente la vista del widget. |
| Calendar CRUD | Reusar `back/src/lib/calendarEmitter.ts`, `calendarSync.ts` e `integrations/calendar.ts` | Nuevo servicio paralelo | Ya existe base Google Calendar; duplicarla generar?a drift. |
| Mapas | Google Maps URL/embed | Nominatim/mapa actual | Petici?n expl?cita y UX conocida. |
| Contactos | Replicar patr?n de Agents Agency | Crear mini-contactos simplificado | El usuario pidi? igualdad visual y l?gica. |
| Fichaje | M?quina de estados por d?a y modo | Bot?n libre entrada/salida | Evita fichajes m?ltiples inv?lidos. |

## Flujo de datos

```text
/citas full-screen ? /bookings CRUD ? CalendarProvider Google
       ?                    ?
       ?? detalle cita ? Google Maps URL

Telegram webhook ? mensajes tenant ? UI conversaci?n ? Bot API

/fichaje ? estado jornada del d?a ? siguiente acci?n permitida ? registro persistido
```

## Cambios de archivos

| Archivo | Acci?n | Descripci?n |
|--------|--------|-------------|
| `front/components/panel/widgets/agenda-widget.tsx` | Modificar/extraer | Separar vista reusable sin romper widget. |
| `front/app/(crm)/citas/page.tsx` | Modificar | Sustituir tabla por agenda full-screen con CRUD. |
| `front/components/crm/cita-detalle-modal.tsx` | Modificar | A?adir ubicaci?n Google Maps si aplica. |
| `back/src/routes/bookings.ts` | Modificar | Asegurar create/update/delete sincronizados con CalendarProvider. |
| `back/src/lib/integrations/calendar.ts` | Modificar | Contrato Google Calendar CRUD tenant-aware. |
| `front/app/(crm)/contactos/page.tsx` | Crear | M?dulo visual/l?gico equivalente a AA. |
| `shared/generate/tenant-types.ts` | Modificar | A?adir `contactos` a m?dulos/generaci?n. |
| `front/app/(crm)/telegram/page.tsx` | Crear | UI de conversaci?n Telegram. |
| `front/app/(crm)/fichaje/page.tsx` | Modificar | Selector intensiva/partida y acci?n siguiente. |
| `back/src/routes/index.ts` / CRUD fichaje | Modificar | Validar secuencia por d?a si el front no basta. |

## Contratos

```ts
type WorkdayMode = 'intensiva' | 'partida';
type WorkdayStep = 'entrada' | 'salida_comida' | 'entrada_comida' | 'salida_final';

type TelegramMessage = {
  tenantId: string;
  conversationId: string;
  direction: 'in' | 'out';
  text: string;
  providerMessageId?: string;
};
```

## Estrategia de pruebas

| Capa | Qu? probar | Enfoque |
|------|------------|---------|
| Unit | M?quina de fichaje, Google Maps URL, mappers contacto | Vitest/node tests. |
| Integraci?n | `/bookings` CRUD ? CalendarProvider mock, Telegram send | API tests. |
| UI | Agenda full-screen, Contactos, Telegram UI, Fichaje | Render/snapshot tests. |
| E2E | Crear cita y verla en agenda; fichaje intensivo/partido | Playwright si est? disponible. |

## Migraci?n / rollout
Contactos y Telegram pueden requerir migraciones aditivas si no existe persistencia. Fichaje debe migrar sin perder registros hist?ricos: registros antiguos se muestran como modo `intensiva` o `legacy` solo lectura si no encajan.

## Preguntas abiertas
- [ ] Confirmar si `Contactos` ser? m?dulo obligatorio o configurable por tenant.

