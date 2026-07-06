import 'dotenv/config';
import { prisma } from '../prisma.js';

// Seed EN VIVO del catálogo "Productos y tarifas" (modelo `Service`) para la demo de
// "Comercial Demo IA" — crm 5e. Los 12 presupuestos sembrados por
// seed-presupuestos-demo-live.ts usaron líneas LIBRES (servicioId: '') que NO estaban en el
// catálogo, por lo que "Productos y tarifas" quedaba VACÍO y esos productos no eran reutilizables
// al crear un nuevo presupuesto. Este seed inserta los MISMOS productos de interiorismo /
// paisajismo / mantenimiento como filas `service` del negocio, para que aparezcan en el catálogo
// y sean seleccionables.
//
// ADITIVO: no toca los 12 presupuestos ni sus totales. Solo puebla el catálogo.
//
// Idempotente por (businessId, nombre): se salta cualquier servicio cuyo nombre ya exista en el
// negocio. Reejecutable.
//
// El modelo `Service` tiene un ÚNICO campo `precio`: para los productos recurrentes (cuota
// mensual) se usa esa cuota como `precio`. `descripcion` y `categoria` se conservan.
//
// Ejecutar: cd back && npx tsx src/scripts/seed-servicios-catalogo-demo-live.ts

const BUSINESS_ID = 'cmr84anhw00005ofx8ba2w4sh'; // "Comercial Demo IA" (demo en vivo)

/** Producto del catálogo. `precioImpl` = pago único/ud; `precioMant` = cuota mensual/ud. */
interface Producto {
  nombre: string;
  descripcion: string;
  precioImpl: number;
  precioMant: number;
  categoria: string;
}

// Mismo catálogo que seed-presupuestos-demo-live.ts (interiorismo + paisajismo + recurrentes),
// enriquecido con `categoria` para agruparlos en "Productos y tarifas".
const CATALOGO: Producto[] = [
  // --- INTERIORISMO ---
  { nombre: 'Proyecto de interiorismo integral de salón', descripcion: 'Diseño conceptual, distribución, memoria de calidades y planos de detalle.', precioImpl: 3200, precioMant: 0, categoria: 'Interiorismo' },
  { nombre: 'Diseño y dirección de obra de vivienda completa', descripcion: 'Proyecto integral llave en mano con dirección de obra.', precioImpl: 8500, precioMant: 0, categoria: 'Interiorismo' },
  { nombre: 'Reforma integral de cocina', descripcion: 'Demolición, fontanería, electricidad, mobiliario y electrodomésticos.', precioImpl: 12500, precioMant: 0, categoria: 'Interiorismo' },
  { nombre: 'Mobiliario a medida (armarios y librería)', descripcion: 'Fabricación e instalación en melamina y chapa de roble.', precioImpl: 4200, precioMant: 0, categoria: 'Interiorismo' },
  { nombre: 'Suministro e instalación de parquet de roble', descripcion: 'Tarima flotante de roble europeo, incluye rodapié (precio por m²).', precioImpl: 48, precioMant: 0, categoria: 'Interiorismo' },
  { nombre: 'Microcemento en paredes y suelo de baño', descripcion: 'Aplicación continua de microcemento con acabado sellado (precio por m²).', precioImpl: 65, precioMant: 0, categoria: 'Interiorismo' },
  { nombre: 'Proyecto de iluminación técnica LED', descripcion: 'Cálculo lumínico, selección de luminarias y control domótico.', precioImpl: 1900, precioMant: 0, categoria: 'Interiorismo' },
  { nombre: 'Cortinas y tapicería a medida', descripcion: 'Confección, suministro e instalación de cortinas y estores.', precioImpl: 1650, precioMant: 0, categoria: 'Interiorismo' },
  { nombre: 'Renderizado 3D y recorrido virtual', descripcion: 'Imágenes fotorrealistas y tour interactivo del proyecto.', precioImpl: 780, precioMant: 0, categoria: 'Interiorismo' },
  { nombre: 'Home staging para venta de inmueble', descripcion: 'Preparación y ambientación del inmueble para su comercialización.', precioImpl: 950, precioMant: 0, categoria: 'Interiorismo' },
  // --- PAISAJISMO ---
  { nombre: 'Diseño de jardín mediterráneo', descripcion: 'Proyecto paisajístico con especies de bajo consumo hídrico.', precioImpl: 2800, precioMant: 0, categoria: 'Paisajismo' },
  { nombre: 'Sistema de riego por goteo automatizado', descripcion: 'Instalación de red de goteo con programador y sensores de humedad.', precioImpl: 1450, precioMant: 0, categoria: 'Paisajismo' },
  { nombre: 'Pérgola bioclimática de aluminio 4x3 m', descripcion: 'Estructura de lamas orientables con canalón integrado.', precioImpl: 6900, precioMant: 0, categoria: 'Paisajismo' },
  { nombre: 'Suministro y plantación de especies autóctonas', descripcion: 'Aporte de tierra vegetal, plantación y primer riego.', precioImpl: 2100, precioMant: 0, categoria: 'Paisajismo' },
  { nombre: 'Instalación de césped natural en tepes', descripcion: 'Preparación del terreno y colocación de tepe (precio por m²).', precioImpl: 14, precioMant: 0, categoria: 'Paisajismo' },
  { nombre: 'Iluminación exterior LED de jardín', descripcion: 'Balizas, proyectores y cableado estanco con control horario.', precioImpl: 1250, precioMant: 0, categoria: 'Paisajismo' },
  { nombre: 'Construcción de estanque ornamental', descripcion: 'Excavación, impermeabilización, bomba y filtración.', precioImpl: 3400, precioMant: 0, categoria: 'Paisajismo' },
  { nombre: 'Sistema de drenaje y movimiento de tierras', descripcion: 'Nivelación, drenaje francés y evacuación de aguas.', precioImpl: 4600, precioMant: 0, categoria: 'Paisajismo' },
  { nombre: 'Poda y desbroce estacional', descripcion: 'Poda de arbolado y desbroce de parcela por temporada.', precioImpl: 240, precioMant: 0, categoria: 'Paisajismo' },
  // --- SERVICIOS RECURRENTES (cuota mensual → se usa como `precio`) ---
  { nombre: 'Mantenimiento mensual de jardín', descripcion: 'Siega, poda, abonado y control fitosanitario mensual.', precioImpl: 0, precioMant: 180, categoria: 'Mantenimiento' },
  { nombre: 'Plan de conservación de zonas verdes', descripcion: 'Programa anual de conservación para comunidad de propietarios.', precioImpl: 0, precioMant: 320, categoria: 'Mantenimiento' },
  { nombre: 'Mantenimiento del sistema de riego', descripcion: 'Revisión trimestral, ajuste de programación y reposición de goteros.', precioImpl: 0, precioMant: 75, categoria: 'Mantenimiento' },
];

