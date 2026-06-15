#!/usr/bin/env node
/**
 * Generador guiado del CRM completo (OperaOS).
 *
 * Crea una copia independiente y arrancable (back + front) con SOLO los módulos
 * elegidos, y escribe el `.env` del backend y el `.env.local` del front con los
 * datos que vas introduciendo paso a paso (nombre de BD, conexión, credenciales,
 * puertos, secreto JWT…).
 *
 * Uso:
 *   node generar.mjs                  # asistente interactivo paso a paso
 *   node generar.mjs --from manifest.json   # toma vertical/módulos de un manifest
 *
 * No instala nada ni necesita servicios corriendo: solo copia archivos y escribe
 * el .env. Requiere Node 18+.
 */
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const rl = createInterface({ input, output });

// Módulos activables (dashboard y configuración van siempre).
const MODULES = ['clientes', 'citas', 'servicios', 'empleados', 'fichaje', 'vacaciones', 'productos', 'ventas', 'marketing'];

// módulo -> carpeta de página del front
const FRONT_ROUTE = {
  clientes: 'clientes', citas: 'citas', servicios: 'servicios', empleados: 'empleados',
  fichaje: 'fichaje', vacaciones: 'vacaciones', productos: 'productos', ventas: 'ventas', marketing: 'marketing',
};
// módulo -> ruta montada en el backend (routes/index.ts)
const BACK_MOUNT = {
  clientes: '/customers', citas: '/bookings', servicios: '/services', empleados: '/employees',
  fichaje: '/fichajes', vacaciones: '/time-off', productos: '/products', ventas: '/sales', marketing: '/campaigns',
};

function slugify(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'proyecto';
}
async function ask(q, def) {
  const suffix = def !== undefined && def !== '' ? ` [${def}]` : '';
  const a = (await rl.question(`${q}${suffix}: `)).trim();
  return a === '' && def !== undefined ? def : a;
}
async function askYesNo(q, def = true) {
  const a = (await ask(`${q} (s/n)`, def ? 's' : 'n')).toLowerCase();
  return a.startsWith('s') || a.startsWith('y');
}
function section(title) { console.log(`\n\x1b[1m\x1b[33m${title}\x1b[0m`); }

// Copia recursiva excluyendo artefactos.
const EXCLUDE = new Set(['node_modules', '.next', 'dist', '.git', '.turbo', 'generated', '.env', '.env.local']);
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (EXCLUDE.has(entry.name)) continue;
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

