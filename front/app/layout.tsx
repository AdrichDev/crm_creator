import type { Metadata } from 'next';
import './globals.css';
import { TenantConfigProvider } from '@/lib/tenant-config-context';
import { BrandingStyle } from '@/components/layout/branding-style';

export const metadata: Metadata = {
  title: 'SaaS Multi-Negocio',
  description: 'Plantilla SaaS modular y configurable por tipo de negocio.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="font-sans antialiased">
        <TenantConfigProvider>
          <BrandingStyle />
          {children}
        </TenantConfigProvider>
      </body>
    </html>
  );
}
