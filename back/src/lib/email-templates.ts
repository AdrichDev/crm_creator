// ---------------------------------------------------------------------------
// Plantillas HTML de los correos automáticos (digests) que viajan por n8n.
// El back RENDERIZA el HTML aquí (control de estructura en el repo) y lo adjunta
// al envelope como { subject, html }; n8n solo lo despacha. Mismo espíritu que
// lib/email.ts (HTML inline, sin imágenes externas ni tracking), pero con una
// maqueta estructurada compartida: cabecera con el negocio, tabla y total.
// ---------------------------------------------------------------------------

export interface EmailContent {
  subject: string;
  html: string;
}

const BRAND = '#1d4ed8';

/** Escapa HTML en datos controlados por el tenant (anti-inyección). */
function esc(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Formato moneda es-ES (EUR). */
function eur(n: number): string {
  return (n ?? 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

/**
 * Envoltorio común: cabecera con el nombre del negocio, título, cuerpo y pie.
 * Diseño table-based e inline-styles por compatibilidad con clientes de correo.
 */
export function emailShell(opts: {
  businessName: string;
  title: string;
  introHtml?: string;
  bodyHtml: string;
}): string {
  const { businessName, title, introHtml = '', bodyHtml } = opts;
  return `<div style="margin:0;padding:24px 12px;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;border-collapse:collapse;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <tr><td style="background:${BRAND};padding:20px 28px;">
          <span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:.2px;">${esc(businessName)}</span>
        </td></tr>
        <tr><td style="padding:28px;">
          <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;color:#0f172a;">${esc(title)}</h1>
          ${introHtml}
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:16px 28px;background:#f8fafc;border-top:1px solid #eef2f7;color:#94a3b8;font-size:12px;line-height:1.5;">
          Mensaje automático de ${esc(businessName)} · OperaOS
        </td></tr>
      </table>
    </td></tr>
  </table>
</div>`;
}

function intro(text: string): string {
  return `<p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#334155;">${text}</p>`;
}

/** Tabla estructurada. La última columna se alinea a la derecha (importes). */
function tableHtml(headers: string[], rows: string[][]): string {
  const th = headers
    .map((h, i) => `<th style="padding:8px 10px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.3px;color:#64748b;border-bottom:2px solid #e2e8f0;text-align:${i === headers.length - 1 ? 'right' : 'left'};">${esc(h)}</th>`)
    .join('');
  const trs = rows
    .map((r) => `<tr>${r
      .map((c, i) => `<td style="padding:9px 10px;font-size:14px;color:#0f172a;border-bottom:1px solid #f1f5f9;text-align:${i === r.length - 1 ? 'right' : 'left'};${i === r.length - 1 ? 'font-variant-numeric:tabular-nums;' : ''}">${esc(c)}</td>`)
      .join('')}</tr>`)
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:8px 0 4px;">
    <thead><tr>${th}</tr></thead>
    <tbody>${trs}</tbody>
  </table>`;
}

/** Fila de total destacada bajo la tabla. */
function totalRow(label: string, value: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin-top:8px;">
    <tr>
      <td style="padding:10px 10px;font-size:14px;font-weight:600;color:#334155;">${esc(label)}</td>
      <td style="padding:10px 10px;font-size:18px;font-weight:700;color:${BRAND};text-align:right;font-variant-numeric:tabular-nums;">${esc(value)}</td>
    </tr>
  </table>`;
}

// --- Renderers por tipo de digest -----------------------------------------

export interface InvoiceRow { numero: string; cliente: string; total: number; estado: string; }

export function invoicePendingEmail(businessName: string, rows: InvoiceRow[]): EmailContent {
  const total = rows.reduce((s, r) => s + (r.total ?? 0), 0);
  const body =
    tableHtml(['Nº', 'Cliente', 'Estado', 'Importe'], rows.map((r) => [r.numero, r.cliente, r.estado, eur(r.total)])) +
    totalRow('Total pendiente', eur(total));
  return {
    subject: `${rows.length} factura${rows.length === 1 ? '' : 's'} pendiente${rows.length === 1 ? '' : 's'} · ${businessName}`,
    html: emailShell({
      businessName,
      title: 'Facturas pendientes',
      introHtml: intro(`Tienes <strong>${rows.length}</strong> factura${rows.length === 1 ? '' : 's'} pendiente${rows.length === 1 ? '' : 's'} de cobro.`),
      bodyHtml: body,
    }),
  };
}

export interface CashMethodRow { metodo: string; count: number; total: number; }

export function cashSummaryEmail(businessName: string, fecha: string, total: number, porMetodo: CashMethodRow[]): EmailContent {
  const body = porMetodo.length === 0
    ? intro('No se registraron ventas en la jornada.')
    : tableHtml(['Método', 'Ventas', 'Importe'], porMetodo.map((m) => [m.metodo, String(m.count), eur(m.total)])) +
      totalRow('Total del día', eur(total));
  return {
    subject: `Resumen de caja · ${fecha} · ${businessName}`,
    html: emailShell({
      businessName,
      title: 'Resumen de caja',
      introHtml: intro(`Ventas de <strong>${esc(fecha)}</strong>.`),
      bodyHtml: body,
    }),
  };
}

export interface StockRow { nombre: string; stock: number; minimo: number; }

export function lowStockEmail(businessName: string, rows: StockRow[]): EmailContent {
  const body = tableHtml(
    ['Producto', 'Stock', 'Mínimo'],
    rows.map((r) => [r.nombre, String(r.stock), String(r.minimo)]),
  );
  return {
    subject: `${rows.length} producto${rows.length === 1 ? '' : 's'} con stock bajo · ${businessName}`,
    html: emailShell({
      businessName,
      title: 'Stock bajo',
      introHtml: intro(`<strong>${rows.length}</strong> producto${rows.length === 1 ? '' : 's'} por debajo del mínimo.`),
      bodyHtml: body,
    }),
  };
}

export interface ReactivationRow { nombre: string; fecha: string; }

export function reactivationEmail(businessName: string, rows: ReactivationRow[], total: number): EmailContent {
  const restantes = total - rows.length;
  const body =
    tableHtml(['Cliente', 'Última cita'], rows.map((r) => [r.nombre, r.fecha])) +
    (restantes > 0 ? `<p style="margin:8px 0 0;font-size:12px;color:#94a3b8;">y ${restantes} más…</p>` : '');
  return {
    subject: `${total} cliente${total === 1 ? '' : 's'} a reactivar · ${businessName}`,
    html: emailShell({
      businessName,
      title: 'Clientes a reactivar',
      introHtml: intro(`<strong>${total}</strong> cliente${total === 1 ? '' : 's'} llevan tiempo sin venir.`),
      bodyHtml: body,
    }),
  };
}

export interface FichajeRow { empleado: string; horas: number; }

export function fichajeWeeklyEmail(businessName: string, rows: FichajeRow[]): EmailContent {
  const totalH = rows.reduce((s, r) => s + (r.horas ?? 0), 0);
  const body =
    tableHtml(['Empleado', 'Horas'], rows.map((r) => [r.empleado, `${r.horas.toFixed(1)} h`])) +
    totalRow('Total horas', `${totalH.toFixed(1)} h`);
  return {
    subject: `Resumen de fichaje semanal · ${businessName}`,
    html: emailShell({
      businessName,
      title: 'Fichaje semanal',
      introHtml: intro('Horas registradas la semana pasada.'),
      bodyHtml: body,
    }),
  };
}

// --- Transaccionales al cliente (mensaje, sin tabla) ----------------------

export function birthdayEmail(businessName: string, customerName: string): EmailContent {
  return {
    subject: `¡Feliz cumpleaños! · ${businessName}`,
    html: emailShell({
      businessName,
      title: '¡Feliz cumpleaños! 🎉',
      bodyHtml: intro(`Hola <strong>${esc(customerName)}</strong>, todo el equipo de <strong>${esc(businessName)}</strong> te desea un feliz día.`),
    }),
  };
}

export function packageRenewalEmail(businessName: string, customerName: string, packageName: string, sesionesRestantes: number): EmailContent {
  return {
    subject: `Tu bono ${packageName} está por agotarse · ${businessName}`,
    html: emailShell({
      businessName,
      title: 'Tu bono está por agotarse',
      bodyHtml: intro(`Hola <strong>${esc(customerName)}</strong>, tu bono <strong>${esc(packageName)}</strong> tiene <strong>${sesionesRestantes}</strong> sesión${sesionesRestantes === 1 ? '' : 'es'} restante${sesionesRestantes === 1 ? '' : 's'}. Escríbenos para renovarlo cuando quieras.`),
    }),
  };
}
