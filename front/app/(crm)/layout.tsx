import { AppShell } from '@/components/layout/app-shell';
import { BrandingHead } from '@/components/layout/branding-head';
export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return <AppShell><BrandingHead />{children}</AppShell>;
}
