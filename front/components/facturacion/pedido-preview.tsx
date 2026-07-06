'use client';
import { ArrowLeft, Printer } from 'lucide-react';
import { Badge, Button } from '@/components/ui/primitives';
import { useTenantBranding } from '@/lib/tenant-config-context';
import type { Pedido } from '@/lib/mock/data';

const eur = (n: number) => '€' + Number(n).toFixed(2);
const num = (n: unknown) => Number(n ?? 0);

/** Ciclo de estados idéntico al de AA (generada|aceptada|rechazada|caducada). */
export function pedidoTone(estado: string): 'amber' | 'green' | 'red' | 'gray' {
  if (estado === 'aceptada') return 'green';
  if (estado === 'rechazada') return 'red';
  if (estado === 'caducada') return 'gray';
  return 'amber'; // generada
}

interface PedidoPreviewProps {
  pedido: Pedido;
  onBack: () => void;
}

/**
 * Documento imprimible de pedido/presupuesto para CRM
 * (crm-paridad-facturas-pedidos-aa, Fase 3, task 3.1).
 *
 * Paridad con `agents-agency/front/components/facturacion/BudgetPreview.tsx`: misma
 * estructura documental (cabecera PRESUPUESTO, emisor/cliente, tabla de conceptos con
 * pago único + mensualidad, totales con IVA, condiciones, barra Volver/Imprimir, aislamiento
 * @media print). Única divergencia permitida (design.md § decisión 4): el logo por tenant
 * queda fuera de alcance. Los importes Decimal del back llegan como string → se coaccionan
 * con Number(). Si el pedido está `aceptada`, se muestra que ya generó su factura (PR-2b).
 */
