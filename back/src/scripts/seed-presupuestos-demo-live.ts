import 'dotenv/config';
import { prisma } from '../prisma.js';
import { computePedidoTotals } from '../lib/pedidos/totals.js';
import {
  ensureInvoiceForPedido,
  type InvoiceCreateTx,
  type PedidoForInvoice,
} from '../lib/pedidos/invoice.js';

// Seed EN VIVO de Presupuestos (modelo `pedido` reutilizado como presupuesto documental)
// para la demo de "Comercial Demo IA" — crm-operaos-agenda-contactos-fichaje-telegram,
// task 10.4. Cataloga productos reales de INTERIORISMO y PAISAJISMO y genera 12 presupuestos
// variados vinculados a clientes EXISTENTES del negocio (no crea clientes).
//
// Fuente de verdad de los totales: computePedidoTotals (misma función que POST /pedidos).
// Los presupuestos `aceptada` auto-generan su factura vía ensureInvoiceForPedido dentro de la
// misma $transaction (mismo flujo real que PUT /pedidos/:id/status), poblando el módulo
// Facturas de forma coherente (10.3).
//
// Idempotente: se salta cualquier presupuesto cuyo (negocio, numero) ya exista. Reejecutable.
//
// Ejecutar: cd back && npx tsx src/scripts/seed-presupuestos-demo-live.ts

const BUSINESS_ID = 'cmr84anhw00005ofx8ba2w4sh'; // "Comercial Demo IA" (demo en vivo)
const TASA_IVA = 0.21;
const DIAS_VALIDEZ = 30;

// Emisor fiscal del estudio (no hay config server-side; el front lo guarda en localStorage,
// así que aquí se usa un emisor fijo coherente con el negocio de interiorismo/paisajismo).
const EMISOR = {
  empresa: 'Comercial Demo IA — Estudio de Interiorismo y Paisajismo',
  cif: 'B87654321',
  direccion: 'Calle Serrano 41, 28001 Madrid',
  email: 'hola@comercialdemoia.es',
  telefono: '+34 910 234 567',
};

/** Concepto del catálogo. precioImpl = pago único/unidad; precioMant = cuota mensual/unidad. */
interface Producto {
  nombre: string;
  descripcion: string;
  precioImpl: number;
  precioMant: number;
}

// --- Catálogo de INTERIORISMO ---
const CATALOGO: Record<string, Producto> = {
  i_salon: { nombre: 'Proyecto de interiorismo integral de salón', descripcion: 'Diseño conceptual, distribución, memoria de calidades y planos de detalle.', precioImpl: 3200, precioMant: 0 },
  i_vivienda: { nombre: 'Diseño y dirección de obra de vivienda completa', descripcion: 'Proyecto integral llave en mano con dirección de obra.', precioImpl: 8500, precioMant: 0 },
  i_cocina: { nombre: 'Reforma integral de cocina', descripcion: 'Demolición, fontanería, electricidad, mobiliario y electrodomésticos.', precioImpl: 12500, precioMant: 0 },
  i_mobiliario: { nombre: 'Mobiliario a medida (armarios y librería)', descripcion: 'Fabricación e instalación en melamina y chapa de roble.', precioImpl: 4200, precioMant: 0 },
  i_parquet: { nombre: 'Suministro e instalación de parquet de roble', descripcion: 'Tarima flotante de roble europeo, incluye rodapié (precio por m²).', precioImpl: 48, precioMant: 0 },
  i_microcemento: { nombre: 'Microcemento en paredes y suelo de baño', descripcion: 'Aplicación continua de microcemento con acabado sellado (precio por m²).', precioImpl: 65, precioMant: 0 },
  i_iluminacion: { nombre: 'Proyecto de iluminación técnica LED', descripcion: 'Cálculo lumínico, selección de luminarias y control domótico.', precioImpl: 1900, precioMant: 0 },
  i_cortinas: { nombre: 'Cortinas y tapicería a medida', descripcion: 'Confección, suministro e instalación de cortinas y estores.', precioImpl: 1650, precioMant: 0 },
  i_render: { nombre: 'Renderizado 3D y recorrido virtual', descripcion: 'Imágenes fotorrealistas y tour interactivo del proyecto.', precioImpl: 780, precioMant: 0 },
  i_staging: { nombre: 'Home staging para venta de inmueble', descripcion: 'Preparación y ambientación del inmueble para su comercialización.', precioImpl: 950, precioMant: 0 },
  // --- Catálogo de PAISAJISMO ---
  p_jardin_med: { nombre: 'Diseño de jardín mediterráneo', descripcion: 'Proyecto paisajístico con especies de bajo consumo hídrico.', precioImpl: 2800, precioMant: 0 },
  p_riego: { nombre: 'Sistema de riego por goteo automatizado', descripcion: 'Instalación de red de goteo con programador y sensores de humedad.', precioImpl: 1450, precioMant: 0 },
  p_pergola: { nombre: 'Pérgola bioclimática de aluminio 4x3 m', descripcion: 'Estructura de lamas orientables con canalón integrado.', precioImpl: 6900, precioMant: 0 },
  p_plantacion: { nombre: 'Suministro y plantación de especies autóctonas', descripcion: 'Aporte de tierra vegetal, plantación y primer riego.', precioImpl: 2100, precioMant: 0 },
  p_cesped: { nombre: 'Instalación de césped natural en tepes', descripcion: 'Preparación del terreno y colocación de tepe (precio por m²).', precioImpl: 14, precioMant: 0 },
  p_ilum_ext: { nombre: 'Iluminación exterior LED de jardín', descripcion: 'Balizas, proyectores y cableado estanco con control horario.', precioImpl: 1250, precioMant: 0 },
  p_estanque: { nombre: 'Construcción de estanque ornamental', descripcion: 'Excavación, impermeabilización, bomba y filtración.', precioImpl: 3400, precioMant: 0 },
  p_drenaje: { nombre: 'Sistema de drenaje y movimiento de tierras', descripcion: 'Nivelación, drenaje francés y evacuación de aguas.', precioImpl: 4600, precioMant: 0 },
  p_poda: { nombre: 'Poda y desbroce estacional', descripcion: 'Poda de arbolado y desbroce de parcela por temporada.', precioImpl: 240, precioMant: 0 },
  // --- Servicios recurrentes (cuota mensual, precioMant) ---
  p_mant_jardin: { nombre: 'Mantenimiento mensual de jardín', descripcion: 'Siega, poda, abonado y control fitosanitario mensual.', precioImpl: 0, precioMant: 180 },
  p_conservacion: { nombre: 'Plan de conservación de zonas verdes', descripcion: 'Programa anual de conservación para comunidad de propietarios.', precioImpl: 0, precioMant: 320 },
  p_mant_riego: { nombre: 'Mantenimiento del sistema de riego', descripcion: 'Revisión trimestral, ajuste de programación y reposición de goteros.', precioImpl: 0, precioMant: 75 },
};

