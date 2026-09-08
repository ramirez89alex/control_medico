import Stripe from 'stripe';
import { env } from '../env.js';

/** null si la clínica todavía no ha configurado Stripe — los enlaces de pago quedan deshabilitados hasta entonces. */
export const stripe = env.stripeSecretKey ? new Stripe(env.stripeSecretKey) : null;
