import type { Metadata } from 'next';
import './globals.css';
import { TenantConfigProvider } from '@/lib/tenant-config-context';
import { BrandingStyle } from '@/components/layout/branding-style';
import { BrandingHead } from '@/components/layout/branding-head';
import { CrmThemeProvider } from '@/components/layout/theme-provider';
import { DialogProvider } from '@/components/ui/dialog-provider';

export const metadata: Metadata = {
  title: 'SaaS Multi-Negocio',
  description: 'Plantilla SaaS modular y configurable por tipo de negocio.',
};

// Resuelve el tema antes de pintar: evita el flash y fija data-theme en <html>
// antes de hidratar. Espejo de lib/theme/crm-theme.ts: solo light/dark; cualquier
// valor que no sea 'light' (incluido 'system' legado o ausente) → resuelve por SO una vez.
const themeBootstrap = `(function(){try{var m=localStorage.getItem('crm-theme.mode.v1');var dark=m==='dark'||(m!=='light'&&(!window.matchMedia||window.matchMedia('(prefers-color-scheme: dark)').matches));document.documentElement.dataset.theme=dark?'dark':'light';}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: el bootstrap fija data-theme en <html> antes de
    // hidratar, y algunas extensiones del navegador inyectan atributos en
    // <html>/<body> antes de que React cargue. Suprime SOLO el diff de atributos
    // de estos nodos raíz (no afecta a los hijos ni oculta mismatches reales).
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className="font-sans antialiased" suppressHydrationWarning>
        <TenantConfigProvider>
          <DialogProvider>
            <BrandingStyle />
            <BrandingHead />
            <CrmThemeProvider />
            {children}
          </DialogProvider>
        </TenantConfigProvider>
      </body>
    </html>
  );
}
