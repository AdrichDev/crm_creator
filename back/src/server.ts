import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { env, assertConfig } from './env.js';
import { resolveCorsOrigins } from './lib/cors-origins.js';
import { api } from './routes/index.js';
import { serviceOperatorRouter } from './routes/service-operator.js';
import { licenseRouter } from './routes/license.js';
import { publicRouter } from './routes/public.js';
import { notFound, errorHandler } from './middleware/error.js';
import { startReminderDrainer } from './lib/reminderDrainer.js';
import { startDigestScheduler } from './lib/digestScheduler.js';
import { startCalendarSync } from './lib/calendarSync.js';
import { swaggerSpec } from './lib/swagger.js';

// Fail-closed: no arrancar con config Supabase incompleta/placeholder.
assertConfig();

const app = express();
// Confiar en el proxy más cercano (configurable). Necesario para que req.ip
// refleje la IP real del cliente cuando hay un reverse-proxy delante.
app.set('trust proxy', env.trustProxy);
// Incluye SIEMPRE los orígenes de WebView nativo (apk/ipa) además del CORS_ORIGIN web,
// o los exports nativos rebotarían por CORS (su origin es https://localhost). Ver cors-origins.ts.
app.use(cors({ origin: resolveCorsOrigins(env.corsOrigin) }));
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => res.json({ ok: true, service: 'operaos-backend' }));

// Documentación interactiva OpenAPI. Solo fuera de producción para no exponerla.
if (process.env.NODE_ENV !== 'production') {
  app.get('/api/docs/swagger.json', (_req, res) => res.json(swaggerSpec));
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}

// Operator Agent (F1 aa-operator-agent): manos server-side de solo lectura,
// protegidas SOLO por service token. FUERA de /api → no pasa por el gate de usuario.
app.use('/service/operator', serviceOperatorRouter);

// crm-tenant-lifecycle-gate (WU3.3): heartbeat de licencia firmado (formas binario/offline).
// FUERA de /api y EXENTO del tenantGate a propósito: el binario de un negocio suspendido
// debe poder preguntar el estado — la respuesta firmada 'SUSPENDED' ES el mecanismo de corte.
app.use('/license', licenseRouter);

// Assets públicos (logo del negocio para los correos). FUERA de /api: sin gate de usuario.
app.use('/public', publicRouter);

app.use('/api', api);
app.use(notFound);
app.use(errorHandler);

// Defense-in-depth: log any future unguarded async rejection instead of crashing the process.
// Individual handlers carry their own try/catch; this is the last line of defense.
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

app.listen(env.port, () => {
  console.log(`OperaOS backend escuchando en http://localhost:${env.port}`);
  // Kill-switch de crons de fondo: ENABLE_CRONS=false los apaga (util en demo/pre-launch
  // para no consumir egress de Supabase pinchando la BD 24/7). Default: habilitados.
  if (process.env.ENABLE_CRONS === 'false') {
    console.log('[crons] deshabilitados via ENABLE_CRONS=false (drainer/digest/calendar-sync no arrancan)');
  } else {
    startReminderDrainer();
    startDigestScheduler();
    startCalendarSync();
  }
});
