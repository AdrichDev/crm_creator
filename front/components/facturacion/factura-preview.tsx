'use client';
import type { CSSProperties } from 'react';
import { ArrowLeft, Printer } from 'lucide-react';
import { Badge, Button } from '@/components/ui/primitives';
import { DocumentosPanel } from '@/components/ui/documentos-panel';
import { useTenantBranding } from '@/lib/tenant-config-context';
import type { Documento, Factura } from '@/lib/mock/data';

const eur = (n: number) => '€' + n.toFixed(2);
const tone = (s: string) => (s === 'Pagada' ? 'green' : s === 'Anulada' ? 'red' : 'amber');

interface FacturaPreviewProps {
  factura: Factura;
  /** Vista del rol cliente: oculta el nombre del cliente, muestra el servicio recibido. */
  vistaCliente: boolean;
  onBack: () => void;
  docs: Documento[];
  canUpload: boolean;
  onAddDoc: (doc: Documento) => void;
  onRemoveDoc?: (id: number | string) => void;
}

/**
 * Documento imprimible de factura para CRM (crm-paridad-facturas-pedidos-aa Fase 2, task 2.3;
 * detalle documental crm-operaos 10.3).
 *
 * Desde 10.3 la factura es AUTOCONTENIDA y el preview espeja el de AA
 * (`agents-agency/front/components/presupuestos/InvoicePreview.tsx`): tabla de líneas
 * snapshotadas + desglose Base imponible / IVA / Total. El detalle se lee SIEMPRE de la
 * propia factura (lines/subtotal/tasaIva), nunca del pedido origen — la factura sobrevive
 * al borrado del pedido. Facturas sin líneas (mock antiguo / fila legacy sin backfill)
 * degradan al bloque simple de total, sin romper. El IVA mostrado se deriva como
 * total - subtotal (no subtotal*tasa) para que el desglose CUADRE al céntimo con los
 * importes persistidos. Los documentos adjuntos se conservan en un panel fuera de impresión.
 */
