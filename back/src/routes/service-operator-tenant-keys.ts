import { Router, type Request, type Response } from 'express';
import { generateApiKeyToken } from '../middleware/tenant-api-key.js';
import { encryptSecret } from '../lib/tenant-secrets/crypto.js';

// ---------------------------------------------------------------------------
// crm-tenant-api-keys — gestión de operador (montado bajo /service/operator,
// que ya exige requireOperatorToken; ver service-operator.ts). Emisión y
// gestión solo por operador en esta primera tanda: la superficie tenant-facing
// (/tenant-config) SOLO consume, nunca administra. El token en claro y el
// valor de un secreto NUNCA se loguean ni se devuelven fuera de la respuesta
// de emisión/alta.
// ---------------------------------------------------------------------------

type ApiKeyRow = {
  id: string;
  prefix: string;
  label: string | null;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};

type SecretMetaRow = {
  name: string;
  scope: 'FRONTEND_PUBLIC' | 'BACKEND_SECRET';
  keyVersion: number;
  updatedAt: Date;
};

/** Dependencias de BD (patrón DI del repo, ver service-operator.ts OperatorDb). */
export interface TenantKeysOperatorDb {
  business: {
    findFirst(args: { where: { id: string; eliminadoEn: null } }): Promise<{ id: string } | null>;
  };
  tenantApiKey: {
    create(args: {
      data: { businessId: string; tokenHash: string; prefix: string; label: string | null };
    }): Promise<ApiKeyRow>;
    findMany(args: { where: { businessId: string } }): Promise<ApiKeyRow[]>;
    findFirst(args: { where: { id: string; businessId: string } }): Promise<(ApiKeyRow & { revokedAt: Date | null }) | null>;
    update(args: { where: { id: string }; data: { revokedAt: Date } }): Promise<ApiKeyRow>;
  };
  tenantSecret: {
    upsert(args: {
      where: { businessId_name: { businessId: string; name: string } };
      create: {
        businessId: string; name: string; scope: 'FRONTEND_PUBLIC' | 'BACKEND_SECRET';
        valueCiphertext: string; iv: string; authTag: string; keyVersion: number;
      };
      update: {
        scope: 'FRONTEND_PUBLIC' | 'BACKEND_SECRET';
        valueCiphertext: string; iv: string; authTag: string; keyVersion: number;
      };
    }): Promise<SecretMetaRow>;
    findMany(args: { where: { businessId: string } }): Promise<SecretMetaRow[]>;
    findFirst(args: { where: { businessId: string; name: string } }): Promise<(SecretMetaRow & { scope: 'FRONTEND_PUBLIC' | 'BACKEND_SECRET' }) | null>;
    update(args: {
      where: { businessId_name: { businessId: string; name: string } };
      data: { valueCiphertext: string; iv: string; authTag: string; keyVersion: number };
    }): Promise<SecretMetaRow>;
  };
}

const BUSINESS_NOT_FOUND = { error: { code: 'business_not_found', message: 'Negocio no encontrado o inactivo' } };
const API_KEY_NOT_FOUND = { error: { code: 'api_key_not_found', message: 'API key no encontrada' } };
const SECRET_NOT_FOUND = { error: { code: 'secret_not_found', message: 'Secreto no encontrado' } };
const VALID_SCOPES = new Set(['FRONTEND_PUBLIC', 'BACKEND_SECRET']);

async function businessActive(db: TenantKeysOperatorDb, businessId: string): Promise<boolean> {
  const row = await db.business.findFirst({ where: { id: businessId, eliminadoEn: null } });
  return row != null;
}

/* ---------- POST /businesses/:id/api-keys (emitir) ---------- */

export async function issueApiKeyHandler(db: TenantKeysOperatorDb, req: Request, res: Response) {
  try {
    const businessId = req.params.id;
    if (!(await businessActive(db, businessId))) return res.status(404).json(BUSINESS_NOT_FOUND);

    const body = (req.body ?? {}) as { label?: unknown };
    const label = typeof body.label === 'string' && body.label.trim() ? body.label.trim() : null;

    const { token, prefix, tokenHash } = generateApiKeyToken();
    const row = await db.tenantApiKey.create({ data: { businessId, tokenHash, prefix, label } });

    // El token en claro se devuelve UNA ÚNICA VEZ aquí — nunca se persiste ni se vuelve a mostrar.
    res.status(201).json({
      id: row.id,
      token,
      prefix: row.prefix,
      label: row.label,
      createdAt: row.createdAt,
    });
  } catch (e) {
    console.error('[service-operator] error emitiendo API key:', e);
    res.status(500).json({ error: { code: 'server_error', message: 'No se pudo emitir la API key' } });
  }
}

