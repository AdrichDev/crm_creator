import { Router } from 'express';
import { prisma } from '../prisma.js';

export const publicRouter = Router();

// 1x1 PNG transparente: fallback cuando el negocio no tiene logo (evita <img> roto en el email).
const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

// GET /public/business/:id/logo — sirve el logo del negocio como imagen, para usarlo
// en los correos automáticos (Gmail no muestra <img src="data:base64">, pero sí una URL
// http). Público a propósito: el logo ya aparece en la web del CRM, no es dato sensible.
// logoUrl puede ser un data URI base64 (se decodifica) o una URL http (se redirige).
publicRouter.get('/business/:id/logo', async (req, res) => {
  let uri = '';
  try {
    const biz = await prisma.business.findUnique({
      where: { id: req.params.id },
      select: { logoUrl: true },
    });
    uri = biz?.logoUrl ?? '';
  } catch {
    /* cae al PNG transparente */
  }

  const m = /^data:(image\/[\w.+-]+);base64,(.+)$/is.exec(uri);
  if (m) {
    res.setHeader('Content-Type', m[1]);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.end(Buffer.from(m[2], 'base64'));
  }
  if (/^https?:\/\//i.test(uri)) return res.redirect(302, uri);

  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=300');
  return res.end(TRANSPARENT_PNG);
});
