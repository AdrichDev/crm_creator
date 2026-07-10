import { Router, type Response } from 'express';
import { resolveTenantState } from '../lib/tenant-lifecycle/resolver.js';
import type { AuthedRequest } from '../middleware/types.js';

// crm-tenant-lifecycle-gate: `GET /tenant-status` — EXENTO del tenantGate. El front lo consulta
// desde la pantalla de bloqueo para saber POR QUÉ está bloqueado (423/410). No filtra datos del
// negocio: solo el estado efectivo y, si hay gracia vigente, su fecha de fin.
//
// El montaje (y su exención del gate) es responsabilidad de WU3 (routes/index.ts).

export const tenantStatusRouter = Router();

// GET /tenant-status → { lifecycle, graceUntil? } del negocio resuelto en req
// (tenantBusinessId del carril API key, o businessId de sesión). Sin identidad → 400.
tenantStatusRouter.get('/', async (req: AuthedRequest, res: Response) => {
  const businessId = req.tenantBusinessId ?? req.businessId;
  if (!businessId) {
    return res
      .status(400)
      .json({ error: { code: 'business_not_resolved', message: 'Negocio no resuelto en la petición' } });
  }
  try {
    const { effective, graceUntil } = await resolveTenantState(businessId);
    return res.json({
      lifecycle: effective,
      ...(graceUntil ? { graceUntil: graceUntil.toISOString() } : {}),
    });
  } catch (e) {
    console.error('[tenant-status] error resolviendo estado del negocio:', e);
    return res.status(500).json({ error: { code: 'server_error', message: 'Error interno' } });
  }
});