type Estado = 'generada' | 'aceptada' | 'rechazada' | 'caducada';

interface Plantilla {
  numero: string;
  clienteIdx: number; // índice sobre la lista de clientes existentes (cada presupuesto → cliente distinto)
  estado: Estado;
  diasAtras: number; // antigüedad para dispersar createdAt (columna con @default(now), sobreescribible)
  lineas: { key: keyof typeof CATALOGO; cantidad: number }[];
  notas?: string;
}

// 12 presupuestos: 7 generada, 3 aceptada, 1 rechazada, 1 caducada. Mezcla interiorismo +
// paisajismo, con 2-5 líneas y algunos servicios recurrentes (006, 009, 012).
const PLANTILLAS: Plantilla[] = [
  { numero: 'PRES-2026-001', clienteIdx: 0, estado: 'generada', diasAtras: 8,
    lineas: [{ key: 'i_salon', cantidad: 1 }, { key: 'i_iluminacion', cantidad: 1 }, { key: 'i_render', cantidad: 1 }],
    notas: 'Reforma del salón con propuesta de iluminación domótica.' },
  { numero: 'PRES-2026-002', clienteIdx: 1, estado: 'generada', diasAtras: 15,
    lineas: [{ key: 'p_jardin_med', cantidad: 1 }, { key: 'p_riego', cantidad: 1 }, { key: 'p_cesped', cantidad: 120 }, { key: 'p_ilum_ext', cantidad: 1 }],
    notas: 'Jardín mediterráneo de bajo mantenimiento para chalet.' },
  { numero: 'PRES-2026-003', clienteIdx: 2, estado: 'aceptada', diasAtras: 40,
    lineas: [{ key: 'i_cocina', cantidad: 1 }, { key: 'i_mobiliario', cantidad: 1 }],
    notas: 'Reforma de cocina con isla y despensa a medida. Aceptado.' },
  { numero: 'PRES-2026-004', clienteIdx: 3, estado: 'generada', diasAtras: 6,
    lineas: [{ key: 'p_pergola', cantidad: 1 }, { key: 'p_plantacion', cantidad: 1 }],
    notas: 'Zona de sombra en terraza con pérgola bioclimática.' },
  { numero: 'PRES-2026-005', clienteIdx: 4, estado: 'aceptada', diasAtras: 33,
    lineas: [{ key: 'i_parquet', cantidad: 65 }, { key: 'i_cortinas', cantidad: 1 }, { key: 'i_render', cantidad: 1 }],
    notas: 'Cambio de suelo a parquet de roble en toda la vivienda. Aceptado.' },
  { numero: 'PRES-2026-006', clienteIdx: 5, estado: 'generada', diasAtras: 12,
    lineas: [{ key: 'p_jardin_med', cantidad: 1 }, { key: 'p_estanque', cantidad: 1 }, { key: 'p_ilum_ext', cantidad: 1 }, { key: 'p_mant_jardin', cantidad: 1 }],
    notas: 'Jardín con estanque ornamental y contrato de mantenimiento mensual.' },
  { numero: 'PRES-2026-007', clienteIdx: 6, estado: 'rechazada', diasAtras: 50,
    lineas: [{ key: 'i_vivienda', cantidad: 1 }],
    notas: 'Proyecto integral de vivienda. Rechazado (presupuesto fuera de rango).' },
  { numero: 'PRES-2026-008', clienteIdx: 7, estado: 'generada', diasAtras: 4,
    lineas: [{ key: 'i_microcemento', cantidad: 28 }, { key: 'i_iluminacion', cantidad: 1 }],
    notas: 'Baño con microcemento continuo y luz técnica.' },
  { numero: 'PRES-2026-009', clienteIdx: 8, estado: 'aceptada', diasAtras: 27,
    lineas: [{ key: 'p_drenaje', cantidad: 1 }, { key: 'p_cesped', cantidad: 200 }, { key: 'p_riego', cantidad: 1 }, { key: 'p_conservacion', cantidad: 1 }],
    notas: 'Urbanización de parcela con césped y plan de conservación anual. Aceptado.' },
  { numero: 'PRES-2026-010', clienteIdx: 9, estado: 'generada', diasAtras: 2,
    lineas: [{ key: 'i_staging', cantidad: 1 }, { key: 'i_render', cantidad: 1 }, { key: 'i_cortinas', cantidad: 1 }],
    notas: 'Home staging para poner el piso a la venta.' },
  { numero: 'PRES-2026-011', clienteIdx: 10, estado: 'caducada', diasAtras: 72,
    lineas: [{ key: 'p_pergola', cantidad: 1 }, { key: 'p_ilum_ext', cantidad: 1 }],
    notas: 'Pérgola de aluminio para porche. Presupuesto caducado.' },
  { numero: 'PRES-2026-012', clienteIdx: 11, estado: 'generada', diasAtras: 10,
    lineas: [{ key: 'i_mobiliario', cantidad: 1 }, { key: 'p_mant_jardin', cantidad: 1 }, { key: 'p_mant_riego', cantidad: 1 }],
    notas: 'Mobiliario a medida más mantenimiento de jardín y riego.' },
];

