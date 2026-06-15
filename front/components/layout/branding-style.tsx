'use client';
import { useTenantConfig } from '@/lib/tenant-config-context';

// Inyecta las variables CSS de marca según la config del tenant (runtime).
// Si la IA extrajo tokens completos de la landing, también se aplican
// fondo, texto, acento, tipografía y radio para que el CRM herede su look.
export function BrandingStyle() {
  const { config } = useTenantConfig();
  const { primary, secondary, tokens } = config.branding;
  const pal = tokens?.palette ?? {};
  const typo = tokens?.typography ?? {};
  const shape = tokens?.shape ?? {};

  const vars: string[] = [
    `--brand-primary:${primary}`,
    `--brand-secondary:${secondary}`,
  ];
  if (pal.background) vars.push(`--brand-bg:${pal.background}`);
  if (pal.text) vars.push(`--brand-text:${pal.text}`);
  if (pal.accent) vars.push(`--brand-accent:${pal.accent}`);
  if (typo.heading) vars.push(`--brand-font-heading:${typo.heading}`);
  if (typo.body) vars.push(`--brand-font-body:${typo.body}`);
  if (shape.radius) vars.push(`--brand-radius:${shape.radius}`);
  if (shape.shadow) vars.push(`--brand-shadow:${shape.shadow}`);

  const css = `:root{${vars.join(';')};}`;
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