async function main() {
  console.log('\n\x1b[1m=== Generador del CRM completo (OperaOS) ===\x1b[0m');

  // Manifest opcional
  let manifest = null;
  const fromIdx = process.argv.indexOf('--from');
  if (fromIdx >= 0 && process.argv[fromIdx + 1]) {
    manifest = JSON.parse(fs.readFileSync(process.argv[fromIdx + 1], 'utf8'));
    console.log(`Manifest cargado: ${manifest.name} (${(manifest.dataModules || []).join(', ')})`);
  }

  // Comprobaciones
  if (!fs.existsSync(path.join(ROOT, 'front')) || !fs.existsSync(path.join(ROOT, 'back'))) {
    console.error('\n\x1b[31mError: ejecuta este script desde la raíz de SaaS_Negocios (debe contener front/ y back/).\x1b[0m');
    process.exit(1);
  }

  section('1) Proyecto');
  const nombre = await ask('Nombre del negocio/cliente', manifest?.name ?? 'Mi Negocio');
  const slug = slugify(await ask('Identificador (slug) de la carpeta', slugify(nombre)));

  section('2) Módulos a incluir');
  let active;
  if (manifest?.dataModules) {
    active = manifest.dataModules.filter((m) => MODULES.includes(m));
    console.log(`Del manifest: ${active.join(', ')}`);
  } else {
    console.log(`Disponibles: ${MODULES.join(', ')}`);
    const def = MODULES.join(',');
    const raw = await ask('Lista de módulos activos (coma)', def);
    active = raw.split(',').map((s) => s.trim()).filter((m) => MODULES.includes(m));
  }
  const activeSet = new Set(active);

  section('3) Base de datos (PostgreSQL)');
  const dbName = await ask('Nombre de la base de datos', slug.replace(/-/g, '_'));
  const dbHost = await ask('Host', 'localhost');
  const dbPort = await ask('Puerto', '5432');
  const dbUser = await ask('Usuario', 'postgres');
  const dbPass = await ask('Contraseña', 'postgres');
  const dbSchema = await ask('Schema', 'public');

  section('4) Backend y seguridad');
  const backPort = await ask('Puerto del backend', '4000');
  const frontPort = await ask('Puerto del front', '3002');
  const jwt = await ask('JWT_SECRET (deja vacío para autogenerar)', '');
  const jwtSecret = jwt || ('op_' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2));

  section('5) Conexión front ↔ backend');
  const connectApi = await askYesNo('¿El front debe consumir esta API directamente?', true);

  // ---- Generación ----
  const out = path.join(ROOT, 'generated', slug);
  if (fs.existsSync(out)) {
    const ow = await askYesNo(`\nLa carpeta generated/${slug} ya existe. ¿Sobrescribir?`, false);
    if (!ow) { console.log('Cancelado.'); rl.close(); return; }
    fs.rmSync(out, { recursive: true, force: true });
  }

  console.log('\nCopiando backend y front…');
  copyDir(path.join(ROOT, 'back'), path.join(out, 'back'));
  copyDir(path.join(ROOT, 'front'), path.join(out, 'front'));

  // Podar páginas del front de módulos desactivados
  for (const m of MODULES) {
    if (!activeSet.has(m)) {
      const dir = path.join(out, 'front', 'app', '(panel)', FRONT_ROUTE[m]);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  // Podar montajes de rutas del backend desactivados (comenta las líneas)
  const idxPath = path.join(out, 'back', 'src', 'routes', 'index.ts');
  if (fs.existsSync(idxPath)) {
    let idx = fs.readFileSync(idxPath, 'utf8');
    for (const m of MODULES) {
      if (!activeSet.has(m)) {
        const mount = BACK_MOUNT[m];
        idx = idx.replace(new RegExp(`^(api\\.use\\('${mount.replace('/', '\\/')}'.*)$`, 'm'), '// [módulo desactivado] $1');
      }
    }
    fs.writeFileSync(idxPath, idx);
  }

  // Escribir .env del backend
  const pass = encodeURIComponent(dbPass);
  const databaseUrl = `postgresql://${dbUser}:${pass}@${dbHost}:${dbPort}/${dbName}?schema=${dbSchema}`;
  const backEnv = `# Generado por generar.mjs para ${nombre}
DATABASE_URL="${databaseUrl}"
JWT_SECRET="${jwtSecret}"
PORT=${backPort}
CORS_ORIGIN="http://localhost:${frontPort}"
`;
  fs.writeFileSync(path.join(out, 'back', '.env'), backEnv);

  // Escribir .env.local del front
  const frontEnv = `# Generado por generar.mjs para ${nombre}
NEXT_PUBLIC_API_URL=${connectApi ? `http://localhost:${backPort}` : ''}
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
`;
  fs.writeFileSync(path.join(out, 'front', '.env.local'), frontEnv);

  // Manifest del proyecto generado
  fs.writeFileSync(path.join(out, 'PROYECTO.json'), JSON.stringify({
    name: nombre, slug, modules: active, db: { name: dbName, host: dbHost, port: dbPort, user: dbUser, schema: dbSchema },
    backPort, frontPort, connectApi, generatedAt: new Date().toISOString(),
  }, null, 2));

  // README con el paso a paso
  fs.writeFileSync(path.join(out, 'COMO_ARRANCAR.md'), `# ${nombre} — CRM generado

Módulos: ${active.join(', ')}

## 1. Backend
\`\`\`bash
cd back
npm install
npm run prisma:generate
npm run db:push      # crea las tablas en ${dbName}
npm run seed         # datos demo (opcional)
npm run dev          # http://localhost:${backPort}
\`\`\`
El \`.env\` ya está escrito con tu base de datos (${dbName} en ${dbHost}:${dbPort}).

## 2. Front
\`\`\`bash
cd front
npm install
npm run dev          # http://localhost:${frontPort}
\`\`\`
${connectApi ? `El front ya apunta a la API (NEXT_PUBLIC_API_URL=http://localhost:${backPort}).` : 'El front arranca en modo local (sin API).'}

> Antes asegúrate de tener PostgreSQL arrancado y la base de datos \`${dbName}\` creada
> (o deja que \`prisma db push\` la use si tu usuario tiene permisos).
`);

  rl.close();
  console.log(`\n\x1b[32m✓ CRM generado en: generated/${slug}\x1b[0m`);
  console.log('  - back/.env y front/.env.local escritos con tus datos.');
  console.log('  - Módulos incluidos:', active.join(', '));
  console.log(`\nSiguiente: abre generated/${slug}/COMO_ARRANCAR.md y sigue los pasos.`);
}

main().catch((e) => { console.error(e); rl.close(); process.exit(1); });