/** NIF/CIF demo determinista para el snapshot del cliente (los clientes reales no llevan CIF). */
function demoNif(i: number): string {
  return 'B' + String(70000000 + i * 111111).slice(0, 8);
}

/** Construye el snapshot del cliente con la MISMA forma que envía el formulario del front. */
function buildClienteSnapshot(c: { nombre: string; apellido: string | null; razonSocial: string | null; direccion: string | null; localidad: string | null; email: string | null; telefono: string | null }, idx: number) {
  const nombreCompleto = `${c.nombre}${c.apellido ? ' ' + c.apellido : ''}`.trim();
  const direccion = [c.direccion, c.localidad].filter(Boolean).join(', ');
  return {
    nombre: nombreCompleto,
    razonSocial: c.razonSocial || nombreCompleto,
    cif: demoNif(idx),
    direccion,
    email: c.email || '',
    telefono: c.telefono || '',
    contacto: nombreCompleto,
  };
}

async function main() {
  const business = await prisma.business.findUnique({ where: { id: BUSINESS_ID } });
  if (!business) {
    console.error(`ESCALATE: negocio ${BUSINESS_ID} no encontrado. Revisa DATABASE_URL / tenant.`);
    process.exit(1);
  }
  console.log(`\n== Seed presupuestos interiorismo/paisajismo — ${business.nombre} (${business.id}) ==\n`);

  // Clientes existentes del negocio (orden estable por createdAt asc). NO se crean clientes.
  const customers = await prisma.customer.findMany({
    where: { businessId: BUSINESS_ID, eliminadoEn: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true, nombre: true, apellido: true, razonSocial: true, direccion: true, localidad: true, email: true, telefono: true },
  });
  const maxIdx = Math.max(...PLANTILLAS.map((p) => p.clienteIdx));
  if (customers.length <= maxIdx) {
    console.error(`ESCALATE: se necesitan al menos ${maxIdx + 1} clientes; hay ${customers.length}.`);
    process.exit(1);
  }
  console.log(`Clientes disponibles: ${customers.length}. Generando ${PLANTILLAS.length} presupuestos...\n`);

  let creados = 0;
  let saltados = 0;
  let facturasCreadas = 0;

  for (const plan of PLANTILLAS) {
    const existente = await prisma.pedido.findFirst({
      where: { businessId: BUSINESS_ID, numero: plan.numero },
      include: { invoice: { select: { id: true } } },
    });

    const customer = customers[plan.clienteIdx];

    if (existente) {
      // Idempotencia: no se recrea. Si es `aceptada` y por algún motivo le falta la factura
      // (p. ej. un run previo que falló tras crear el pedido), se re-asegura.
      if (existente.estado === 'aceptada' && !existente.invoice) {
        const full = await prisma.pedido.findUniqueOrThrow({
          where: { id: existente.id },
          include: { lines: { orderBy: { posicion: 'asc' } } },
        });
        await prisma.$transaction(async (tx) => {
          await ensureInvoiceForPedido(tx as unknown as InvoiceCreateTx, full as unknown as PedidoForInvoice);
        });
        facturasCreadas++;
        console.log(`  ~ ${plan.numero} ya existía; factura re-asegurada.`);
      } else {
        console.log(`  = ${plan.numero} ya existe (${existente.estado}); se salta.`);
      }
      saltados++;
      continue;
    }

    // Líneas del catálogo → forma de PedidoLine. Totales SIEMPRE server-side (misma función
    // que POST /pedidos): nunca se calculan a mano.
    const lineInputs = plan.lineas.map((l, i) => {
      const p = CATALOGO[l.key];
      return {
        servicioId: '',
        nombre: p.nombre,
        descripcion: p.descripcion,
        cantidad: l.cantidad,
        precioImpl: p.precioImpl,
        precioMant: p.precioMant,
        posicion: i,
      };
    });
    const totals = computePedidoTotals(lineInputs, TASA_IVA);
    const clienteSnapshot = buildClienteSnapshot(customer, plan.clienteIdx);
    const createdAt = new Date(Date.now() - plan.diasAtras * 86400000);

    // Alta del presupuesto + (si `aceptada`) auto-factura en la MISMA transacción, igual que
    // el handler real de PUT /:id/status.
    await prisma.$transaction(async (tx) => {
      const pedido = await tx.pedido.create({
        data: {
          businessId: BUSINESS_ID,
          numero: plan.numero,
          customerId: customer.id,
          clienteSnapshot,
          emisorSnapshot: EMISOR,
          estado: plan.estado,
          subtotalImpl: totals.subtotalImpl,
          subtotalMant: totals.subtotalMant,
          totalImpl: totals.totalImpl,
          totalMant: totals.totalMant,
          tasaIva: TASA_IVA,
          diasValidez: DIAS_VALIDEZ,
          notas: plan.notas ?? null,
          createdAt,
          lines: { create: lineInputs },
        },
        include: { lines: { orderBy: { posicion: 'asc' } } },
      });

      if (plan.estado === 'aceptada') {
        await ensureInvoiceForPedido(tx as unknown as InvoiceCreateTx, pedido as unknown as PedidoForInvoice);
        facturasCreadas++;
      }
    });

    creados++;
    const totalDoc = (totals.totalImpl + totals.totalMant).toFixed(2);
    console.log(`  + ${plan.numero} → ${clienteSnapshot.nombre} · ${plan.estado} · ${plan.lineas.length} líneas · ${totalDoc} € (impl ${totals.totalImpl} / mant ${totals.totalMant})`);
  }

  // Verificación in situ.
  const pedidosCount = await prisma.pedido.count({ where: { businessId: BUSINESS_ID, eliminadoEn: null } });
  const aceptadas = await prisma.pedido.findMany({
    where: { businessId: BUSINESS_ID, estado: 'aceptada' },
    include: { invoice: { select: { id: true, total: true } } },
  });
  const aceptadasConFactura = aceptadas.filter((p) => p.invoice).length;

  console.log(`\n========================================================`);
  console.log(`RESUMEN`);
  console.log(`========================================================`);
  console.log(`Presupuestos creados este run: ${creados}`);
  console.log(`Presupuestos saltados (ya existían): ${saltados}`);
  console.log(`Facturas auto-creadas este run: ${facturasCreadas}`);
  console.log(`Total presupuestos del negocio: ${pedidosCount}`);
  console.log(`Aceptadas: ${aceptadas.length} / con factura: ${aceptadasConFactura}`);
  console.log(`========================================================\n`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
