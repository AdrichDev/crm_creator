import express from 'express';
import cors from 'cors';
import { env, assertConfig } from './env.js';
import { api } from './routes/index.js';
import { notFound, errorHandler } from './middleware/error.js';
import { startReminderDrainer } from './lib/reminderDrainer.js';

// Fail-closed: no arrancar con config Supabase incompleta/placeholder.
assertConfig();

const app = express();
// Confiar en el proxy más cercano (configurable). Necesario para que req.ip
// refleje la IP real del cliente cuando hay un reverse-proxy delante.
app.set('trust proxy', env.trustProxy);
app.use(cors({ origin: env.corsOrigin === '*' ? true : env.corsOrigin.split(',') }));
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => res.json({ ok: true, service: 'operaos-backend' }));
app.use('/api', api);
app.use(notFound);
app.use(errorHandler);

app.listen(env.port, () => {
  console.log(`OperaOS backend escuchando en http://localhost:${env.port}`);
  startReminderDrainer();
});
