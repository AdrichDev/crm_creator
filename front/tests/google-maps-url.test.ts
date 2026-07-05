import { describe, it, expect } from 'vitest';
import { buildGoogleMapsEmbedUrl, buildGoogleMapsSearchUrl } from '@/lib/citas/google-maps-url';

describe('google-maps-url (crm-operaos WU3 / AC3)', () => {
  it('genera URL de embed sin API key a partir de una dirección', () => {
    const url = buildGoogleMapsEmbedUrl('C/ Mayor 3, Madrid');
    expect(url).toBe('https://www.google.com/maps?q=C%2F%20Mayor%203%2C%20Madrid&output=embed');
  });

  it('genera URL de búsqueda/enlace de Google Maps a partir de una dirección', () => {
    const url = buildGoogleMapsSearchUrl('C/ Mayor 3, Madrid');
    expect(url).toBe('https://www.google.com/maps/search/?api=1&query=C%2F%20Mayor%203%2C%20Madrid');
  });

  it('devuelve null sin dirección (undefined, null o vacía)', () => {
    expect(buildGoogleMapsEmbedUrl(undefined)).toBeNull();
    expect(buildGoogleMapsEmbedUrl(null)).toBeNull();
    expect(buildGoogleMapsEmbedUrl('')).toBeNull();
    expect(buildGoogleMapsEmbedUrl('   ')).toBeNull();
    expect(buildGoogleMapsSearchUrl(undefined)).toBeNull();
  });

  it('no incluye ninguna API key en la URL generada', () => {
    const url = buildGoogleMapsEmbedUrl('Av. del Sol 10, Madrid');
    expect(url).not.toContain('key=');
  });
});
