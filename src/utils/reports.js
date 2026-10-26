import { createReport, money, dateTime, time, fileStamp, slug } from './pdfReport';
import { TICKET_TYPES, isDoorTicket, isSold, sellerName, groupBySeller } from './tickets';

const pct = (part, total) => (total > 0 ? `${Math.round((part / total) * 100)}%` : '0%');
const byDate = (a, b) => new Date(a.created_at) - new Date(b.created_at);
const payLabel = (m) => (m === 'transferencia' ? 'Transferencia' : 'Efectivo');
const LOW_STOCK = 5;

/* ══════════════════════════════════════════════════════════
   BAR — ventas del turno, productos, stock y tickets
══════════════════════════════════════════════════════════ */
export function downloadBarReport({ eventName, sales, products }) {
  const ordered = [...sales].sort(byDate);
  const total = ordered.reduce((s, x) => s + Number(x.total), 0);
  const period = ordered.length
    ? `Turno actual: desde ${dateTime(ordered[0].created_at)} hasta ${dateTime(ordered[ordered.length - 1].created_at)}`
    : 'Turno actual: todavía no hay ventas';

  // Ventas por producto a partir de los ítems de cada ticket
  const productMap = new Map();
  for (const sale of ordered) {
    for (const it of Array.isArray(sale.items) ? sale.items : []) {
      const key = it.product_id || it.name;
      const prod = products.find((p) => p.id === it.product_id);
      const row = productMap.get(key) || { name: it.name || prod?.name || 'Producto', type: it.type || prod?.type || '', price: Number(it.price) || 0, qty: 0, amount: 0 };
      row.qty += Number(it.qty) || 0;
      row.amount += Number(it.subtotal ?? (Number(it.price) || 0) * (Number(it.qty) || 0));
      productMap.set(key, row);
    }
  }
  const productRows = [...productMap.values()].sort((a, b) => b.amount - a.amount);
  const units = productRows.reduce((s, p) => s + p.qty, 0);
  const typeTotals = ['vaso', 'botella'].map((type) => {
    const rows = productRows.filter((p) => p.type === type);
    return { type, qty: rows.reduce((s, p) => s + p.qty, 0), amount: rows.reduce((s, p) => s + p.amount, 0) };
  });

  const r = createReport({ title: 'Reporte de ventas del bar', eventName, subtitle: period });

  r.section('Resumen del turno').kpis([
    { label: 'Total recaudado', value: money(total), tone: 'accent' },
    { label: 'Tickets emitidos', value: String(ordered.length) },
    { label: 'Unidades vendidas', value: String(units) },
    { label: 'Ticket promedio', value: money(ordered.length ? total / ordered.length : 0) },
  ]);

  r.section('Ventas por tipo').table({
    columns: [{ header: 'Tipo', w: 3 }, { header: 'Unidades', w: 1.5, align: 'right' }, { header: 'Recaudado', w: 2, align: 'right' }, { header: '% del total', w: 1.5, align: 'right' }],
    rows: typeTotals.map((t) => [t.type === 'vaso' ? 'Vasos' : 'Botellas', String(t.qty), money(t.amount), pct(t.amount, total)]),
    totals: ['Total', String(units), money(total), total ? '100%' : '0%'],
  });

  r.section('Ventas por producto', 'ordenado por recaudación').table({
    columns: [
      { header: 'Producto', w: 4 }, { header: 'Tipo', w: 1.4 }, { header: 'Precio unit.', w: 1.8, align: 'right' },
      { header: 'Cantidad', w: 1.3, align: 'right' }, { header: 'Recaudado', w: 2, align: 'right' }, { header: '% total', w: 1.2, align: 'right' },
    ],
    rows: productRows.map((p) => [p.name, p.type === 'vaso' ? 'Vaso' : p.type === 'botella' ? 'Botella' : '-', money(p.price), String(p.qty), money(p.amount), pct(p.amount, total)]),
    totals: productRows.length ? ['Total', '', '', String(units), money(total), '100%'] : undefined,
    empty: 'No hubo ventas en este turno.',
  });

  const stockRows = [...products].sort((a, b) => a.stock - b.stock || a.name.localeCompare(b.name));
  const outCount = stockRows.filter((p) => p.stock <= 0).length;
  const lowCount = stockRows.filter((p) => p.stock > 0 && p.stock <= LOW_STOCK).length;
  r.section('Stock al momento del reporte', `${outCount} ${outCount === 1 ? 'agotado' : 'agotados'} · ${lowCount} con ${LOW_STOCK} o menos`).table({
    columns: [
      { header: 'Producto', w: 4 }, { header: 'Tipo', w: 1.4 }, { header: 'Precio', w: 1.8, align: 'right' },
      { header: 'Vendidos en el turno', w: 1.8, align: 'right' }, { header: 'Stock actual', w: 1.6, align: 'right' }, { header: 'Estado', w: 1.6 },
    ],
    rows: stockRows.map((p) => {
      const status = p.stock <= 0 ? { text: 'Agotado', tone: 'danger', bold: true } : p.stock <= LOW_STOCK ? { text: 'Stock bajo', tone: 'warn', bold: true } : { text: 'OK', tone: 'muted' };
      return [p.name, p.type === 'vaso' ? 'Vaso' : 'Botella', money(p.price), String(p.sold), { text: String(p.stock), bold: true }, status];
    }),
    empty: 'No hay productos cargados.',
  });

  r.section('Detalle de tickets', `${ordered.length} tickets`).table({
    columns: [{ header: 'Ticket', w: 1.2 }, { header: 'Fecha y hora', w: 2.2 }, { header: 'Productos', w: 6 }, { header: 'Total', w: 1.8, align: 'right' }],
    rows: ordered.map((s) => [
      `#${String(s.ticket_num).padStart(4, '0')}`,
      dateTime(s.created_at),
      (Array.isArray(s.items) ? s.items : []).map((it) => `${it.qty} x ${it.name} (${money(it.subtotal ?? it.price * it.qty)})`).join('  ·  '),
      money(s.total),
    ]),
    totals: ordered.length ? ['', '', `${ordered.length} tickets`, money(total)] : undefined,
    empty: 'No hubo ventas en este turno.',
  });

  r.signatures(['Responsable de caja', 'Control / Administración']);
  r.save(`reporte-bar_${slug(eventName)}_${fileStamp()}.pdf`);
}

