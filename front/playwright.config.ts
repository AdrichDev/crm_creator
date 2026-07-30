import { defineConfig } from '@playwright/test';

// E2E_BASE_URL apunta a un servidor YA levantado (por ejemplo uno efímero con su propio
// NEXT_DIST_DIR). Cuando está presente, Playwright NO arranca ninguno: un segundo
// `next dev` sobre el mismo `.next` corrompe la caché del servidor del usuario.
//   NEXT_DIST_DIR=.next-e2e npx next dev -p 3101
//   E2E_BASE_URL=http://127.0.0.1:3101 npx playwright test
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3002';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: { baseURL, headless: true },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:3002',
        timeout: 120_000,
        reuseExistingServer: true,
      },
});
