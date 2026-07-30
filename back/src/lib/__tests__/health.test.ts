// `/health` publica el commit desplegado.
//
// Existe porque hubo que verificar un despliegue a producción y no se pudo: con sólo
// `ok: true`, un proceso arrancado justo después de un push encaja igual con el código nuevo
// que con un reinicio del contenedor viejo. Coincidencia temporal ≠ verificación.
//
// El commit se resuelve UNA vez al cargar el módulo, así que cada caso reimporta con su propio
// entorno y una query distinta en la URL (el caché de ESM no se puede purgar de otra forma bajo
// `node --test`). Leerlo por petición sería más fácil de probar y peor: el dato es inmutable
// durante la vida del proceso y ese es justamente el punto.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';

/** Captura el cuerpo del `res.json(...)` sin montar un servidor: el handler no toca nada más. */
function respuestaDe(handler: (req: Request, res: Response) => void) {
  let cuerpo: Record<string, unknown> | undefined;
  const res = { json: (b: Record<string, unknown>) => (cuerpo = b) } as unknown as Response;
  handler({} as Request, res);
  return cuerpo!;
}

let cargas = 0;
/** Recarga `health.ts` con el entorno actual y devuelve su `healthHandler`. */
async function cargarHandler() {
  const mod = await import(`../health.js?load=${cargas++}`);
  return mod.healthHandler as (req: Request, res: Response) => void;
}

describe('GET /health — commit desplegado', () => {
  const original = { ...process.env };

  beforeEach(() => {
    delete process.env.RENDER_GIT_COMMIT;
    delete process.env.GIT_COMMIT;
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it('publica los 7 primeros caracteres de RENDER_GIT_COMMIT', async () => {
    process.env.RENDER_GIT_COMMIT = '3ec799f1a2b3c4d5e6f708192a3b4c5d6e7f8091';
    const cuerpo = respuestaDe(await cargarHandler());

    assert.equal(cuerpo.commit, '3ec799f');
    // El SHA entero NO sale: 7 caracteres identifican el despliegue contra el historial sin
    // publicar el identificador completo.
    assert.ok(!JSON.stringify(cuerpo).includes('3ec799f1a2b3'));
  });

  it('acepta GIT_COMMIT cuando no es Render', async () => {
    process.env.GIT_COMMIT = 'abcdef0123456789';
    assert.equal(respuestaDe(await cargarHandler()).commit, 'abcdef0');
  });

  it('RENDER_GIT_COMMIT gana a GIT_COMMIT', async () => {
    process.env.RENDER_GIT_COMMIT = '1111111aaaa';
    process.env.GIT_COMMIT = '2222222bbbb';
    assert.equal(respuestaDe(await cargarHandler()).commit, '1111111');
  });

  it('omite el campo si nadie informa el commit, en vez de mandar cadena vacía', async () => {
    const cuerpo = respuestaDe(await cargarHandler());

    // Ausente y no `''`: una cadena vacía se lee como «no hay commit» cuando lo que pasa es que
    // nadie lo ha dicho. Son dos cosas distintas y quien consulte /health merece distinguirlas.
    assert.ok(!('commit' in cuerpo));
  });

  it('sigue siendo el mismo liveness: ok y service intactos', async () => {
    process.env.RENDER_GIT_COMMIT = '9999999';
    const cuerpo = respuestaDe(await cargarHandler());

    // El contrato previo no se toca: hay sondas y tests que ya leen estas dos claves.
    assert.equal(cuerpo.ok, true);
    assert.equal(cuerpo.service, 'operaos-backend');
  });
});