export function PedidoPreview({ pedido: p, onBack }: PedidoPreviewProps) {
  const fecha = (p.createdAt || '').slice(0, 10);
  const subtotalImpl = num(p.subtotalImpl);
  const subtotalMant = num(p.subtotalMant);
  const tasaIva = num(p.tasaIva) || 0.21;
  const vatImpl = subtotalImpl * tasaIva;
  const vatMant = subtotalMant * tasaIva;
  const cli = p.clienteSnapshot ?? {};
  const emi = p.emisorSnapshot ?? {};
  // Cabecera del documento: imagen de marca 2 con fallback a la imagen de marca.
  // Si ninguna existe, no se muestra imagen (nunca iniciales).
  const branding = useTenantBranding();
  const headerImg = branding.logoImage2 || branding.logoImage;

  return (
    <div className="w-full">
      {/* Barra de controles (no se imprime). */}
      <div className="no-print mb-6 flex items-center justify-between gap-4 rounded-[10px] border border-white/5 bg-[var(--panel-card)] p-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" /> Volver
          </Button>
          <Badge tone={pedidoTone(p.estado)}>{p.estado}</Badge>
        </div>
        <Button variant="primary" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Imprimir
        </Button>
      </div>

      {/* Aísla la impresión: oculta el chrome del panel y deja solo el documento. */}
      <style dangerouslySetInnerHTML={{ __html: `
        @page { size: auto; margin: 0mm; }
        @media print {
          body { background: #fff !important; color: #0f172a !important; margin: 15mm !important; }
          .no-print, nav, aside, header { display: none !important; }
          .print-area { box-shadow: none !important; margin: 0 !important; max-width: 100% !important; }
        }
      `}} />

      {/* PRESUPUESTO IMPRIMIBLE — documento claro y autónomo (estilos en línea como en AA). */}
      <div
        className="print-area mx-auto max-w-4xl overflow-hidden rounded-2xl bg-white text-slate-900 shadow-xl"
        style={{ fontFamily: "'Inter', sans-serif" }}
      >
        <div className="p-10 md:p-14">
          {/* CABECERA */}
          <div className="mb-8 flex items-start justify-between pb-8" style={{ borderBottom: '2px solid #e2e8f0' }}>
            <div>
              <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 34, fontWeight: 900, color: '#0f172a', textTransform: 'uppercase', letterSpacing: 2, margin: '0 0 12px' }}>
                Presupuesto
              </h2>
              <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.6 }}>
                <p style={{ margin: 0 }}><strong>Nº:</strong> {p.numero}</p>
                <p style={{ margin: 0 }}><strong>Fecha:</strong> {fecha}</p>
                <p style={{ margin: 0 }}><strong>Validez:</strong> {p.diasValidez ?? 30} días</p>
              </div>
            </div>
            {/* Imagen de cabecera por tenant (logoImage2 → logoImage). */}
            {headerImg && (
              <img src={headerImg} alt="Marca" style={{ maxHeight: 64, maxWidth: 200, objectFit: 'contain' }} />
            )}
          </div>

          {/* EMISOR + CLIENTE */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, marginBottom: 40, fontSize: 13 }}>
            <div>
              <h3 style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 2, borderBottom: '1px solid #e2e8f0', paddingBottom: 6, marginBottom: 10 }}>Emisor</h3>
              <p style={{ fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>{emi.empresa || '—'}</p>
              {emi.cif && <p style={{ color: '#64748b', margin: '0 0 2px' }}>NIF/CIF: {emi.cif}</p>}
              {emi.direccion && <p style={{ color: '#64748b', margin: '0 0 2px' }}>{emi.direccion}</p>}
              {emi.email && <p style={{ color: '#64748b', margin: '0 0 2px' }}>{emi.email}</p>}
              {emi.telefono && <p style={{ color: '#64748b', margin: 0 }}>{emi.telefono}</p>}
            </div>
            <div>
              <h3 style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 2, borderBottom: '1px solid #e2e8f0', paddingBottom: 6, marginBottom: 10 }}>Cliente</h3>
              <p style={{ fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>{cli.nombre || '—'}</p>
              {cli.cif && <p style={{ color: '#64748b', margin: '0 0 2px' }}>NIF/CIF: {cli.cif}</p>}
              {cli.direccion && <p style={{ color: '#64748b', margin: '0 0 2px' }}>{cli.direccion}</p>}
              {cli.email && <p style={{ color: '#64748b', margin: 0 }}>{cli.email}</p>}
              {cli.contacto && <p style={{ color: '#64748b', margin: '4px 0 0', fontSize: 11 }}>Atn: {cli.contacto}</p>}
            </div>
          </div>

          {/* TABLA DE CONCEPTOS */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 32 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, borderBottom: '2px solid #e2e8f0' }}>Concepto</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: '#475569', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, borderBottom: '2px solid #e2e8f0' }}>Cant.</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#475569', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, borderBottom: '2px solid #e2e8f0' }}>Pago único</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#475569', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, borderBottom: '2px solid #e2e8f0' }}>Mensualidad</th>
              </tr>
            </thead>
            <tbody>
              {p.lines.map((l, i) => (
                <tr key={l.id ?? i} style={{ background: i % 2 === 0 ? '#ffffff' : '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 600, color: '#0f172a' }}>
                    {l.nombre}
                    {l.descripcion && <span style={{ display: 'block', fontSize: 11, color: '#94a3b8', fontWeight: 400, marginTop: 2 }}>{l.descripcion}</span>}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', color: '#475569' }}>{num(l.cantidad)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#475569', fontVariantNumeric: 'tabular-nums' }}>
                    {num(l.precioImpl) > 0 ? `${eur(num(l.precioImpl) * num(l.cantidad))}` : '—'}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#475569', fontVariantNumeric: 'tabular-nums' }}>
                    {num(l.precioMant) > 0 ? `${eur(num(l.precioMant) * num(l.cantidad))}/mes` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* TOTALES */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 40 }}>
            <div style={{ width: 340, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 24px', fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', marginBottom: 8 }}>
                <span>Base (pago único):</span>
                <span style={{ fontWeight: 600, color: '#0f172a' }}>{eur(subtotalImpl)}</span>
              </div>
              {subtotalMant > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', marginBottom: 8 }}>
                  <span>Base (mensual):</span>
                  <span style={{ fontWeight: 600, color: '#0f172a' }}>{eur(subtotalMant)}/mes</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: 12, paddingTop: 8, borderTop: '1px solid #e2e8f0', marginBottom: 8 }}>
                <span>IVA ({Math.round(tasaIva * 100)}%):</span>
                <span>{eur(vatImpl)}{subtotalMant > 0 ? ` / ${eur(vatMant)}/mes` : ''}</span>
              </div>
              <div style={{ borderTop: '2px solid #e2e8f0', paddingTop: 12, marginTop: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 16, color: '#0f172a', marginBottom: subtotalMant > 0 ? 6 : 0 }}>
                  <span>Total pago único:</span>
                  <span>{eur(num(p.totalImpl))}</span>
                </div>
                {subtotalMant > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 16, color: '#0f172a' }}>
                    <span>Total mensual:</span>
                    <span>{eur(num(p.totalMant))}/mes</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ORIGEN / FACTURA — un pedido aceptado ya generó su factura (PR-2b). */}
          {p.estado === 'aceptada' && (
            <p style={{ fontSize: 12, color: '#166534', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', margin: '0 0 24px' }}>
              Pedido aceptado: se generó automáticamente su factura. Consúltala en la sección Facturas.
            </p>
          )}

          {/* CONDICIONES */}
          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 24, fontSize: 11, color: '#64748b' }}>
            <h4 style={{ fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, fontSize: 10 }}>Términos y condiciones</h4>
            <ul style={{ margin: 0, paddingLeft: 16, lineHeight: 1.7 }}>
              <li>Este presupuesto tiene una validez de {p.diasValidez ?? 30} días naturales desde la fecha de emisión.</li>
              <li>Los precios indicados no incluyen IVA, aplicable según normativa vigente.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
