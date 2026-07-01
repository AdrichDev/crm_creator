import { buildAddressQuery, isValidCoord, type GeocoderPort, type GeoQuery, type GeoResult } from './geocoder.js';

// Adaptador de geocodificación sobre Nominatim (OpenStreetMap). Gratis, sin API key.
// Política de uso de Nominatim: máx. 1 req/s y User-Agent identificable → throttle interno.
// `fetchImpl` es inyectable para tests (mock sin red).

type FetchLike = (url: string, init?: { headers?: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const MIN_INTERVAL_MS = 1000; // rate-limit Nominatim (1 req/s)

export class NominatimGeocoder implements GeocoderPort {
  private lastCall = 0;
  constructor(
    private readonly fetchImpl: FetchLike = fetch as unknown as FetchLike,
    private readonly userAgent = 'OperaOS-CRM/1.0 (comercial-campo)',
  ) {}

  async geocode(q: GeoQuery): Promise<GeoResult | null> {
    const query = buildAddressQuery(q);
    if (!query) return null;
    await this.throttle();
    const url = `${NOMINATIM_URL}?format=json&limit=1&q=${encodeURIComponent(query)}`;
    let res;
    try {
      res = await this.fetchImpl(url, { headers: { 'User-Agent': this.userAgent, 'Accept-Language': 'es' } });
    } catch {
      return null; // fallo de red no rompe el CRM (RNF-10)
    }
    if (!res.ok) return null;
    const body = (await res.json()) as Array<{ lat?: string; lon?: string }>;
    const hit = Array.isArray(body) ? body[0] : undefined;
    if (!hit) return null;
    const lat = Number(hit.lat);
    const lng = Number(hit.lon);
    return isValidCoord(lat, lng) ? { lat, lng } : null;
  }

  private async throttle(): Promise<void> {
    const wait = this.lastCall + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastCall = Date.now();
  }
}
