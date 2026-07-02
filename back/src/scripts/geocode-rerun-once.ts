import 'dotenv/config';
import { prisma } from '../prisma.js';
import { resolveGeocoder } from '../lib/geo/index.js';

// One-off de operaciones: re-geocodifica los clientes de un negocio con el mismo
// criterio que POST /customers/geocode/rerun (WU3 de crm-geo-real-clientes), pero
// invocado directamente contra la base (sin HTTP) para la corrección de datos
// aprobada por el usuario. Sin `--force` procesa PENDING/FAILED; con `--force`
// re-geocodifica también los OK (corrige coordenadas sembradas sintéticas).
// Ejecutar: npx tsx src/scripts/geocode-rerun-once.ts <businessId> [--force]

async function main() {
  const businessId = process.argv[2];
  const force = process.argv.includes('--force');
  if (!businessId) {
    console.error('Uso: npx tsx src/scripts/geocode-rerun-once.ts <businessId> [--force]');
    process.exit(1);
  }

  const candidates = await prisma.customer.findMany({
    where: {
      businessId,
      eliminadoEn: null,
      ...(force ? {} : { geoEstado: { in: ['PENDING', 'FAILED'] } }),
    },
    select: { id: true, nombre: true, direccion: true, localidad: true, provincia: true, codigoPostal: true },
    orderBy: { createdAt: 'asc' },
  });
  console.log(`Negocio ${businessId} — ${candidates.length} candidatos (force=${force})`);

  const geocoder = resolveGeocoder();
  let ok = 0; let failed = 0; let skipped = 0;
  for (const c of candidates) {
    const hasAddress = [c.direccion, c.localidad, c.provincia, c.codigoPostal]
      .some((v) => typeof v === 'string' && v.trim());
    if (!hasAddress) { skipped += 1; continue; }
    const geo = await geocoder.geocode({
      direccion: c.direccion, localidad: c.localidad, provincia: c.provincia, codigoPostal: c.codigoPostal,
    });
    if (geo) {
      await prisma.customer.update({ where: { id: c.id }, data: { latitud: geo.lat, longitud: geo.lng, geoEstado: 'OK' } });
      ok += 1;
      console.log(`OK     ${c.nombre} — ${c.direccion ?? ''} -> ${geo.lat},${geo.lng}`);
    } else {
      await prisma.customer.update({ where: { id: c.id }, data: { geoEstado: 'FAILED' } });
      failed += 1;
      console.log(`FAILED ${c.nombre} — ${c.direccion ?? ''}`);
    }
  }
  console.log(`\nResumen: { ok: ${ok}, failed: ${failed}, skipped: ${skipped} }`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
