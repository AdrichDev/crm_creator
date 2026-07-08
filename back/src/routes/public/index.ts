import { Router } from 'express';
import { publicRateLimiter } from '../../middleware/rate-limit.js';
import { leadsPublicRouter } from './leads.js';
import { bookingsPublicRouter } from './bookings.js';
import { availabilityPublicRouter } from './availability.js';

export const publicRouter = Router();

// Aplicar el limitador de peticiones a todos los endpoints públicos
publicRouter.use(publicRateLimiter);

// Endpoints
publicRouter.use('/leads', leadsPublicRouter);
publicRouter.use('/bookings', bookingsPublicRouter);
publicRouter.use('/availability', availabilityPublicRouter);
