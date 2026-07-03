import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { env, assertConfig } from './env.js';
import { api } from './routes/index.js';
import { serviceOperatorRouter } from './routes/service-operator.js';
import { notFound, errorHandler } from './middleware/error.js';
import { startReminderDrainer } from './lib/reminderDrainer.js';
import { startDigestScheduler } from './lib/digestScheduler.js';
import { swaggerSpec } from './lib/swagger.js';

// Fail-closed: no arrancar con config Supabase incompleta/placeholder.
assertConfig();

const app = express();
// Confiar en el proxy más cercano (configurable). Necesario para que req.ip
// refleje la IP real del cliente cuando hay un reverse-proxy delante.
app.set('trust proxy', env.trustProxy);
app.use(cors({ origin: env.corsOrigin === '*' ? true : env.corsOrigin.split(',') }));
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

app.use('/api', api);
app.use(notFound);
app.use(errorHandler);

app.listen(env.port, () => {
  console.log(`OperaOS backend escuchando en http://localhost:${env.port}`);
  startReminderDrainer();
  startDigestScheduler();
});
