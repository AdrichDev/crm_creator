'use client';
import { ArrowLeft, Printer } from 'lucide-react';
import { Badge, Button } from '@/components/ui/primitives';
import { DocumentosPanel } from '@/components/ui/documentos-panel';
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
 * Documento imprimible de factura para CRM (crm-paridad-facturas-pedidos-aa, Fase 2, task 2.3).
 *
 * Paridad DELIBERADAMENTE LIGERA con `agents-agency/front/components/facturacion/InvoicePreview.tsx`:
 * misma idea visual (cabecera FACTURA, emisor/cliente, total destacado, barra Volver/Imprimir,
 * aislamiento de impresión con @media print), pero SIN tabla de líneas ni desglose de IVA —
 * el modelo `crm.factura` es plano (numero, cliente, servicio, fecha, total, estado) por decisión
 * del dueño (design.md § Decisiones adicionales resueltas, punto 1). El logo por tenant queda
 * fuera de alcance (mismo doc). Los documentos adjuntos se conservan en un panel fuera de impresión.
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
            <div>
              <h3 style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 2, borderBottom: '1px solid #e2e8f0', paddingBottom: 6, marginBottom: 10 }}>
                Servicio / Concepto
              </h3>
              <p style={{ fontWeight: 700, color: '#0f172a', margin: 0 }}>{f.servicio || '—'}</p>
            </div>
          </div>

          {/* TOTAL */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 40 }}>
            <div style={{ width: 320, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontWeight: 800, fontSize: 18, color: '#0f172a' }}>
                <span>Total:</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{eur(Number(f.total))}</span>
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
