#!/usr/bin/env node
/**
 * Generador guiado del CRM completo (OperaOS).
 *
 * Crea una copia independiente con SOLO los módulos elegidos (poda páginas del
 * front y montajes de rutas del backend de los módulos desactivados).
 *
 * Dos modos:
 *   node generar.mjs                  # DEPLOY (default): zip limpio, sin infra
 *                                     #   horneada. Escribe .env.example + DEPLOY.md.
 *                                     #   La BD/secretos/URLs se ponen en el panel
 *                                     #   del host (Vercel/Cloudflare) o se inyectan
 *                                     #   en runtime desde tu SaaS.
 *   node generar.mjs --local          # LOCAL: pregunta BD/puertos/JWT y deja un
 *                                     #   back/.env y front/.env.local listos para
 *                                     #   `npm run dev` en tu máquina.
 *   node generar.mjs --from manifest.json   # toma vertical/módulos de un manifest
 *
 * No instala nada ni necesita servicios corriendo: solo copia archivos y escribe
 * env/README. Requiere Node 18+.
 */
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
// Guard de ejecución directa: al importar desde tests no se arranca el CLI ni
// se abre readline (dejaría el proceso colgado esperando stdin).
const IS_MAIN = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
const rl = IS_MAIN ? createInterface({ input, output }) : null;

// Modo: DEPLOY por defecto; LOCAL solo con --local.
const LOCAL = process.argv.includes('--local');

// Schema de PostgreSQL: namespace en el DATABASE_URL. Casi siempre 'public' y no
// tiene que ver con schema.prisma (que ya va en el zip). Constante, no se pregunta.
const PG_SCHEMA = 'public';

// Puerto único y ESTABLE por proyecto (derivado del slug). Evita que cada CRM
// generado choque con la consola fuente (3002) o entre sí: distinto puerto =
// distinto origin = localStorage aislado. Estable (no aleatorio por arranque)
// para no perder el estado del tenant en cada reinicio del dev server.
function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0; }
  return h;
}
function portFromSlug(slug, base, span = 900) { return String(base + (hashStr(slug) % span)); }

// Módulos activables (dashboard y configuración van siempre).
const MODULES = ['clientes', 'citas', 'servicios', 'empleados', 'fichaje', 'vacaciones', 'productos', 'ventas', 'facturas', 'estadisticas', 'marketing'];

