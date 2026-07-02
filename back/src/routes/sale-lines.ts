import { Router, type Response } from 'express';
import { prisma } from '../prisma.js';
import type { AuthedRequest } from '../middleware/types.js';

// Líneas de venta (SaleLine) anidadas bajo /sales/:id/lineas. Cada mutación
// recalcula Sale.total = Σ subtotal de las líneas vivas EN LA MISMA transacción.
// Se monta en /sales junto al crudRouter('sale'); las rutas no colisionan
// (crud maneja /:id, este maneja /:id/lineas).
export const saleLinesRouter = Router();

// Confirma que la venta pertenece al negocio activo (scoping tenant). 404 si no.
async function findScopedSale(req: AuthedRequest) {
  return prisma.sale.findFirst({ where: { id: req.params.id, businessId: req.businessId, eliminadoEn: null } });
}

// Recalcula y persiste Sale.total como la suma de subtotales de sus líneas.
type TxClient = Pick<typeof prisma, 'saleLine' | 'sale' | '$queryRaw'>;
async function recalcTotal(tx: TxClient, saleId: string): Promise<void> {
  const agg = await tx.saleLine.aggregate({ where: { saleId }, _sum: { subtotal: true } });
  await tx.sale.update({ where: { id: saleId }, data: { total: agg._sum.subtotal ?? 0 } });
}

// Serializa mutaciones concurrentes sobre la misma venta (lock de fila del padre).
// Sin esto, dos tx concurrentes agregan subtotales sin ver las líneas no committeadas
// de la otra y el total queda mal (lost update, reproducido con 20 POST en paralelo).
async function lockSale(tx: TxClient, saleId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM crm.venta WHERE id = ${saleId} FOR UPDATE`;
}

saleLinesRouter.get('/:id/lineas', async (req: AuthedRequest, res: Response) => {
  const sale = await findScopedSale(req);
  if (!sale) return res.status(404).json({ error: { code: 'not_found', message: 'No encontrado' } });
  const lineas = await prisma.saleLine.findMany({ where: { saleId: sale.id }, orderBy: { concepto: 'asc' } });
  res.json({ lineas });
});

saleLinesRouter.post('/:id/lineas', async (req: AuthedRequest, res: Response) => {
  const sale = await findScopedSale(req);
  if (!sale) return res.status(404).json({ error: { code: 'not_found', message: 'No encontrado' } });

  const { concepto, cantidad, precioUnitario } = req.body ?? {};
  if (typeof concepto !== 'string' || !concepto.trim()) {
    return res.status(422).json({ error: { code: 'validation', message: 'concepto requerido' } });
  }
  if (!Number.isInteger(cantidad) || cantidad < 1) {
    return res.status(422).json({ error: { code: 'validation', message: 'cantidad debe ser un entero >= 1' } });
  }
  if (typeof precioUnitario !== 'number' || precioUnitario < 0) {
    return res.status(422).json({ error: { code: 'validation', message: 'precioUnitario debe ser un número >= 0' } });
  }

  const subtotal = cantidad * precioUnitario;
  const linea = await prisma.$transaction(async (tx) => {
    await lockSale(tx, sale.id);
    const created = await tx.saleLine.create({ data: { saleId: sale.id, concepto: concepto.trim(), cantidad, precioUnitario, subtotal } });
    await recalcTotal(tx, sale.id);
    return created;
  });
  res.status(201).json(linea);
});

// DELETE hard: la línea se elimina físicamente (SaleLine no tiene soft-delete).
saleLinesRouter.delete('/:id/lineas/:lineaId', async (req: AuthedRequest, res: Response) => {
  const sale = await findScopedSale(req);
  if (!sale) return res.status(404).json({ error: { code: 'not_found', message: 'No encontrado' } });
  const linea = await prisma.saleLine.findFirst({ where: { id: req.params.lineaId, saleId: sale.id } });
  if (!linea) return res.status(404).json({ error: { code: 'not_found', message: 'No encontrado' } });

  await prisma.$transaction(async (tx) => {
    await lockSale(tx, sale.id);
    await tx.saleLine.delete({ where: { id: linea.id } });
    await recalcTotal(tx, sale.id);
  });
  res.status(204).end();
});
