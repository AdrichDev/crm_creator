/**
 * front/lib/security-headers.ts
 *
 * Baseline browser security headers for every route served by Next (dev and the
 * standalone web ZIP). No full CSP yet: only `frame-ancestors`, so nothing the app
 * loads today can break. Static exports (exe/apk) have no server and get none.
 */
import type { NextConfig } from 'next';

export const SECURITY_HEADERS: { key: string; value: string }[] = [
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(self)' },
];

export function securityHeadersFor(output: string | undefined): NextConfig['headers'] {
  if (output === 'export') return undefined;
  return async () => [{ source: '/:path*', headers: SECURITY_HEADERS }];
}
