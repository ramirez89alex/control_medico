import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './env.js';
import { authRouter } from './routes/auth.js';
import { authPacienteRouter } from './routes/auth-paciente.js';
import { pacientesRouter } from './routes/pacientes.js';
import { citasRouter } from './routes/citas.js';
import { catalogosRouter } from './routes/catalogos.js';
import { archivosRouter } from './routes/archivos.js';
import { presupuestosRouter } from './routes/presupuestos.js';
import { cobrosRouter } from './routes/cobros.js';
import { laboratorioRouter } from './routes/laboratorio.js';
import { contactosRouter } from './routes/contactos.js';
import { portalRouter } from './routes/portal.js';
import { equipoRouter } from './routes/equipo.js';
import { vozRouter } from './routes/voz.js';
import { materialesRouter } from './routes/materiales.js';
import { gestionRouter } from './routes/gestion.js';
import { facturacionRouter } from './routes/facturacion.js';
import { almacenRouter } from './routes/almacen.js';
import { comprasRouter } from './routes/compras.js';
import { bancoRouter } from './routes/banco.js';
import { marketingRouter } from './routes/marketing.js';
import { dashboardRouter } from './routes/dashboard.js';
import { pagosRouter, pagosWebhookHandler, estadoPagoPublico, irAPago } from './routes/pagos.js';

const app = express();

// Railway (y la mayoría de plataformas gestionadas) terminan TLS en un proxy delante de
// nuestro proceso; sin esto Express no vería la petición como https y algunas cabeceras
// (X-Forwarded-*) se ignorarían.
app.set('trust proxy', 1);

app.use(cors({ origin: env.corsOrigin, credentials: true }));

// El webhook de Stripe necesita el cuerpo en crudo para verificar la firma — tiene que
// registrarse ANTES de express.json(), que si no ya lo habría parseado a objeto.
app.post('/pagos/webhook', express.raw({ type: 'application/json' }), pagosWebhookHandler);

app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/auth', authRouter);
app.use('/auth/paciente', authPacienteRouter);
app.use('/pacientes', pacientesRouter);
app.use('/citas', citasRouter);
app.use('/catalogos', catalogosRouter);
app.use('/archivos', archivosRouter);
app.use('/presupuestos', presupuestosRouter);
app.use('/cobros', cobrosRouter);
app.use('/laboratorio', laboratorioRouter);
app.use('/contactos', contactosRouter);
app.use('/portal', portalRouter);
app.use('/equipo', equipoRouter);
app.use('/voz', vozRouter);
app.use('/materiales', materialesRouter);
app.use('/gestion', gestionRouter);
app.use('/facturacion', facturacionRouter);
app.use('/almacen', almacenRouter);
app.use('/compras', comprasRouter);
app.use('/banco', bancoRouter);
app.use('/marketing', marketingRouter);
app.use('/dashboard', dashboardRouter);
// Registradas antes de montar pagosRouter (que exige sesión de personal) porque son públicas
// — si no, caerían dentro de su requireAuth. /pagos/ir/:codigo es el enlace corto que se
// manda al paciente por WhatsApp; /pagos/publico/:sessionId lo consulta la página de "pago
// completado".
app.get('/pagos/ir/:codigo', irAPago);
app.get('/pagos/publico/:sessionId', estadoPagoPublico);
app.use('/pagos', pagosRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno' });
});

app.listen(env.port, () => {
  console.log(`PowerDent API escuchando en http://localhost:${env.port}`);
});