/* ---------- GET /businesses/:id/api-keys (listar) ---------- */

export async function listApiKeysHandler(db: TenantKeysOperatorDb, req: Request, res: Response) {
  try {
    const businessId = req.params.id;
    if (!(await businessActive(db, businessId))) return res.status(404).json(BUSINESS_NOT_FOUND);
    const rows = await db.tenantApiKey.findMany({ where: { businessId } });
    // Nunca se devuelve tokenHash ni el token en claro — solo metadatos de listado.
    const apiKeys = rows.map((r) => ({
      id: r.id, prefix: r.prefix, label: r.label, lastUsedAt: r.lastUsedAt, revokedAt: r.revokedAt, createdAt: r.createdAt,
    }));
    res.json({ apiKeys });
  } catch (e) {
    console.error('[service-operator] error listando API keys:', e);
    res.status(500).json({ error: { code: 'server_error', message: 'No se pudieron cargar las API keys' } });
  }
}

/* ---------- POST /businesses/:id/api-keys/:keyId/rotate ---------- */

export async function rotateApiKeyHandler(db: TenantKeysOperatorDb, req: Request, res: Response) {
  try {
    const businessId = req.params.id;
    const keyId = req.params.keyId;
    if (!(await businessActive(db, businessId))) return res.status(404).json(BUSINESS_NOT_FOUND);

    const existing = await db.tenantApiKey.findFirst({ where: { id: keyId, businessId } });
    if (!existing) return res.status(404).json(API_KEY_NOT_FOUND);

    // Revoca la anterior (idempotente: si ya estaba revocada, no se pisa la fecha original).
    if (!existing.revokedAt) {
      await db.tenantApiKey.update({ where: { id: keyId }, data: { revokedAt: new Date() } });
    }

    const { token, prefix, tokenHash } = generateApiKeyToken();
    const created = await db.tenantApiKey.create({ data: { businessId, tokenHash, prefix, label: existing.label } });

    res.status(201).json({
      id: created.id,
      token,
      prefix: created.prefix,
      label: created.label,
      createdAt: created.createdAt,
      rotatedFrom: keyId,
    });
  } catch (e) {
    console.error('[service-operator] error rotando API key:', e);
    res.status(500).json({ error: { code: 'server_error', message: 'No se pudo rotar la API key' } });
  }
}

/* ---------- POST /businesses/:id/api-keys/:keyId/revoke ---------- */

export async function revokeApiKeyHandler(db: TenantKeysOperatorDb, req: Request, res: Response) {
  try {
    const businessId = req.params.id;
    const keyId = req.params.keyId;
    if (!(await businessActive(db, businessId))) return res.status(404).json(BUSINESS_NOT_FOUND);

    const existing = await db.tenantApiKey.findFirst({ where: { id: keyId, businessId } });
    if (!existing) return res.status(404).json(API_KEY_NOT_FOUND);

    // Idempotente: revocar una clave ya revocada no es error, devuelve el estado actual.
    if (existing.revokedAt) {
      return res.json({ id: existing.id, revokedAt: existing.revokedAt });
    }
    const updated = await db.tenantApiKey.update({ where: { id: keyId }, data: { revokedAt: new Date() } });
    res.json({ id: updated.id, revokedAt: updated.revokedAt });
  } catch (e) {
    console.error('[service-operator] error revocando API key:', e);
    res.status(500).json({ error: { code: 'server_error', message: 'No se pudo revocar la API key' } });
  }
}

/* ---------- POST /businesses/:id/secrets (alta/actualización) ---------- */