// módulo -> carpeta de página del front
const FRONT_ROUTE = {
  clientes: 'clientes', citas: 'citas', servicios: 'servicios', empleados: 'empleados',
  fichaje: 'fichaje', vacaciones: 'vacaciones', productos: 'productos', ventas: 'ventas',
  facturas: 'facturas', estadisticas: 'estadisticas', marketing: 'marketing',
};
// módulo -> ruta montada en el backend (routes/index.ts).
// `estadisticas` es front-only (localStorage), no tiene backend → sin entrada aquí.
const BACK_MOUNT = {
  clientes: '/customers', citas: '/bookings', servicios: '/services', empleados: '/employees',
  fichaje: '/fichajes', vacaciones: '/time-off', productos: '/products', ventas: '/sales',
  facturas: '/invoices', marketing: '/campaigns',
};
// Dependencias blandas (espejo de front/lib/config/modules.ts `recommends`): si un
// módulo activo recomienda otro que NO está activo, se avisa (no se bloquea) porque
// la página puede enlazar a la del módulo podado. `web` (sitio público en app/web)
// no es módulo de panel del catálogo → no se poda por manifest, va siempre.
const RECOMMENDS = {
  citas: ['servicios'], fichaje: ['empleados'], vacaciones: ['empleados'],
  ventas: ['productos'], facturas: ['clientes'], marketing: ['clientes'], estadisticas: ['clientes'],
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

// Copia recursiva excluyendo artefactos de build y material sensible (dumps,
// backups, logs, credenciales). El paquete generado va a un cliente: nada de
// datos de producción ni secretos debe cruzar esta frontera.
const EXCLUDE_DIRS = new Set(['node_modules', '.next', 'dist', '.git', '.turbo', 'generated', 'backups', 'coverage', 'tmp']);
// Extensiones sensibles como SEGMENTO del nombre (no solo sufijo final): cubre
// tanto el caso simple (backup.sql, app.log) como el compuesto por rotación o
// compresión (backup.sql.gz, dump.sql.bak, error.log.1). endsWith() plano se
// queda corto ahí porque el nombre no termina literalmente en ".sql"/".log".
// Ante la duda, prefiere pecar de exclusión (paquete va a un cliente externo).
const SENSITIVE_EXT_RE = /\.(sql|dump|log)(\.|$)/i;
// Excepción al bloqueo de .sql: migraciones legítimas de Prisma bajo
// prisma/migrations/**/migration.sql (necesarias para `prisma migrate deploy`
// en el paquete generado). Cualquier otro .sql (dumps, scripts sueltos como
// prisma/migrate-negocio-generado.sql) sigue excluido. .dump y .log NUNCA
// llevan excepción.
const MIGRATIONS_DIR_RE = /(^|\/)prisma\/migrations(\/|$)/;
// .env* en cualquier posición del nombre: cubre TANTO los que EMPIEZAN por
// .env (.env, .env.local, .env.docker) COMO los que TERMINAN en .env
// (production.env, secrets.env, sin punto inicial) — startsWith('.env') solo
// cazaba el primer caso y dejaba pasar el segundo íntegro. Sin falsos
// positivos: "myenvfile.txt" y "environment.ts" no llevan ".env" como
// segmento propio y no matchean.
const ENV_NAME_RE = /(^|\.)env(\.|$)/i;
const EXCLUDE_FILE_SUFFIXES = ['.pem', '.key'];
// `relDir` es la ruta relativa (separador '/', sin barra inicial) del directorio
// PADRE del entry dentro del árbol que se está copiando (p. ej. "prisma/migrations/20260616_x"
// cuando el entry es "migration.sql"). Parámetro explícito (no estado de módulo)
// para que la función siga siendo trivialmente testeable.
export function shouldCopy(name, isDir, relDir = '') {
  if (isDir) return !EXCLUDE_DIRS.has(name);
  const lower = name.toLowerCase();
  if (EXCLUDE_FILE_SUFFIXES.some((suffix) => lower.endsWith(suffix))) return false;
  if (SENSITIVE_EXT_RE.test(lower)) {
    // Excepción: migration.sql legítimo de Prisma bajo prisma/migrations/**.
    const isMigrationSql = lower.endsWith('.sql') && MIGRATIONS_DIR_RE.test(relDir);
    if (!isMigrationSql) return false;
  }
  // .env* nunca se copia, salvo las plantillas *.example (intencionales).
  if (ENV_NAME_RE.test(lower) && !lower.endsWith('.example')) return false;
  return true;
}
export function copyDir(src, dest, relDir = '') {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (!shouldCopy(entry.name, entry.isDirectory(), relDir)) continue;
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d, relDir ? `${relDir}/${entry.name}` : entry.name);
    else fs.copyFileSync(s, d);
  }
}

