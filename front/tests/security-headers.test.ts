// crm-security-hardening S5: the served front sends baseline browser security headers.
// Static exports (exe/apk) have no server, so no headers() block is emitted there.
import { describe, it, expect } from 'vitest';
import { SECURITY_HEADERS, securityHeadersFor } from '../lib/security-headers';

const byKey = Object.fromEntries(SECURITY_HEADERS.map((h) => [h.key, h.value]));

describe('security headers', () => {
  it('forbid framing by other origins', () => {
    expect(byKey['X-Frame-Options']).toBe('SAMEORIGIN');
    expect(byKey['Content-Security-Policy']).toBe("frame-ancestors 'self'");
  });

  it('disable MIME sniffing and limit the referrer', () => {
    expect(byKey['X-Content-Type-Options']).toBe('nosniff');
    expect(byKey['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
  });

  it('keep geolocation, camera and microphone for the app itself only', () => {
    expect(byKey['Permissions-Policy']).toBe('camera=(self), microphone=(self), geolocation=(self)');
  });

  it('apply to every route when the app is served (dev or standalone)', async () => {
    for (const mode of [undefined, 'standalone']) {
      const headers = securityHeadersFor(mode);
      expect(headers).toBeTypeOf('function');
      expect(await headers!()).toEqual([{ source: '/:path*', headers: SECURITY_HEADERS }]);
    }
  });

  it('emit nothing for a static export, where Next cannot send headers', () => {
    expect(securityHeadersFor('export')).toBeUndefined();
  });
});