/* ══════════════════════════════════════════════════════════
   ENTRADAS — cierre completo del evento
══════════════════════════════════════════════════════════ */
export function downloadTicketsReport({ eventName, tickets }) {
  const sold = tickets.filter(isSold).sort(byDate);
  const door = tickets.filter(isDoorTicket);
  const doorSold = door.filter((t) => t.used);
  const used = sold.filter((t) => t.used);
  const revenue = sold.reduce((s, t) => s + Number(t.price), 0);
  const cash = sold.filter((t) => t.payment_method !== 'transferencia');
  const transfer = sold.filter((t) => t.payment_method === 'transferencia');
  const sum = (list) => list.reduce((s, t) => s + Number(t.price), 0);

  const r = createReport({
    title: 'Reporte de entradas',
    eventName,
    subtitle: sold.length ? `Primera venta: ${dateTime(sold[0].created_at)} · Última venta: ${dateTime(sold[sold.length - 1].created_at)}` : 'Todavía no hay entradas vendidas',
  });

  r.section('Resumen').kpis([
    { label: 'Entradas vendidas', value: String(sold.length) },
    { label: 'Escaneadas (ingresaron)', value: String(used.length), tone: 'accent' },
    { label: 'Sin escanear', value: String(sold.length - used.length), tone: sold.length - used.length ? 'warn' : undefined },
    { label: 'Recaudado', value: money(revenue), tone: 'accent' },
    { label: 'Efectivo', value: money(sum(cash)) },
    { label: 'Transferencia', value: money(sum(transfer)) },
    { label: 'Asistencia', value: pct(used.length, sold.length) },
    { label: 'Puerta sin vender', value: String(door.length - doorSold.length) },
  ]);

  r.section('Por tipo de entrada').table({
    columns: [{ header: 'Tipo', w: 2.5 }, { header: 'Vendidas', w: 1.4, align: 'right' }, { header: 'Escaneadas', w: 1.6, align: 'right' }, { header: 'Sin escanear', w: 1.6, align: 'right' }, { header: 'Recaudado', w: 2, align: 'right' }, { header: '% total', w: 1.3, align: 'right' }],
    rows: TICKET_TYPES.map((tt) => {
      const list = sold.filter((t) => t.ticket_type === tt.id);
      const u = list.filter((t) => t.used).length;
      return [tt.label, String(list.length), String(u), String(list.length - u), money(sum(list)), pct(sum(list), revenue)];
    }),
    totals: ['Total', String(sold.length), String(used.length), String(sold.length - used.length), money(revenue), revenue ? '100%' : '0%'],
  });

  r.section('Por método de pago').table({
    columns: [{ header: 'Método', w: 3 }, { header: 'Entradas', w: 1.5, align: 'right' }, { header: 'Recaudado', w: 2, align: 'right' }, { header: '% total', w: 1.4, align: 'right' }],
    rows: [['Efectivo', String(cash.length), money(sum(cash)), pct(sum(cash), revenue)], ['Transferencia', String(transfer.length), money(sum(transfer)), pct(sum(transfer), revenue)]],
    totals: ['Total', String(sold.length), money(revenue), revenue ? '100%' : '0%'],
  });

  const groups = groupBySeller(sold);
  r.section('Por vendedor').table({
    columns: [{ header: 'Vendedor', w: 3.2 }, { header: 'Vendidas', w: 1.3, align: 'right' }, { header: 'Escaneadas', w: 1.5, align: 'right' }, { header: 'Sin escanear', w: 1.5, align: 'right' }, { header: 'Efectivo', w: 1.8, align: 'right' }, { header: 'Transfer.', w: 1.8, align: 'right' }, { header: 'Total', w: 1.9, align: 'right' }],
    rows: groups.map((g) => [g.name, String(g.count), String(g.used), String(g.count - g.used), money(g.efectivo), money(g.transferencia), money(g.revenue)]),
    totals: ['Total', String(sold.length), String(used.length), String(sold.length - used.length), money(sum(cash)), money(sum(transfer)), money(revenue)],
  });

  if (door.length) {
    r.section('Entradas de puerta (pre-impresas)').facts([
      ['Impresas', String(door.length)],
      ['Vendidas (escaneadas)', String(doorSold.length)],
      ['Sin vender', String(door.length - doorSold.length)],
      ['Recaudado en puerta', money(sum(doorSold))],
    ]);
    r.note('Las entradas de puerta cuentan como vendidas recién cuando se escanean.');
  }

  r.section('Detalle de entradas', `${sold.length} entradas · orden de venta`).table({
    columns: [{ header: '#', w: 0.7 }, { header: 'Comprador', w: 3.2 }, { header: 'Tipo', w: 1.3 }, { header: 'Vendedor', w: 2.4 }, { header: 'Pago', w: 1.7 }, { header: 'Precio', w: 1.6, align: 'right' }, { header: 'Vendida', w: 1.4 }, { header: 'Estado', w: 2 }],
    rows: sold.map((t, i) => [
      String(i + 1),
      t.buyer_name || 'Sin nombre',
      t.ticket_type,
      sellerName(t),
      payLabel(t.payment_method),
      money(t.price),
      isDoorTicket(t) ? '-' : time(t.created_at),
      t.used ? { text: `Escaneada ${time(t.used_at)}`, tone: 'accent' } : { text: 'Sin escanear', tone: 'warn' },
    ]),
    totals: sold.length ? ['', `${sold.length} entradas`, '', '', '', money(revenue), '', `${used.length} escaneadas`] : undefined,
    empty: 'Todavía no hay entradas vendidas.',
  });

  r.signatures(['Responsable de entradas', 'Control / Administración']);
  r.save(`reporte-entradas_${slug(eventName)}_${fileStamp()}.pdf`);
}

