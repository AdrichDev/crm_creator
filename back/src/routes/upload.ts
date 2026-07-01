import { Router, type Response, type NextFunction } from 'express';
import multer, { MulterError } from 'multer';
import { prisma } from '../prisma.js';
import { supabaseAdmin } from '../lib/auth.js';
import type { AuthedRequest } from '../middleware/types.js';

// Subida de imágenes de servicios y productos a Supabase Storage (bucket público
// `crm-media`). La URL pública resultante se persiste en `imagenUrl` del registro.
// Auth + staffOnly se aplican al montar el router en routes/index.ts.

const BUCKET = 'crm-media';
const MAX_BYTES = 5 * 1024 * 1024;

// mimetype permitido → extensión de fichero en Storage.
const ALLOWED: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED[file.mimetype]) cb(null, true);
    else cb(new Error('invalid_type'));
  },
});

// Envuelve multer para traducir sus errores a respuestas JSON con el código HTTP
// adecuado (413 tamaño, 415 tipo) en vez de propagarlos al handler global.
function parseImage(req: AuthedRequest, res: Response, next: NextFunction) {
  upload.single('image')(req, res, (err: unknown) => {
    if (err instanceof MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: { code: 'too_large', message: 'La imagen supera 5 MB' } });
    }
    if (err) {
      return res.status(415).json({ error: { code: 'invalid_type', message: 'Formato no permitido (JPEG, PNG, WEBP)' } });
    }
    next();
  });
}

type Kind = 'service' | 'product' | 'employee' | 'customer';

// Modelo Prisma por kind: findFirst (ownership) y update (persistir imagenUrl).
const MODEL = {
  service: prisma.service,
  product: prisma.product,
  employee: prisma.employee,
  customer: prisma.customer,
} satisfies Record<Kind, { findFirst: (...a: never[]) => unknown; update: (...a: never[]) => unknown }>;

function handler(kind: Kind) {
  return async (req: AuthedRequest, res: Response) => {
    const file = req.file;
    if (!file) return res.status(422).json({ error: { code: 'no_file', message: 'Falta la imagen' } });

    const ext = ALLOWED[file.mimetype];
    const businessId = req.businessId!;
    const id = req.params.id;

    // Ownership: el recurso debe pertenecer al negocio activo y no estar borrado.
    const existing = await (MODEL[kind].findFirst as (args: unknown) => Promise<unknown>)({
      where: { id, businessId, eliminadoEn: null },
    });
    if (!existing) return res.status(404).json({ error: { code: 'not_found', message: 'No encontrado' } });

    const path = `${businessId}/${kind}s/${id}.${ext}`;
    const { error: upErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, file.buffer, { contentType: file.mimetype, upsert: true });
    if (upErr) {
      console.error('[upload] storage error:', upErr);
      return res.status(502).json({ error: { code: 'storage_error', message: 'No se pudo subir la imagen' } });
    }

    // Cache-buster: tras `upsert` la ruta es la misma; el query param fuerza al
    // navegador a recargar la nueva imagen en lugar de servir la cacheada.
    const { data: pub } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
    const url = `${pub.publicUrl}?v=${Date.now()}`;

    await (MODEL[kind].update as (args: unknown) => Promise<unknown>)({
      where: { id },
      data: { imagenUrl: url },
    });

    res.json({ url });
  };
}

export const uploadRouter = Router();
uploadRouter.post('/service/:id', parseImage, handler('service'));
uploadRouter.post('/product/:id', parseImage, handler('product'));
uploadRouter.post('/employee/:id', parseImage, handler('employee'));
uploadRouter.post('/customer/:id', parseImage, handler('customer'));
