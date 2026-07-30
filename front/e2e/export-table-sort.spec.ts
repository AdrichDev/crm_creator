import { test, expect } from '@playwright/test';
import { login, requiereCredenciales } from './_auth';

requiereCredenciales();

test('export table proyecto column has sort icon on same line', async ({ page }) => {
  await login(page);

  // Navigate to dashboard
  await page.goto('/dashboard', { waitUntil: 'networkidle' });

  // Click on "Exportar" tab
  await page.click('button:has-text("Exportar")');
  await page.waitForTimeout(500);

  // Get the Proyecto header th element
  const proyectoHeader = page.locator('th:has-text("Proyecto")').first();
  await expect(proyectoHeader).toBeVisible();

  // Get the text content
  const text = await proyectoHeader.innerText();
  console.log(`Proyecto header text: "${text}"`);

  // Check if text contains newline (wrapping issue)
  if (text.includes('\n')) {
    throw new Error('✗ FAIL: Proyecto header text is wrapped (contains newline)');
  }

  console.log('✓ PASS: Proyecto + sort icon on same line');

  // Take screenshot
  await page.screenshot({ path: 'export-table-proyecto.png', fullPage: false });
  console.log('✓ Screenshot saved: export-table-proyecto.png');

  // Verify the th has whitespace-nowrap class
  const className = await proyectoHeader.getAttribute('class');
  if (!className?.includes('whitespace-nowrap')) {
    console.warn('⚠ Warning: whitespace-nowrap class not found directly, but text appears OK');
  } else {
    console.log('✓ whitespace-nowrap class confirmed');
  }
});
