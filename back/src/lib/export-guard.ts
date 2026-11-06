/**
 * back/src/lib/export-guard.ts
 *
 * security-wave-2 / T5 (S3, S4): barrera de secretos y volcados del pipeline
 * de export. Es un escaner PURO (sin BD ni red) sobre:
 *   - un arbol de directorios (copia temporal de un builder / paquete generado),
 *   - un ZIP ya construido (ruta o buffer en memoria).
 *
 * Rechaza el artefacto (lanza `ExportGuardError`) cuando contiene:
 *   (a) volcados/backups/logs: cualquier fichero bajo `backups/`, `*.sql` fuera
 *       de `prisma/migrations/<ts>/migration.sql` y del `schema.sql` raiz del
 *       export, `*.dump`, `*.sql.gz`, `*.log`;
 *   (b) ficheros de entorno que el pipeline no escribe: solo se admiten
 *       `.env.local` (el que escribe `writeFreshEnvLocal`) y las plantillas
 *       `*.example`;
 *   (c) material de clave: `*.pem`, `*.key`, y bloques `-----BEGIN … PRIVATE KEY-----`;
 *   (d) el valor LITERAL de cualquier secreto del operador presente en el
 *       entorno del servidor (`collectOperatorSecrets`), incluida la parte
 *       password de `DATABASE_URL`/`DIRECT_URL`;
 *   (e) formas genericas: claves `sk-…`/`sk-ant-…` y JWT con `role: service_role`.
 *
 * Nunca se marca el `NEXT_PUBLIC_SUPABASE_ANON_KEY`/`SUPABASE_URL` ni los
 * valores `FRONTEND_PUBLIC` del tenant (son publicos por contrato: se pasan en
 * `publicValues` y el guard ignora ademas todos los `NEXT_PUBLIC_*` del entorno).
 *
 * El error nombra la RUTA RELATIVA ofensora y el MOTIVO. El valor del secreto
 * jamas viaja en el mensaje (ni en logs ni en la respuesta HTTP).
 *
 * S4 (regla de producto): las claves LLM del operador son solo para sus propias
 * pruebas; el cliente siempre trae la suya. Ningun secreto del operador puede
 * llegar a un paquete entregado a un cliente.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import JSZip from 'jszip';

// ---------------------------------------------------------------------------
// Error tipado
// ---------------------------------------------------------------------------

export type ExportGuardViolation =
  | 'backup_dir'
  | 'dump_file'
  | 'env_file'
  | 'key_material'
  | 'operator_secret'
  | 'secret_shape';

/**
 * Error de la barrera de export. `violation` dice QUE regla salto,
 * `relativePath` DONDE (ruta relativa con separador `/`) y el mensaje explica
 * el motivo sin exponer nunca el valor del secreto.
 */
export class ExportGuardError extends Error {
  readonly code = 'export_guard_violation' as const;
  readonly violation: ExportGuardViolation;
  readonly relativePath: string;

  constructor(violation: ExportGuardViolation, relativePath: string, reason: string) {
    super(`Export rechazado: ${relativePath} — ${reason}`);
    this.name = 'ExportGuardError';
    this.violation = violation;
    this.relativePath = relativePath;
  }
}

// ---------------------------------------------------------------------------
// (d) Secretos del operador derivados del entorno del servidor
// ---------------------------------------------------------------------------

/** Referencia a un secreto del operador: nombre de la variable y su valor. */
export interface OperatorSecretRef {
  name: string;
  value: string;
}

/**
 * Variables de entorno del BACKEND que jamas pueden aparecer en un paquete de
 * cliente. Derivadas de `back/src/env.ts` y del resto de envs que lee el back
 * (LLM del operador, tokens servicio-a-servicio, plano de datos, claves maestras
 * de cifrado, OAuth, SMTP y webhooks de automatizacion/licencia).
 *
 * Deliberadamente NO incluye `SUPABASE_ANON_KEY`, `SUPABASE_URL` ni ningun
 * `NEXT_PUBLIC_*`: son publicos por contrato y el export los hornea a proposito.
 */
