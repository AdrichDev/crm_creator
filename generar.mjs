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
 * Barrera de entrega (security-wave-2 S3/S4): tras copiar, el paquete generado
 * se escanea y se RECHAZA (borrándolo) si contiene volcados/backups/logs, un
 * `.env` real (solo se admiten plantillas `*.example`), material de clave
 * privada, el valor de un secreto del operador o una forma de secreto
 * (`sk-...`, JWT con role service_role). Lo que se entrega a un cliente nunca
 * lleva secretos del operador.
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

// ── Barrera post-copia (security-wave-2 S3/S4) ──────────────────────────────
// `copyDir` filtra por nombre al copiar, pero el paquete generado se entrega a
// un CLIENTE: una segunda barrera comprueba el RESULTADO (por si un cambio
// futuro en la denylist deja pasar algo, o por si aparece material sensible con
// otra forma). Rechaza y BORRA el paquete si contiene volcados/backups/logs,
// ficheros de entorno reales, material de clave privada, el valor literal de un
// secreto del operador o una forma generica de secreto (sk-…, JWT service_role).
//
// Es una duplicacion MINIMA deliberada de back/src/lib/export-guard.ts: el
// generador vive en la raiz sin build de TS y debe poder ejecutarse con
// `node generar.mjs` a secas. El mensaje nombra la ruta ofensora, nunca el valor.
const GUARD_OPERATOR_ENV_NAMES = [
  'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_GENAI_API_KEY',
  'AA_SERVICE_TOKEN', 'CRM_SERVICE_TOKEN', 'OPERATOR_SERVICE_TOKEN',
  'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_JWT_SECRET', 'DATABASE_URL', 'DIRECT_URL', 'JWT_SECRET',
  'CRM_OAUTH_ENCRYPTION_KEY', 'GOOGLE_OAUTH_SECRET', 'GOOGLE_CLIENT_SECRET',
  'SMTP_PASS', 'AUTOMATION_WEBHOOK_SECRET', 'LICENSE_HEARTBEAT_SECRET',
  'SEED_PASSWORD', 'VERIFY_LOGIN_PASSWORD',
];
const GUARD_SECRETS_MASTER_KEY_RE = /^SECRETS_MASTER_KEY(_V\d+)?$/;
const GUARD_PUBLIC_ENV_NAMES = new Set(['SUPABASE_URL', 'SUPABASE_ANON_KEY']);
const GUARD_MIN_SECRET_LENGTH = 12;
const GUARD_MAX_TEXT_BYTES = 8 * 1024 * 1024;
const GUARD_BINARY_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|ico|avif|woff2?|ttf|otf|eot|jar|zip|gz|jks|keystore|p12|pfx|so|a|dylib|dll|exe|node|class|war|pdf|mp3|mp4|webm|db|sqlite|bin|dat)$/i;
const GUARD_PRIVATE_KEY_RE = /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/;
const GUARD_API_KEY_SHAPE_RE = /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{16,}/g;
const GUARD_JWT_RE = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;

function guardUrlPassword(raw) {
  try {
    const url = new URL(raw);
    return url.password ? decodeURIComponent(url.password) : null;
  } catch {
    const m = raw.match(/^[a-z][a-z0-9+.-]*:\/\/[^:/@]+:([^@]+)@/i);
    return m ? decodeURIComponent(m[1]) : null;
  }
}

/** Valores literales del entorno que el paquete generado NUNCA puede contener. */
export function guardOperatorSecrets(env = process.env) {
  const out = [];
  const seen = new Set();
  const add = (name, raw) => {
    if (!raw) return;
    const value = String(raw).trim();
    if (value.length < GUARD_MIN_SECRET_LENGTH || seen.has(value)) return;
    seen.add(value);
    out.push({ name, value });
  };
  for (const name of GUARD_OPERATOR_ENV_NAMES) add(name, env[name]);
  for (const [name, value] of Object.entries(env)) {
    if (GUARD_SECRETS_MASTER_KEY_RE.test(name)) add(name, value);
  }
  for (const dbName of ['DATABASE_URL', 'DIRECT_URL']) {
    if (!env[dbName]) continue;
    const password = guardUrlPassword(String(env[dbName]));
    if (password) add(`${dbName} (password)`, password);
  }
  return out;
}

/** Valores publicos por contrato (anon key / NEXT_PUBLIC_*): nunca se marcan. */
export function guardPublicValues(env = process.env) {
  const values = [];
  for (const [name, value] of Object.entries(env)) {
    if (!value) continue;
    if (!GUARD_PUBLIC_ENV_NAMES.has(name) && !name.startsWith('NEXT_PUBLIC_')) continue;
    values.push(String(value).trim());
  }
  return values.filter((v) => v.length >= 8);
}

/** Clave `sk-...` real: base62 mezclada (mayusculas + digitos). Evita prosa/fixtures. */
function guardHasApiKeyShape(text) {
  GUARD_API_KEY_SHAPE_RE.lastIndex = 0;
  let m;
  while ((m = GUARD_API_KEY_SHAPE_RE.exec(text)) !== null) {
    if (/[A-Z]/.test(m[0]) && /[0-9]/.test(m[0])) return true;
  }
  return false;
}