async function main() {
  const business = await prisma.business.findUnique({ where: { id: BUSINESS_ID } });
  if (!business) {
    console.error(`ESCALATE: negocio ${BUSINESS_ID} no encontrado. Revisa DATABASE_URL / tenant.`);
    process.exit(1);
  }
  console.log(`\n== Seed catálogo "Productos y tarifas" — ${business.nombre} (${business.id}) ==\n`);

  let creados = 0;
  let saltados = 0;

  for (const p of CATALOGO) {
    // Idempotencia por (negocio, nombre): no se recrea un producto ya existente.
    const existente = await prisma.service.findFirst({
      where: { businessId: BUSINESS_ID, nombre: p.nombre },
      select: { id: true },
    });
    if (existente) {
      saltados++;
      console.log(`  = ${p.nombre} ya existe; se salta.`);
      continue;
    }

    // Precio único del modelo Service: pago único si lo hay, si no la cuota mensual.
    const precio = p.precioImpl > 0 ? p.precioImpl : p.precioMant;

    await prisma.service.create({
      data: {
        businessId: BUSINESS_ID,
        nombre: p.nombre,
        descripcion: p.descripcion,
        categoria: p.categoria,
        precio,
        // Productos comerciales documentales: no son citas reservables online ni requieren
        // profesional/recurso asignado (no ensucian los flujos de agenda/booking).
        requiereProfesional: false,
        reservableOnline: false,
        activo: true,
      },
    });
    creados++;
    console.log(`  + ${p.nombre} · ${p.categoria} · ${precio} €`);
  }

  const total = await prisma.service.count({ where: { businessId: BUSINESS_ID } });

  console.log(`\n========================================================`);
  console.log(`RESUMEN`);
  console.log(`========================================================`);
  console.log(`Servicios creados este run: ${creados}`);
  console.log(`Servicios saltados (ya existían): ${saltados}`);
  console.log(`Total servicios del negocio: ${total}`);
  console.log(`========================================================\n`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