export const OPERATOR_SECRET_ENV_NAMES: readonly string[] = [
  // Claves LLM del operador (S4: el cliente trae la suya, estas no viajan).
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GEMINI_API_KEY',
  'GOOGLE_GENAI_API_KEY',
  // Tokens servicio-a-servicio / operador.
  'AA_SERVICE_TOKEN',
  'CRM_SERVICE_TOKEN',
  'OPERATOR_SERVICE_TOKEN',
  // Plano de datos y sesion.
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_JWT_SECRET',
  'DATABASE_URL',
  'DIRECT_URL',
  'JWT_SECRET',
  // Claves maestras de cifrado y OAuth.
  'CRM_OAUTH_ENCRYPTION_KEY',
  'GOOGLE_OAUTH_SECRET',
  'GOOGLE_CLIENT_SECRET',
  // Correo, automatizaciones y licencia.
  'SMTP_PASS',
  'AUTOMATION_WEBHOOK_SECRET',
  'LICENSE_HEARTBEAT_SECRET',
  // Credenciales de bootstrap del operador.
  'SEED_PASSWORD',
  'VERIFY_LOGIN_PASSWORD',
];

/** Nombres con version: `SECRETS_MASTER_KEY`, `SECRETS_MASTER_KEY_V2`, … */
const SECRET_ENV_KEY_PATTERNS: readonly RegExp[] = [/^SECRETS_MASTER_KEY(_V\d+)?$/];

/** Valores publicos por contrato: NUNCA se marcan aunque aparezcan en un paquete. */
const PUBLIC_ENV_NAMES: ReadonlySet<string> = new Set([
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_PUBLISHABLE_KEY',
]);
const PUBLIC_ENV_PREFIXES: readonly string[] = ['NEXT_PUBLIC_'];

/** Un valor mas corto que esto no es un secreto distinguible: se ignora. */
const MIN_SECRET_LENGTH = 12;

/** Parte password de una URL de conexion (URL o regex como fallback). */
function extractUrlPassword(raw: string): string | null {
  try {
    const url = new URL(raw);
    return url.password ? decodeURIComponent(url.password) : null;
  } catch {
    const match = raw.match(/^[a-z][a-z0-9+.-]*:\/\/[^:/@]+:([^@]+)@/i);
    return match ? decodeURIComponent(match[1]) : null;
  }
}

/**
 * Deriva del entorno los valores literales que un export NUNCA puede contener.
 * Ignora valores vacios, menores de 12 caracteres (ruido/falsos positivos) y
 * los publicos por contrato. Deduplica por valor.
 */
export function collectOperatorSecrets(
  sourceEnv: NodeJS.ProcessEnv = process.env,
): OperatorSecretRef[] {
  const out: OperatorSecretRef[] = [];
  const seen = new Set<string>();

  const add = (name: string, rawValue: string | undefined): void => {
    if (!rawValue) return;
    const value = rawValue.trim();
    if (value.length < MIN_SECRET_LENGTH) return;
    if (seen.has(value)) return;
    seen.add(value);
    out.push({ name, value });
  };

  for (const name of OPERATOR_SECRET_ENV_NAMES) add(name, sourceEnv[name]);
  for (const [name, value] of Object.entries(sourceEnv)) {
    if (SECRET_ENV_KEY_PATTERNS.some((re) => re.test(name))) add(name, value);
  }
  // La parte password de la URL de BD se filtra sola cuando viaja sin esquema
  // (`user:pass@host` recortado en un log o en un `.env` a medias).
  for (const dbName of ['DATABASE_URL', 'DIRECT_URL']) {
    const raw = sourceEnv[dbName];
    if (!raw) continue;
    const password = extractUrlPassword(raw);
    if (password) add(`${dbName} (password)`, password);
  }

  return out;
}

/** Valores publicos por contrato: `NEXT_PUBLIC_*`, anon key + los del tenant. */
export function collectPublicValues(
  sourceEnv: NodeJS.ProcessEnv = process.env,
  extra: readonly string[] = [],
): string[] {
  const values = new Set<string>();
  for (const [name, value] of Object.entries(sourceEnv)) {
    if (!value) continue;
    const isPublic =
      PUBLIC_ENV_NAMES.has(name) || PUBLIC_ENV_PREFIXES.some((prefix) => name.startsWith(prefix));
    if (isPublic) values.add(value.trim());
  }
  for (const value of extra) {
    if (value) values.add(value.trim());
  }
  return [...values].filter((value) => value.length >= 8);
}

