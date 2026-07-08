import rateLimit from 'express-rate-limit';

/**
 * Middleware para limitar peticiones a los endpoints públicos,
 * reduciendo el riesgo de spam desde landings o bots maliciosos.
 */
export const publicRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // Limite de 100 peticiones por IP por ventana
  message: {
    error: {
      code: 'too_many_requests',
      message: 'Demasiadas peticiones a la API pública. Por favor, inténtalo más tarde.'
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
});