async function main() {
  console.log(`\n\x1b[1m=== Generador del CRM completo (OperaOS) — modo ${LOCAL ? 'LOCAL' : 'DEPLOY'} ===\x1b[0m`);
  if (!LOCAL) console.log('\x1b[2mZip limpio sin infra horneada. BD/secretos/URLs se configuran en el host (ver DEPLOY.md). Usa --local para un .env listo para tu máquina.\x1b[0m');

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
  // Puertos únicos y estables para este proyecto (front 3100-3999, back 4100-4999).
  const derivedFrontPort = portFromSlug(slug, 3100);
  const derivedBackPort = portFromSlug(slug, 4100);

  section('2) Módulos a incluir');
  let active;
  // `activeModules` incluye TODOS los módulos activados (incl. front-only como
  // estadisticas); `dataModules` solo los que tienen tabla. Preferir el primero
  // para no perder módulos seleccionados.
  const fromManifest = manifest?.activeModules ?? manifest?.dataModules;
  if (fromManifest) {
    active = fromManifest.filter((m) => MODULES.includes(m));
    console.log(`Del manifest: ${active.join(', ')}`);
  } else {
    console.log(`Disponibles: ${MODULES.join(', ')}`);
    const def = MODULES.join(',');
    const raw = await ask('Lista de módulos activos (coma)', def);
    active = raw.split(',').map((s) => s.trim()).filter((m) => MODULES.includes(m));
  }
  const activeSet = new Set(active);

  // Aviso de dependencias blandas no satisfechas (no bloquea).
  for (const m of active) {
    for (const dep of RECOMMENDS[m] ?? []) {
      if (!activeSet.has(dep)) {
        console.log(`\x1b[33m  ! "${m}" recomienda "${dep}", que NO está activo — puede haber enlaces rotos.\x1b[0m`);
      }
    }
  }

  // ---- Infra: SOLO en modo LOCAL ----
  let db = null, backPort = derivedBackPort, frontPort = derivedFrontPort, jwtSecret = '', connectApi = true;
  if (LOCAL) {
    section('3) Base de datos (PostgreSQL, local)');
    const dbName = await ask('Nombre de la base de datos', slug.replace(/-/g, '_'));
    const dbHost = await ask('Host', 'localhost');
    const dbPort = await ask('Puerto', '5432');
    const dbUser = await ask('Usuario', 'postgres');
    const dbPass = await ask('Contraseña', 'postgres');
    db = { name: dbName, host: dbHost, port: dbPort, user: dbUser, pass: dbPass, schema: PG_SCHEMA };

    section('4) Backend y seguridad (local)');
    backPort = await ask('Puerto del backend', derivedBackPort);
    frontPort = await ask('Puerto del front', derivedFrontPort);
    const jwt = await ask('JWT_SECRET (deja vacío para autogenerar)', '');
    jwtSecret = jwt || ('op_' + crypto.randomBytes(24).toString('hex'));

    section('5) Conexión front ↔ backend (local)');
    connectApi = await askYesNo('¿El front debe consumir esta API directamente?', true);
  }

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

  // Fijar el puerto del front en su package.json (los scripts traen `-p 3002`
  // hardcodeado; sin esto la copia chocaría con la consola fuente en localStorage).
  const fpkgPath = path.join(out, 'front', 'package.json');
  if (fs.existsSync(fpkgPath)) {
    const fpkg = JSON.parse(fs.readFileSync(fpkgPath, 'utf8'));
    if (fpkg.scripts) {
      if (fpkg.scripts.dev) fpkg.scripts.dev = fpkg.scripts.dev.replace(/-p\s+\d+/, `-p ${frontPort}`);
      if (fpkg.scripts.start) fpkg.scripts.start = fpkg.scripts.start.replace(/-p\s+\d+/, `-p ${frontPort}`);
    }
    fs.writeFileSync(fpkgPath, JSON.stringify(fpkg, null, 2) + '\n');
    console.log(`  - Puerto del front fijado a ${frontPort} (back ${backPort}).`);
  }

  // Hornear la config del tenant para arranque autónomo: el front generado arranca
  // con su propio branding/terminología/módulos sin pasar por la consola/onboarding.
  // Solo si el manifest la trae; sin manifest la copia arranca como consola.
  if (manifest && manifest.business && manifest.modules && manifest.branding && manifest.terminology) {
    const tenant = {
      business: manifest.business,
      modules: manifest.modules,
      terminology: manifest.terminology,
      branding: manifest.branding,
      setupComplete: true,
    };
    const genPath = path.join(out, 'front', 'lib', 'config', 'generated-tenant.ts');
    fs.writeFileSync(genPath,
      `// Generado por generar.mjs — config del tenant (arranque autónomo).\n`
      + `export const GENERATED_TENANT: Record<string, unknown> | null = ${JSON.stringify(tenant, null, 2)};\n`);
    console.log('  - Config del tenant horneada en front/lib/config/generated-tenant.ts');
  }

  // Podar páginas del front de módulos desactivados
  for (const m of MODULES) {
    if (!activeSet.has(m)) {
      const route = FRONT_ROUTE[m];
      if (!route) continue; // sin carpeta mapeada: nada que podar (evita path.join undefined)
      const dir = path.join(out, 'front', 'app', '(crm)', route);
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
        if (!mount) continue; // módulo front-only (p. ej. estadisticas): nada que podar en backend
        idx = idx.replace(new RegExp(`^(api\\.use\\('${mount.replace('/', '\\/')}'.*)$`, 'm'), '// [módulo desactivado] $1');
      }
    }
    fs.writeFileSync(idxPath, idx);
  }

  if (LOCAL) writeLocalArtifacts({ out, nombre, slug, active, db, backPort, frontPort, jwtSecret, connectApi });
  else writeDeployArtifacts({ out, nombre, slug, active, backPort, frontPort });

  // Manifest del proyecto generado
  fs.writeFileSync(path.join(out, 'PROYECTO.json'), JSON.stringify({
    name: nombre, slug, mode: LOCAL ? 'local' : 'deploy', modules: active,
    db: db ? { name: db.name, host: db.host, port: db.port, user: db.user, schema: db.schema } : null,
    backPort, frontPort,
    connectApi: LOCAL ? connectApi : null, generatedAt: new Date().toISOString(),
  }, null, 2));

  rl.close();
  console.log(`\n\x1b[32m✓ CRM generado en: generated/${slug}\x1b[0m`);
  console.log('  - Módulos incluidos:', active.join(', '));
  if (LOCAL) {
    console.log('  - back/.env y front/.env.local escritos con tus datos.');
    console.log(`\nSiguiente: abre generated/${slug}/COMO_ARRANCAR.md y sigue los pasos.`);
  } else {
    console.log('  - back/.env.example y front/.env.local.example con placeholders (sin secretos ni localhost).');
    console.log(`\nSiguiente: abre generated/${slug}/DEPLOY.md y configura las env vars en tu host.`);
  }
}