// ---------------------------------------------------------------------------
// Opciones y contexto de inspeccion
// ---------------------------------------------------------------------------

export interface ExportGuardOptions {
  /** Entorno del que derivar secretos/publicos. Default: `process.env`. */
  env?: NodeJS.ProcessEnv;
  /**
   * Valores publicos del tenant (`FRONTEND_PUBLIC` ya descifrados) que el
   * pipeline hornea a proposito en `.env.local`. Nunca se marcan.
   */
  publicValues?: readonly string[];
  /** Basenames de ficheros de entorno que el pipeline escribe. */
  allowedEnvFiles?: readonly string[];
  /** Tope de bytes inspeccionados por fichero de texto. Default 8 MiB. */
  maxTextBytes?: number;
}

interface InspectionContext {
  secrets: OperatorSecretRef[];
  publicValues: string[];
  allowedEnvFiles: Set<string>;
  maxTextBytes: number;
}

const DEFAULT_ENV_FILES: readonly string[] = ['.env.local'];

const DEFAULT_MAX_TEXT_BYTES = 8 * 1024 * 1024;

function buildContext(options: ExportGuardOptions): InspectionContext {
  const sourceEnv = options.env ?? process.env;
  return {
    secrets: collectOperatorSecrets(sourceEnv),
    publicValues: collectPublicValues(sourceEnv, options.publicValues ?? []),
    allowedEnvFiles: new Set(options.allowedEnvFiles ?? DEFAULT_ENV_FILES),
    maxTextBytes: options.maxTextBytes ?? DEFAULT_MAX_TEXT_BYTES,
  };
}

// ---------------------------------------------------------------------------
// Reglas por NOMBRE
// ---------------------------------------------------------------------------

const BACKUP_DIR_SEGMENTS: ReadonlySet<string> = new Set(['backups']);

/** `.env*` en cualquier posicion: `.env`, `.env.local`, `production.env`, … */
const ENV_NAME_RE = /(^|\.)env(\.|$)/i;

/**
 * `prisma/migrations/<timestamp>/migration.sql` (migracion legitima de Prisma),
 * con o sin prefijo de arbol (`back/prisma/...`, `app/prisma/...`).
 */
const MIGRATION_SQL_RE = /(^|\/)prisma\/migrations\/[^/]+\/migration\.sql$/;

/** Extensions binarias: se miran por nombre, nunca por contenido. */
const BINARY_EXTENSIONS: ReadonlySet<string> = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.avif',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.jar', '.zip', '.gz', '.jks', '.keystore', '.p12', '.pfx',
  '.so', '.a', '.dylib', '.dll', '.exe', '.node', '.class', '.war',
  '.pdf', '.mp3', '.mp4', '.webm', '.db', '.sqlite', '.bin', '.dat',
]);

function normalizeRel(relPath: string): string {
  return relPath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
}

/**
 * Rutas `.sql` legitimas en un export: el `schema.sql` de la raiz (el esquema
 * que el pipeline genera a proposito) y las migraciones de Prisma. Cualquier
 * otro `.sql` es un volcado o un script suelto y se rechaza.
 */
export function isAllowedSqlPath(relPath: string): boolean {
  const normalized = normalizeRel(relPath);
  if (normalized === 'schema.sql') return true;
  return MIGRATION_SQL_RE.test(normalized);
}

/** Ficheros de entorno que el pipeline NO escribe (regla b). */
function isForbiddenEnvFile(basename: string, ctx: InspectionContext): boolean {
  const lower = basename.toLowerCase();
  // Plantillas (`*.example`): nunca llevan valores reales y son el contrato de
  // documentacion (misma excepcion que `shouldCopy` en generar.mjs).
  if (lower.endsWith('.example')) return false;
  if (ctx.allowedEnvFiles.has(lower)) return false;
  return lower.startsWith('.env') || ENV_NAME_RE.test(lower);
}