function guardHasServiceRoleJwt(text) {
  GUARD_JWT_RE.lastIndex = 0;
  let m;
  let inspected = 0;
  while ((m = GUARD_JWT_RE.exec(text)) !== null && inspected < 50) {
    inspected += 1;
    try {
      const payload = JSON.parse(Buffer.from(m[0].split('.')[1], 'base64url').toString('utf8'));
      if (payload && payload.role === 'service_role') return true;
    } catch { /* no es un JWT parseable */ }
  }
  return false;
}

function guardCheckName(relPath, isDir) {
  const segments = relPath.split('/').filter(Boolean);
  if (segments.length === 0) return;
  const basename = segments[segments.length - 1];
  const lower = basename.toLowerCase();

  const dirSegments = isDir ? segments : segments.slice(0, -1);
  if (dirSegments.some((s) => s.toLowerCase() === 'backups')) {
    throw new Error(`Export rechazado: ${segments.slice(0, dirSegments.length).join('/')} — directorio de copias de seguridad (backups/)`);
  }
  if (lower.endsWith('.pem') || lower.endsWith('.key')) {
    throw new Error(`Export rechazado: ${relPath} — material de clave privada (*.pem/*.key)`);
  }
  if (lower.endsWith('.dump') || lower.endsWith('.sql.gz')) {
    throw new Error(`Export rechazado: ${relPath} — volcado de base de datos (*.dump/*.sql.gz)`);
  }
  if (lower.endsWith('.log')) {
    throw new Error(`Export rechazado: ${relPath} — log de ejecucion (*.log)`);
  }
  if (lower.endsWith('.sql')) {
    const isMigration = /(^|\/)prisma\/migrations\/[^/]+\/migration\.sql$/.test(relPath);
    if (!isMigration) {
      throw new Error(`Export rechazado: ${relPath} — volcado/script SQL fuera de prisma/migrations`);
    }
  }
  if (!lower.endsWith('.example') && (lower.startsWith('.env') || /(^|\.)env(\.|$)/i.test(lower))) {
    throw new Error(`Export rechazado: ${relPath} — fichero de entorno real (el paquete solo lleva plantillas *.example)`);
  }
}

function guardCheckContent(relPath, text, secrets, publicValues) {
  for (const secret of secrets) {
    if (text.includes(secret.value)) {
      throw new Error(`Export rechazado: ${relPath} — contiene el valor de un secreto del operador (${secret.name})`);
    }
  }
  if (GUARD_PRIVATE_KEY_RE.test(text)) {
    throw new Error(`Export rechazado: ${relPath} — bloque de clave privada embebido`);
  }
  let scrubbed = text;
  for (const value of publicValues) {
    if (value && scrubbed.includes(value)) scrubbed = scrubbed.split(value).join('');
  }
  if (guardHasApiKeyShape(scrubbed)) {
    throw new Error(`Export rechazado: ${relPath} — clave de API con forma sk-... (no puede viajar)`);
  }
  if (guardHasServiceRoleJwt(scrubbed)) {
    throw new Error(`Export rechazado: ${relPath} — JWT con role=service_role (clave de servicio)`);
  }
}

/**
 * Escanea el paquete YA copiado. Lanza si encuentra material que no debe
 * entregarse a un cliente (ruta + motivo en el mensaje, nunca el valor).
 */
export function assertCleanGeneratedTree(rootDir, env = process.env) {
  const root = path.resolve(rootDir);
  if (!fs.existsSync(root)) return;
  const secrets = guardOperatorSecrets(env);
  const publicValues = guardPublicValues(env);

  const walk = (absDir, relDir) => {
    for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const abs = path.join(absDir, entry.name);
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        guardCheckName(rel, true);
        walk(abs, rel);
        continue;
      }
      if (!entry.isFile()) continue;
      guardCheckName(rel, false);
      if (GUARD_BINARY_EXT_RE.test(entry.name)) continue;
      if (fs.statSync(abs).size > GUARD_MAX_TEXT_BYTES) continue;
      const buffer = fs.readFileSync(abs);
      if (buffer.subarray(0, 8192).includes(0)) continue;
      guardCheckContent(rel, buffer.toString('utf8'), secrets, publicValues);
    }
  };

  walk(root, '');
}

/**
 * Puerta unica tras `copyDir`: valida el paquete generado y, si el guard lo
 * rechaza, BORRA el directorio antes de propagar (un paquete rechazado no queda
 * en disco esperando a que alguien lo empaquete por error).
 */
export function guardGeneratedTree(outDir, env = process.env) {
  try {
    assertCleanGeneratedTree(outDir, env);
  } catch (err) {
    try { fs.rmSync(outDir, { recursive: true, force: true }); } catch { /* best-effort */ }
    throw err;
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

  // Barrera post-copia (S3/S4): el paquete va a un cliente. Si arrastra
  // volcados/backups, un `.env` real, material de clave o un secreto del
  // operador, se rechaza y se borra `generated/<slug>` (fail-closed).
  console.log('Verificando que el paquete generado no lleva secretos ni volcados…');
  guardGeneratedTree(out);

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
