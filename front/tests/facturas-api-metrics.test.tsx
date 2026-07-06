import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { Factura } from '@/lib/mock/data';
import type { InvoiceMetrics } from '@/lib/invoices/metrics';
import Page from '@/app/(crm)/facturas/page';

// crm-paridad-facturas-pedidos-aa (PR-3): en modo API los KPIs deben venir del back
// (`GET /invoices` → metrics, calculadas sobre TODAS las facturas del negocio) y NO
// computarse en el front sobre la página devuelta. Este test reproduce el bug: el listado
// solo trae 1 página (20 facturas), pero el negocio tiene 57. Si los KPIs se calcularan sobre
// `items` (la página), "Facturas" mostraría 20 y "Importe total" €200.00. Con el fix muestran
// los valores server-side (57 / €7350.00).

// Página 1 del listado: 20 facturas Pendiente de 10€ (lo que useCollection entregaría en API).
const PAGE_ITEMS: Factura[] = Array.from({ length: 20 }, (_v, i) => ({
  id: 3000 + i,
  numero: `F-2026-${String(i).padStart(3, '0')}`,
  cliente: `Cliente ${i}`,
  servicio: 'Corte',
  fecha: '2026-07-01',
  total: 10,
  estado: 'Pendiente',
  documentos: [],
}));

// Métricas server-side sobre el conjunto COMPLETO (57 facturas), como las emitiría el back.
const SERVER_METRICS: InvoiceMetrics = {
  totalFacturas: 57,
  importeTotal: 7350,
  pendientes: 30,
  importePendiente: 3000,
  pagadas: 20,
  importePagado: 4000,
  anuladas: 7,
  importeAnulado: 350,
};

vi.mock('@/lib/data/use-collection', () => ({
  useCollection: () => ({ items: PAGE_ITEMS, create: vi.fn(), update: vi.fn(), remove: vi.fn(), reset: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/lib/data/use-documents', () => ({
  useDocumentos: () => ({ docs: [], add: vi.fn(), remove: vi.fn(), refresh: vi.fn() }),
}));

// Modo API activo + apiFetch devuelve el envelope con metrics (el hook lee `r.metrics`).
vi.mock('@/lib/api/client', () => ({
  isApiEnabled: () => true,
  apiFetch: vi.fn(async () => ({ items: PAGE_ITEMS, total: 57, page: 1, limit: 20, metrics: SERVER_METRICS })),
}));

vi.mock('@/lib/tenant-config-context', () => ({
  useTerm: (_key: string, fallback: string) => fallback,
  useRole: () => ({ role: 'admin', setRole: vi.fn() }),
}));

vi.mock('@/components/layout/module-guard', () => ({
  ModuleGuard: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

afterEach(() => { cleanup(); });

describe('facturas/page — métricas server-side en modo API (PR-3)', () => {
  it('muestra los KPIs del conjunto COMPLETO (57 / €7350.00), no los de la página (20 / €200.00)', async () => {
    render(<Page />);

    // Server-side: 57 facturas, €7350.00 importe total. Aparecen tras resolver el fetch.
    expect(await screen.findByText('57')).toBeInTheDocument();
    expect(await screen.findByText('€7350.00')).toBeInTheDocument();
    // Importe pendiente server-side.
    expect(await screen.findByText('€3000.00')).toBeInTheDocument();
    // KPI "Importe cobrado" (crm-operaos 10.3): Σ total de facturas Pagadas, server-side.
    expect(await screen.findByText('Importe cobrado')).toBeInTheDocument();
    expect(await screen.findByText('€4000.00')).toBeInTheDocument();

    // El bug (cálculo sobre la página de 20) daría estos valores: NO deben aparecer.
    expect(screen.queryByText('20')).toBeNull();       // "Facturas" no es 20
    expect(screen.queryByText('€200.00')).toBeNull();  // "Importe total" no es €200.00
  });
});