// ── Modo LOCAL: .env reales + README de arranque en tu máquina ──────────────
function writeLocalArtifacts({ out, nombre, slug, active, db, backPort, frontPort, jwtSecret, connectApi }) {
  const pass = encodeURIComponent(db.pass);
  const databaseUrl = `postgresql://${db.user}:${pass}@${db.host}:${db.port}/${db.name}?schema=${db.schema}`;
  fs.writeFileSync(path.join(out, 'back', '.env'), `# Generado por generar.mjs (LOCAL) para ${nombre}
DATABASE_URL="${databaseUrl}"
JWT_SECRET="${jwtSecret}"
PORT=${backPort}
CORS_ORIGIN="http://localhost:${frontPort}"
`);
  fs.writeFileSync(path.join(out, 'front', '.env.local'), `# Generado por generar.mjs (LOCAL) para ${nombre}
NEXT_PUBLIC_API_URL=${connectApi ? `http://localhost:${backPort}` : ''}
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
`);

  fs.writeFileSync(path.join(out, 'COMO_ARRANCAR.md'), `# ${nombre} — CRM generado (local)

Módulos: ${active.join(', ')}

## 1. Backend
\`\`\`bash
cd back
npm install
npm run prisma:generate
npm run migrate:deploy   # aplica las migraciones en ${db.name}
npm run seed         # datos demo (opcional)
npm run dev          # http://localhost:${backPort}
\`\`\`
El \`.env\` ya está escrito con tu base de datos (${db.name} en ${db.host}:${db.port}).

## 2. Front
\`\`\`bash
cd front
npm install
npm run dev          # http://localhost:${frontPort}
\`\`\`
${connectApi ? `El front ya apunta a la API (NEXT_PUBLIC_API_URL=http://localhost:${backPort}).` : 'El front arranca en modo local (sin API).'}

> Antes asegúrate de tener PostgreSQL arrancado y la base de datos \`${db.name}\` creada;
> \`npm run migrate:deploy\` aplica las migraciones sobre ella.
`);
}

// ── Modo DEPLOY: .env.example con placeholders + guía de despliegue ─────────
function writeDeployArtifacts({ out, nombre, slug, active, backPort, frontPort }) {
  fs.writeFileSync(path.join(out, 'back', '.env.example'), `# === Backend de ${nombre} ===
# NO comitees secretos. Define estas variables en el panel de tu host
# (Vercel/Cloudflare/Railway/Render…) o inyéctalas en runtime desde tu SaaS.

# Conexión PostgreSQL. La gestionas tú en runtime/host:
DATABASE_URL=            # postgresql://USER:PASS@HOST:5432/${slug.replace(/-/g, '_')}?schema=${PG_SCHEMA}

# Secreto de firma de sesión. Genera uno fuerte: openssl rand -hex 32
JWT_SECRET=

# Puerto: solo relevante en hosts con proceso largo. En Vercel/Cloudflare
# (serverless/edge) lo gestiona la plataforma; puedes omitirlo.
PORT=${backPort}

# Origen permitido por CORS = dominio REAL del front (no localhost).
CORS_ORIGIN=            # https://tu-front.com
`);

  fs.writeFileSync(path.join(out, 'front', '.env.local.example'), `# === Front de ${nombre} ===
# Las NEXT_PUBLIC_* se HORNEAN en build. Defínelas en el panel del host
# (estarán disponibles al compilar). No necesitas un .env.local en deploy.

NEXT_PUBLIC_API_URL=        # URL pública de la API, p. ej. https://api.tu-app.com
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
`);

  fs.writeFileSync(path.join(out, 'DEPLOY.md'), `# ${nombre} — Despliegue

Módulos: ${active.join(', ')}

Este zip NO trae infra horneada (sin BD, sin secretos, sin localhost). Tú defines
las variables en el panel de tu host o las inyectas en runtime desde tu SaaS.

## Variables (panel del host)

### Backend
| Variable | Valor |
|----------|-------|
| \`DATABASE_URL\` | \`postgresql://USER:PASS@HOST:5432/DB?schema=${PG_SCHEMA}\` (la inyectas tú) |
| \`JWT_SECRET\` | secreto fuerte — \`openssl rand -hex 32\` |
| \`CORS_ORIGIN\` | dominio real del front, p. ej. \`https://tu-front.com\` |
| \`PORT\` | omitir en Vercel/Cloudflare (lo gestiona la plataforma) |

### Front
| Variable | Valor |
|----------|-------|
| \`NEXT_PUBLIC_API_URL\` | URL pública de la API, p. ej. \`https://api.tu-app.com\` |

> \`NEXT_PUBLIC_*\` se hornea en BUILD: defínela ANTES de compilar en el panel.

## Notas
- **Puertos**: Vercel/Cloudflare asignan el routing; no fijes \`PORT\` ni uses \`localhost\`.
- **BD en runtime**: si tu SaaS inyecta la conexión, deja \`DATABASE_URL\` solo en el
  entorno de ejecución; Prisma la lee al arrancar.
- **Migraciones**: ejecuta \`prisma migrate deploy\` contra la BD destino
  como paso de release, con \`DATABASE_URL\` ya apuntando a producción.
- Plantillas de variables en \`back/.env.example\` y \`front/.env.local.example\`.

## Arrancar en local (si lo necesitas)
Regenera en modo local: \`node generar.mjs --local\` (pregunta BD/puertos/JWT y deja
un \`.env\` listo para \`npm run dev\`).
`);
}

if (IS_MAIN) main().catch((e) => { console.error(e); rl.close(); process.exit(1); });