/** Valida la ruta relativa contra las reglas por nombre (a/b/c). */
function assertCleanEntryName(relPath: string, isDir: boolean, ctx: InspectionContext): void {
  const normalized = normalizeRel(relPath);
  if (!normalized) return;
  const segments = normalized.split('/');
  const basename = segments[segments.length - 1];
  const lower = basename.toLowerCase();

  const dirSegments = isDir ? segments : segments.slice(0, -1);
  if (dirSegments.some((segment) => BACKUP_DIR_SEGMENTS.has(segment.toLowerCase()))) {
    throw new ExportGuardError(
      'backup_dir',
      normalized,
      'directorio de copias de seguridad (backups/)',
    );
  }

  if (lower.endsWith('.pem') || lower.endsWith('.key')) {
    throw new ExportGuardError('key_material', normalized, 'material de clave privada (*.pem/*.key)');
  }

  if (lower.endsWith('.dump') || lower.endsWith('.sql.gz')) {
    throw new ExportGuardError('dump_file', normalized, 'volcado de base de datos (*.dump/*.sql.gz)');
  }

  if (lower.endsWith('.log')) {
    throw new ExportGuardError('dump_file', normalized, 'log de ejecucion (*.log)');
  }

  if (lower.endsWith('.sql') && !isAllowedSqlPath(normalized)) {
    throw new ExportGuardError(
      'dump_file',
      normalized,
      'volcado/script SQL fuera de prisma/migrations (solo schema.sql y migration.sql)',
    );
  }

  if (isForbiddenEnvFile(basename, ctx)) {
    throw new ExportGuardError('env_file', normalized, 'fichero de entorno no generado por el pipeline');
  }
}

// ---------------------------------------------------------------------------
// Reglas por CONTENIDO
// ---------------------------------------------------------------------------

const PRIVATE_KEY_RE = /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/;
const API_KEY_SHAPE_RE = /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{16,}/g;
const JWT_RE = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;

/**
 * Una clave `sk-...` real es base62 mezclada: mayusculas Y digitos. El filtro de
 * entropia evita falsos positivos con texto que solo EMPIEZA por `sk-`
 * (p. ej. la fixture `sk-live-should-not-be-here` o prosa).
 */
function looksLikeRealApiKey(candidate: string): boolean {
  return /[A-Z]/.test(candidate) && /[0-9]/.test(candidate);
}

/** Clave `sk-...`/`sk-ant-...`/`sk-proj-...` con entropia de clave real. */
function hasApiKeyShape(text: string): boolean {
  API_KEY_SHAPE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = API_KEY_SHAPE_RE.exec(text)) !== null) {
    if (looksLikeRealApiKey(match[0])) return true;
  }
  return false;
}

/** JWT con `role: service_role` en el payload (service-role key de Supabase). */
function hasServiceRoleJwt(text: string): boolean {
  JWT_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  let inspected = 0;
  while ((match = JWT_RE.exec(text)) !== null && inspected < 50) {
    inspected += 1;
    try {
      const payload = JSON.parse(
        Buffer.from(match[0].split('.')[1], 'base64url').toString('utf8'),
      ) as { role?: unknown };
      if (payload?.role === 'service_role') return true;
    } catch {
      // No es un JWT parseable: no es la forma que buscamos.
    }
  }
  return false;
}

/** true si el buffer parece texto (sin bytes NUL y no binario por extension). */
function looksTextual(relPath: string, buffer: Buffer): boolean {
  const ext = path.posix.extname(normalizeRel(relPath)).toLowerCase();
  if (BINARY_EXTENSIONS.has(ext)) return false;
  return !buffer.subarray(0, 8192).includes(0);
}

/** Aplica las reglas (c), (d) y (e) al contenido textual de un fichero. */
function assertCleanContent(relPath: string, text: string, ctx: InspectionContext): void {
  // (d) Valor literal de un secreto del operador. Nunca se loguea el valor.
  for (const secret of ctx.secrets) {
    if (text.includes(secret.value)) {
      throw new ExportGuardError(
        'operator_secret',
        relPath,
        `contiene el valor de un secreto del operador (${secret.name})`,
      );
    }
  }

  // (c) Material de clave privada embebido.
  if (PRIVATE_KEY_RE.test(text)) {
    throw new ExportGuardError('key_material', relPath, 'bloque de clave privada embebido');
  }

  // (e) Formas genericas. Se descartan primero los valores publicos por
  // contrato (anon key, NEXT_PUBLIC_* del tenant) para no marcar lo legitimo.
  let scrubbed = text;
  for (const value of ctx.publicValues) {
    if (value && scrubbed.includes(value)) scrubbed = scrubbed.split(value).join('');
  }

  if (hasApiKeyShape(scrubbed)) {
    throw new ExportGuardError('secret_shape', relPath, 'clave de API con forma sk-... (no puede viajar)');
  }
  if (hasServiceRoleJwt(scrubbed)) {
    throw new ExportGuardError('secret_shape', relPath, 'JWT con role=service_role (clave de servicio)');
  }
}

