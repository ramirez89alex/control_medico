import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './env.js';
import { authRouter } from './routes/auth.js';
import { pacientesRouter } from './routes/pacientes.js';
import { citasRouter } from './routes/citas.js';
import { catalogosRouter } from './routes/catalogos.js';
import { archivosRouter } from './routes/archivos.js';

const app = express();

app.use(cors({ origin: env.corsOrigin, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/auth', authRouter);
app.use('/pacientes', pacientesRouter);
app.use('/citas', citasRouter);
app.use('/catalogos', catalogosRouter);
app.use('/archivos', archivosRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno' });
});

app.listen(env.port, () => {
  console.log(`PowerDent API escuchando en http://localhost:${env.port}`);
});
