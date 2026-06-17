'use client';
import { useEffect } from 'react';
import { useTenantConfig } from '@/lib/tenant-config-context';

// Ajusta en runtime el <title> de la pestaña y el favicon según la marca del
// tenant (la consola fuente usa DEFAULT_CONFIG; un CRM generado, su negocio).
// - title  = nombre de la empresa importada.
// - favicon = imagen de marca cargada; si no hay, se genera uno con las
//   iniciales sobre el degradado de colores de marca.
function setFavicon(href: string) {
  if (typeof document === 'undefined') return;
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = href;
}

// Favicon generado: degradado primary→secondary + iniciales (logoText) en blanco.
function generateFavicon(primary: string, secondary: string, text: string): string | null {
  if (typeof document === 'undefined') return null;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, secondary || primary || '#1b431c');
  grad.addColorStop(1, primary || secondary || '#1b431c');
  ctx.fillStyle = grad;
  // Esquinas redondeadas.
  const r = 12;
  ctx.beginPath();
  ctx.moveTo(r, 0); ctx.arcTo(size, 0, size, size, r); ctx.arcTo(size, size, 0, size, r);
  ctx.arcTo(0, size, 0, 0, r); ctx.arcTo(0, 0, size, 0, r); ctx.closePath();
  ctx.fill();
  const initials = (text || '··').slice(0, 2).toUpperCase();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 32px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initials, size / 2, size / 2 + 2);
  return canvas.toDataURL('image/png');
}

export function BrandingHead() {
  const { config } = useTenantConfig();
  const { name } = config.business;
  const { primary, secondary, logoText, logoImage } = config.branding;

  useEffect(() => {
    if (name) document.title = name;
  }, [name]);

  useEffect(() => {
    if (logoImage) { setFavicon(logoImage); return; }
    const generated = generateFavicon(primary, secondary, logoText);
    if (generated) setFavicon(generated);
  }, [logoImage, primary, secondary, logoText]);

  return null;
}
