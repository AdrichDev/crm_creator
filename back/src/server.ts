import express from 'express';
import cors from 'cors';
import { env } from './env.js';
import { api } from './routes/index.js';
import { notFound, errorHandler } from './middleware/error.js';

const app = express();
app.use(cors({ origin: env.corsOrigin === '*' ? true : env.corsOrigin.split(',') }));
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => res.json({ ok: true, service: 'operaos-backend' }));
app.use('/api', api);
app.use(notFound);
app.use(errorHandler);

app.listen(env.port, () => {
  console.log(`OperaOS backend escuchando en http://localhost:${env.port}`);
});
