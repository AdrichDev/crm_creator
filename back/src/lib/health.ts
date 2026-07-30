import type { Request, Response } from 'express';

/**
 * Commit que construyó este proceso, en corto. Render lo inyecta como `RENDER_GIT_COMMIT`;
 * `GIT_COMMIT` queda como escotilla para cualquier otro sitio donde se despliegue esto.
 *
 * Se resuelve una vez al cargar el módulo, no en cada petición: es inmutable durante la vida del
 * proceso, y ese es justo el punto — lo que se quiere saber es qué código está sirviendo.
 *
 * Se publican 7 caracteres, no el SHA entero: basta para identificar el despliegue contra el
 * historial y no es un identificador completo puesto ahí para que lo copie cualquiera.
 */
const COMMIT = (process.env.RENDER_GIT_COMMIT ?? process.env.GIT_COMMIT ?? '').slice(0, 7);

/**
 * Liveness, y además QUÉ versión está sirviendo.
 *
 * Sin `commit` no había forma de comprobar un despliegue desde fuera: un `ok: true` y un push
 * reciente encajan igual con el código nuevo que con un reinicio del contenedor viejo, y una
 * coincidencia temporal no es una verificación. Con esto, la pregunta se contesta con un `curl`.
 *
 * `commit` se omite si el entorno no lo informa (desarrollo local), en vez de mandar una cadena
 * vacía que se lee como «no hay commit» en lugar de «nadie lo ha dicho».
 */
export function healthHandler(_req: Request, res: Response) {
  res.json({ ok: true, service: 'operaos-backend', ...(COMMIT ? { commit: COMMIT } : {}) });
}