export async function upsertSecretHandler(db: TenantKeysOperatorDb, req: Request, res: Response) {
  try {
    const businessId = req.params.id;
    if (!(await businessActive(db, businessId))) return res.status(404).json(BUSINESS_NOT_FOUND);

    const body = (req.body ?? {}) as { name?: unknown; scope?: unknown; value?: unknown };
    if (typeof body.name !== 'string' || !body.name.trim()) {
      return res.status(422).json({ error: { code: 'invalid', message: 'Falta name' } });
    }
    if (typeof body.scope !== 'string' || !VALID_SCOPES.has(body.scope)) {
      return res.status(422).json({ error: { code: 'invalid', message: 'scope debe ser FRONTEND_PUBLIC o BACKEND_SECRET' } });
    }
    if (typeof body.value !== 'string' || !body.value) {
      return res.status(422).json({ error: { code: 'invalid', message: 'Falta value' } });
    }

    const name = body.name.trim();
    const scope = body.scope as 'FRONTEND_PUBLIC' | 'BACKEND_SECRET';
    const enc = encryptSecret(body.value);

    const row = await db.tenantSecret.upsert({
      where: { businessId_name: { businessId, name } },
      create: { businessId, name, scope, valueCiphertext: enc.ciphertext, iv: enc.iv, authTag: enc.authTag, keyVersion: enc.keyVersion },
      update: { scope, valueCiphertext: enc.ciphertext, iv: enc.iv, authTag: enc.authTag, keyVersion: enc.keyVersion },
    });

    // Nunca se devuelve el valor (ni cifrado ni en claro) — solo metadatos.
    res.status(200).json({ name: row.name, scope: row.scope, keyVersion: row.keyVersion, updatedAt: row.updatedAt });
  } catch (e) {
    console.error('[service-operator] error dando de alta secreto:', e);
    res.status(500).json({ error: { code: 'server_error', message: 'No se pudo guardar el secreto' } });
  }
}

/* ---------- GET /businesses/:id/secrets (listar) ---------- */

export async function listSecretsHandler(db: TenantKeysOperatorDb, req: Request, res: Response) {
  try {
    const businessId = req.params.id;
    if (!(await businessActive(db, businessId))) return res.status(404).json(BUSINESS_NOT_FOUND);
    const rows = await db.tenantSecret.findMany({ where: { businessId } });
    // Nunca se devuelve valueCiphertext/iv/authTag — solo metadatos de listado.
    const secrets = rows.map((r) => ({ name: r.name, scope: r.scope, keyVersion: r.keyVersion, updatedAt: r.updatedAt }));
    res.json({ secrets });
  } catch (e) {
    console.error('[service-operator] error listando secretos:', e);
    res.status(500).json({ error: { code: 'server_error', message: 'No se pudieron cargar los secretos' } });
  }
}

/* ---------- POST /businesses/:id/secrets/:name/rotate ---------- */

export async function rotateSecretHandler(db: TenantKeysOperatorDb, req: Request, res: Response) {
  try {
    const businessId = req.params.id;
    const name = req.params.name;
    if (!(await businessActive(db, businessId))) return res.status(404).json(BUSINESS_NOT_FOUND);

    const existing = await db.tenantSecret.findFirst({ where: { businessId, name } });
    if (!existing) return res.status(404).json(SECRET_NOT_FOUND);

    const body = (req.body ?? {}) as { value?: unknown };
    if (typeof body.value !== 'string' || !body.value) {
      return res.status(422).json({ error: { code: 'invalid', message: 'Falta value' } });
    }

    // Re-cifra con la versión de clave ACTUAL (puede ser distinta a la de la fila vieja
    // si se rotó SECRETS_MASTER_KEY entre medias) — mismo mecanismo que una rotación de secreto.
    const enc = encryptSecret(body.value);
    const row = await db.tenantSecret.update({
      where: { businessId_name: { businessId, name } },
      data: { valueCiphertext: enc.ciphertext, iv: enc.iv, authTag: enc.authTag, keyVersion: enc.keyVersion },
    });

    res.json({ name: row.name, scope: row.scope, keyVersion: row.keyVersion, updatedAt: row.updatedAt });
  } catch (e) {
    console.error('[service-operator] error rotando secreto:', e);
    res.status(500).json({ error: { code: 'server_error', message: 'No se pudo rotar el secreto' } });
  }
}

/* ---------- Router ---------- */

export function buildTenantKeysOperatorRouter(db: TenantKeysOperatorDb): Router {
  const router = Router();
  router.post('/businesses/:id/api-keys', (req, res) => issueApiKeyHandler(db, req, res));
  router.get('/businesses/:id/api-keys', (req, res) => listApiKeysHandler(db, req, res));
  router.post('/businesses/:id/api-keys/:keyId/rotate', (req, res) => rotateApiKeyHandler(db, req, res));
  router.post('/businesses/:id/api-keys/:keyId/revoke', (req, res) => revokeApiKeyHandler(db, req, res));
  router.post('/businesses/:id/secrets', (req, res) => upsertSecretHandler(db, req, res));
  router.get('/businesses/:id/secrets', (req, res) => listSecretsHandler(db, req, res));
  router.post('/businesses/:id/secrets/:name/rotate', (req, res) => rotateSecretHandler(db, req, res));
  return router;
}