export function FacturaPreview({
  factura: f,
  vistaCliente,
  onBack,
  docs,
  canUpload,
  onAddDoc,
  onRemoveDoc,
}: FacturaPreviewProps) {
  // Desglose autocontenido (10.3). Decimales del back llegan como string → Number().
  const lines = f.lines ?? [];
  const total = Number(f.total);
  const subtotal = f.subtotal != null ? Number(f.subtotal) : total;
  const tasaIva = f.tasaIva != null ? Number(f.tasaIva) : 0;
  // IVA por diferencia (no subtotal*tasa): garantiza subtotal + IVA = total al céntimo.
  const iva = Math.round((total - subtotal + Number.EPSILON) * 100) / 100;
  // Cabecera del documento: imagen de marca 2 con fallback a la imagen de marca.
  // Si ninguna existe, no se muestra imagen (nunca iniciales).
  const branding = useTenantBranding();
  const headerImg = branding.logoImage2 || branding.logoImage;

  const th: CSSProperties = { padding: '10px 12px', fontWeight: 700, color: '#475569', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, borderBottom: '2px solid #e2e8f0' };

  return (
    <div className="w-full">
      {/* Barra de controles (no se imprime). */}
      <div className="no-print mb-6 flex items-center justify-between gap-4 rounded-[10px] border border-white/5 bg-[var(--panel-card)] p-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" /> Volver
          </Button>
          <Badge tone={tone(f.estado)}>{f.estado}</Badge>
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

      {/* FACTURA IMPRIMIBLE — documento claro, autónomo (estilos en línea como en AA). */}
      <div
        className="print-area mx-auto max-w-3xl overflow-hidden rounded-2xl bg-white text-slate-900 shadow-xl"
        style={{ fontFamily: "'Inter', sans-serif" }}
      >
        <div className="p-10 md:p-14">
          {/* CABECERA */}
          <div className="mb-8 flex items-start justify-between pb-8" style={{ borderBottom: '2px solid #e2e8f0' }}>
            <div>
              <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 34, fontWeight: 900, color: '#0f172a', textTransform: 'uppercase', letterSpacing: 2, margin: '0 0 12px' }}>
                Factura
              </h2>
              <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.6 }}>
                <p style={{ margin: 0 }}><strong>Nº:</strong> {f.numero}</p>
                <p style={{ margin: 0 }}><strong>Fecha:</strong> {f.fecha}</p>
                <p style={{ margin: 0 }}><strong>Estado:</strong> {f.estado}</p>
              </div>
            </div>
            {/* Imagen de cabecera por tenant (logoImage2 → logoImage). */}
            {headerImg && (
              <img src={headerImg} alt="Marca" style={{ maxHeight: 64, maxWidth: 200, objectFit: 'contain' }} />
            )}
          </div>

          {/* CLIENTE / SERVICIO */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, marginBottom: 40, fontSize: 13 }}>
            {!vistaCliente && (
              <div>
                <h3 style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 2, borderBottom: '1px solid #e2e8f0', paddingBottom: 6, marginBottom: 10 }}>
                  Cliente
                </h3>
                <p style={{ fontWeight: 700, color: '#0f172a', margin: 0 }}>{f.cliente || '—'}</p>
              </div>
            )}
            {/* El bloque Servicio solo tiene sentido sin detalle de líneas (legacy/mock sin backfill). */}
            {lines.length === 0 && (
              <div>
                <h3 style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 2, borderBottom: '1px solid #e2e8f0', paddingBottom: 6, marginBottom: 10 }}>
                  Servicio / Concepto
                </h3>
                <p style={{ fontWeight: 700, color: '#0f172a', margin: 0 }}>{f.servicio || '—'}</p>
              </div>
            )}
          </div>

          {/* TABLA DE CONCEPTOS (10.3) — líneas snapshotadas EN la factura, espejo visual de AA. */}
          {lines.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 32 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th style={{ ...th, textAlign: 'left' }}>Servicio / Concepto</th>
                  <th style={{ ...th, textAlign: 'center' }}>Cant.</th>
                  <th style={{ ...th, textAlign: 'right' }}>Precio unit.</th>
                  <th style={{ ...th, textAlign: 'right' }}>Importe</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={l.id ?? i} style={{ background: i % 2 === 0 ? '#ffffff' : '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600, color: '#0f172a' }}>
                      {l.nombre}
                      {l.descripcion && (
                        <span style={{ display: 'block', fontSize: 11, color: '#94a3b8', fontWeight: 400, marginTop: 2 }}>{l.descripcion}</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', color: '#475569' }}>{Number(l.cantidad)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#475569', fontVariantNumeric: 'tabular-nums' }}>{eur(Number(l.precioUnit))}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{eur(Number(l.importe))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* TOTALES — desglose Base imponible / IVA / Total (autocontenido; IVA por diferencia). */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 40 }}>
            <div style={{ width: 320, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 24px', fontSize: 13 }}>
              {lines.length > 0 && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', marginBottom: 8 }}>
                    <span>Base imponible:</span>
                    <span style={{ fontWeight: 600, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{eur(subtotal)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: 12, paddingTop: 8, borderTop: '1px solid #e2e8f0', marginBottom: 8 }}>
                    <span>IVA ({Math.round(tasaIva * 100)}%):</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{eur(iva)}</span>
                  </div>
                </>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontWeight: 800, fontSize: 18, color: '#0f172a', borderTop: lines.length > 0 ? '2px solid #e2e8f0' : undefined, paddingTop: lines.length > 0 ? 12 : 0 }}>
                <span>Total:</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{eur(total)}</span>
              </div>
            </div>
          </div>

          {/* ORIGEN (solo si la factura nació de un pedido aceptado; pedidoId puede ser null). */}
          {f.pedidoId && (
            <p style={{ fontSize: 11, color: '#64748b', borderTop: '1px solid #e2e8f0', paddingTop: 16, margin: 0 }}>
              Generada automáticamente al aceptar un pedido.
            </p>
          )}
        </div>
      </div>

      {/* DOCUMENTOS ADJUNTOS — se conservan (task 2.3); fuera de impresión. */}
      <div className="no-print mx-auto mt-6 max-w-3xl rounded-[10px] border border-white/5 bg-[var(--panel-card)] p-5">
        <DocumentosPanel docs={docs} canUpload={canUpload} onAdd={onAddDoc} onRemove={onRemoveDoc} />
      </div>
    </div>
  );
}