// ---------------------------------------------------------------------------
// API publica: arbol de directorios
// ---------------------------------------------------------------------------

/**
 * Escanea un arbol de directorios COMPLETO (no sigue symlinks) y lanza
 * `ExportGuardError` al primer fichero ofensor. No escribe nada.
 */
export function assertCleanExportTree(
  rootDir: string,
  options: ExportGuardOptions = {},
): void {
  const root = path.resolve(rootDir);
  if (!fs.existsSync(root)) return;
  const ctx = buildContext(options);

  const walk = (absDir: string): void => {
    for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
      const abs = path.join(absDir, entry.name);
      const rel = normalizeRel(path.relative(root, abs));
      if (entry.isSymbolicLink()) continue; // no se sigue: evita salir del arbol
      if (entry.isDirectory()) {
        assertCleanEntryName(rel, true, ctx);
        walk(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      assertCleanEntryName(rel, false, ctx);
      const size = fs.statSync(abs).size;
      if (size > ctx.maxTextBytes) continue; // binario grande: solo reglas por nombre
      const buffer = fs.readFileSync(abs);
      if (!looksTextual(rel, buffer)) continue;
      assertCleanContent(rel, buffer.toString('utf8'), ctx);
    }
  };

  walk(root);
}

// ---------------------------------------------------------------------------
// API publica: ZIP construido
// ---------------------------------------------------------------------------

/**
 * Escanea un artefacto ya construido EN MEMORIA (ZIP). Las entradas binarias
 * se validan solo por nombre; las de texto se leen hasta el tope configurado.
 *
 * Si el buffer no es un ZIP (builder de test con bytes sinteticos), se trata
 * como texto plano acotado: un buffer que no es archivo no expone entradas,
 * pero tampoco debe poder colar un secreto.
 */
export async function assertCleanArchiveBuffer(
  buffer: Buffer,
  options: ExportGuardOptions = {},
): Promise<void> {
  const ctx = buildContext(options);

  let zip: JSZip | null = null;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    zip = null;
  }

  if (!zip) {
    if (buffer.length <= ctx.maxTextBytes && looksTextual('', buffer)) {
      assertCleanContent('<archive>', buffer.toString('utf8'), ctx);
    }
    return;
  }

  for (const [name, entry] of Object.entries(zip.files)) {
    const rel = normalizeRel(name);
    if (!rel) continue;
    if (entry.dir) {
      assertCleanEntryName(rel, true, ctx);
      continue;
    }
    assertCleanEntryName(rel, false, ctx);
    const ext = path.posix.extname(rel).toLowerCase();
    if (BINARY_EXTENSIONS.has(ext)) continue;
    const data = await entry.async('nodebuffer');
    if (data.length > ctx.maxTextBytes) continue;
    if (!looksTextual(rel, data)) continue;
    assertCleanContent(rel, data.toString('utf8'), ctx);
  }
}

/** Escanea el ZIP en disco. Lanza `ExportGuardError` si el artefacto no es entregable. */
export async function assertCleanExportZip(
  zipPath: string,
  options: ExportGuardOptions = {},
): Promise<void> {
  await assertCleanArchiveBuffer(fs.readFileSync(zipPath), options);
}

/**
 * Puerta unica de entrega: valida el artefacto en disco y, si el guard lo
 * rechaza, BORRA el fichero antes de propagar el error (un export rechazado no
 * deja artefacto que alguien pueda recoger por error).
 */
export async function guardExportArtifact(
  zipPath: string,
  options: ExportGuardOptions = {},
): Promise<void> {
  try {
    await assertCleanExportZip(zipPath, options);
  } catch (err) {
    try {
      fs.rmSync(zipPath, { force: true });
    } catch {
      // Best-effort: el error original es el que importa.
    }
    throw err;
  }
}