/* ══════════════════════════════════════════════════════════
   RRPP — rendición por vendedor (para contar y pagar)
══════════════════════════════════════════════════════════ */
export function downloadRrppReport({ eventName, tickets, profiles }) {
  const sold = tickets.filter(isSold);
  const groups = groupBySeller(sold);
  for (const p of profiles) {
    if (p.role === 'rrpp' && p.active && !groups.some((g) => g.key === p.id)) {
      groups.push({ key: p.id, name: p.display_name, count: 0, used: 0, revenue: 0, efectivo: 0, transferencia: 0, byType: {}, tickets: [] });
    }
  }
  const totals = groups.reduce((s, g) => ({ count: s.count + g.count, used: s.used + g.used, cash: s.cash + g.efectivo, transfer: s.transfer + g.transferencia, revenue: s.revenue + g.revenue }), { count: 0, used: 0, cash: 0, transfer: 0, revenue: 0 });

  const r = createReport({ title: 'Rendición por RRPP', eventName, subtitle: 'Entradas vendidas por cada vendedor, con su estado de ingreso y lo cobrado.' });

  r.section('Resumen general').kpis([
    { label: 'Vendidas', value: String(totals.count) },
    { label: 'Escaneadas', value: String(totals.used), tone: 'accent' },
    { label: 'Sin escanear', value: String(totals.count - totals.used), tone: totals.count - totals.used ? 'warn' : undefined },
    { label: 'Recaudado', value: money(totals.revenue), tone: 'accent' },
  ]);

  r.section('Ranking de vendedores').table({
    columns: [{ header: '#', w: 0.6 }, { header: 'Vendedor', w: 3.2 }, { header: 'Vendidas', w: 1.3, align: 'right' }, { header: 'Escaneadas', w: 1.5, align: 'right' }, { header: 'Sin escanear', w: 1.5, align: 'right' }, ...TICKET_TYPES.map((t) => ({ header: t.label, w: 1.1, align: 'right' })), { header: 'Total', w: 1.9, align: 'right' }],
    rows: groups.map((g, i) => [String(i + 1), g.name, String(g.count), String(g.used), String(g.count - g.used), ...TICKET_TYPES.map((t) => String(g.byType[t.id] || 0)), money(g.revenue)]),
    totals: ['', 'Total', String(totals.count), String(totals.used), String(totals.count - totals.used), ...TICKET_TYPES.map((t) => String(sold.filter((x) => x.ticket_type === t.id).length)), money(totals.revenue)],
  });

  // Una hoja por RRPP con todas sus entradas, para que firme al cobrar.
  // Puerta y administración quedan solo en el ranking: no se les rinde.
  const isAdminKey = (key) => key === 'admin' || profiles.some((p) => p.id === key && p.role === 'admin');
  const rrppGroups = groups.filter((x) => x.count > 0 && x.key !== 'door' && !isAdminKey(x.key));
  if (rrppGroups.length === 0) r.note('Todavía no hay entradas vendidas por RRPP.');
  for (const g of rrppGroups) {
    r.pageBreak();
    r.section(g.name, `${g.count} vendidas · ${g.used} escaneadas · ${g.count - g.used} sin escanear`);
    r.facts([
      ['Efectivo', money(g.efectivo)],
      ['Transferencia', money(g.transferencia)],
      ['Total cobrado', money(g.revenue)],
      ['Asistencia', pct(g.used, g.count)],
    ]);
    r.table({
      columns: [{ header: '#', w: 0.6 }, { header: 'Comprador', w: 3.6 }, { header: 'Tipo', w: 1.3 }, { header: 'Pago', w: 1.8 }, { header: 'Precio', w: 1.6, align: 'right' }, { header: 'Vendida', w: 2.2 }, { header: 'Estado', w: 2.2 }],
      rows: [...g.tickets].sort(byDate).map((t, i) => [
        String(i + 1),
        t.buyer_name || 'Sin nombre',
        t.ticket_type,
        payLabel(t.payment_method),
        money(t.price),
        isDoorTicket(t) ? '-' : dateTime(t.created_at),
        t.used ? { text: `Escaneada ${time(t.used_at)}`, tone: 'accent' } : { text: 'Sin escanear', tone: 'warn' },
      ]),
      totals: ['', `${g.count} entradas`, '', '', money(g.revenue), '', `${g.used} escaneadas`],
    });
    r.signatures([`Recibí conforme: ${g.name}`, 'Entregó: Administración']);
  }

  r.save(`rendicion-rrpp_${slug(eventName)}_${fileStamp()}.pdf`);
}
