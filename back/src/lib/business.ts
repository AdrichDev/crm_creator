import { prisma } from '../prisma.js';

// Fuente ÚNICA del shape de "negocio activo" que el front usa para construir su
// TenantConfig (nombre, vertical, branding). Antes el select estaba inline en
// auth.ts /me. Centralizado para que la forma no diverja entre endpoints.
export function loadActiveBusiness(businessId: string | undefined) {
  if (!businessId) return Promise.resolve(null);
  return prisma.business.findUnique({
    where: { id: businessId },
    select: {
      id: true, nombre: true, vertical: true,
      marcaPrimario: true, marcaSecundario: true, logoUrl: true,
    },
  });
}
