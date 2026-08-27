import React, { useState, useEffect, useCallback } from 'react';
import {
  fetchProducts,
  fetchSales,
  fetchEventConfig,
  resetDaySales,
} from '../hooks/useSupabase';

export default function ReportesTab({ eventName }) {
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [prods, sls, config] = await Promise.all([
        fetchProducts(), 
        fetchSales(),
        fetchEventConfig()
      ]);
      setProducts(prods || []);
      
      const allSales = sls || [];
      // Filtrar solo las ventas del turno actual (ticket_num decreciente)
      if (config.ticket_counter === 1) {
        setSales([]);
      } else {
        const shiftSales = [];
        let expectedNext = null;
        for (const sale of allSales) {
          if (expectedNext !== null && sale.ticket_num >= expectedNext) {
            break; // cruzamos al turno anterior
          }
          shiftSales.push(sale);
          expectedNext = sale.ticket_num;
        }
        setSales(shiftSales);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /* ─── Aggregations ─── */
  const totalRecaudado = sales.reduce((s, sale) => s + Number(sale.total), 0);
  const ticketsEmitidos = sales.length;
  const vasosVendidos = products
    .filter((p) => p.type === 'vaso')
    .reduce((s, p) => s + p.sold, 0);
  const botellasVendidas = products
    .filter((p) => p.type === 'botella')
    .reduce((s, p) => s + p.sold, 0);

  /* ─── Reset ─── */
  const handleReset = async () => {
    if (
      !window.confirm(
        '⚠️ ¿Reiniciar ventas del día?\n\nEsto pondrá los vendidos en 0 y reiniciará el contador de tickets.\nLas ventas registradas NO se borran (quedan para auditoría).'
      )
    )
      return;
    try {
      await resetDaySales();
      await load();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  /* ─── CSV Export ─── */
  const handleCSV = () => {
    const header = 'Ticket;Fecha;Hora;Producto;Cantidad;Precio unitario;Subtotal;Total\n';
    const rows = sales.flatMap((sale) => {
      const d = new Date(sale.created_at);
      const fecha = d.toLocaleDateString('es-AR');
      const hora = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
      const items = Array.isArray(sale.items) ? sale.items : [];
      return items.map((item) =>
        [
          sale.ticket_num,
          fecha,
          hora,
          `"${item.name}"`,
          item.qty,
          item.price,
          item.subtotal,
          sale.total,
        ].join(';')
      );
    });
    const csv = header + rows.join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ventas_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ─── HTML Comprobante ─── */
  const handleComprobante = () => {
    const now = new Date();
    const dateStr = now.toLocaleDateString('es-AR');
    const timeStr = now.toLocaleTimeString('es-AR');

    // Product detail: recaudado and stock by product
    const productDetail = products
      .map((p) => {
        const recaudado = p.sold * Number(p.price);
        return `
          <tr>
            <td style="padding:6px 12px;border-bottom:1px solid #ddd;">${p.name}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #ddd;text-align:center;">
              ${p.type === 'botella' ? '🍾' : '🥤'} ${p.type}
            </td>
            <td style="padding:6px 12px;border-bottom:1px solid #ddd;text-align:right;">$${Number(p.price).toLocaleString('es-AR')}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #ddd;text-align:right;">${p.sold}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #ddd;text-align:right;">$${recaudado.toLocaleString('es-AR')}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #ddd;text-align:right;">${p.stock}</td>
          </tr>`;
      })
      .join('');

    // Sales history
    const salesHistory = sales
      .map((sale) => {
        const d = new Date(sale.created_at);
        const items = Array.isArray(sale.items) ? sale.items : [];
        const itemsList = items.map((it) => `${it.qty}x ${it.name}`).join(', ');
        return `
          <tr>
            <td style="padding:6px 12px;border-bottom:1px solid #ddd;text-align:center;">#${String(sale.ticket_num).padStart(4, '0')}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #ddd;">${d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #ddd;">${itemsList}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #ddd;text-align:right;">$${Number(sale.total).toLocaleString('es-AR')}</td>
          </tr>`;
      })
      .join('');

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Comprobante - ${eventName || 'Evento'}</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; margin: 40px; color: #222; }
    h1 { font-size: 24px; margin-bottom: 4px; }
    h2 { font-size: 18px; color: #555; margin-top: 30px; border-bottom: 2px solid #2dd4a8; padding-bottom: 6px; }
    .meta { color: #777; font-size: 14px; margin-bottom: 20px; }
    .summary { display: flex; gap: 20px; flex-wrap: wrap; margin: 20px 0; }
    .summary-card { background: #f8f8f8; border-radius: 8px; padding: 16px 24px; min-width: 160px; }
    .summary-card .label { font-size: 12px; color: #888; text-transform: uppercase; }
    .summary-card .value { font-size: 24px; font-weight: bold; color: #222; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 14px; }
    th { background: #f0f0f0; padding: 8px 12px; text-align: left; border-bottom: 2px solid #ccc; }
    .firma { display: flex; gap: 80px; margin-top: 60px; }
    .firma-box { flex: 1; text-align: center; border-top: 1px solid #999; padding-top: 8px; font-size: 13px; color: #666; }
    @media print { body { margin: 20px; } }
  </style>
</head>
<body>
  <h1>${eventName || 'Evento'}</h1>
  <p class="meta">Comprobante de ventas del día — ${dateStr} ${timeStr}</p>

  <div class="summary">
    <div class="summary-card">
      <div class="label">Total recaudado</div>
      <div class="value">$${totalRecaudado.toLocaleString('es-AR')}</div>
    </div>
    <div class="summary-card">
      <div class="label">Tickets emitidos</div>
      <div class="value">${ticketsEmitidos}</div>
    </div>
    <div class="summary-card">
      <div class="label">Vasos vendidos</div>
      <div class="value">${vasosVendidos}</div>
    </div>
    <div class="summary-card">
      <div class="label">Botellas vendidas</div>
      <div class="value">${botellasVendidas}</div>
    </div>
  </div>

  <h2>Detalle por producto</h2>
  <table>
    <thead>
      <tr>
        <th>Producto</th>
        <th style="text-align:center;">Tipo</th>
        <th style="text-align:right;">Precio</th>
        <th style="text-align:right;">Vendidos</th>
        <th style="text-align:right;">Recaudado</th>
        <th style="text-align:right;">Stock restante</th>
      </tr>
    </thead>
    <tbody>${productDetail}</tbody>
  </table>

  <h2>Historial de tickets</h2>
  <table>
    <thead>
      <tr>
        <th style="text-align:center;">Ticket</th>
        <th>Hora</th>
        <th>Items</th>
        <th style="text-align:right;">Total</th>
      </tr>
    </thead>
    <tbody>${salesHistory}</tbody>
  </table>

  <div class="firma">
    <div class="firma-box">Responsable de caja</div>
    <div class="firma-box">Supervisor / Organizador</div>
  </div>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `comprobante_${new Date().toISOString().slice(0, 10)}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-accent border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ─── Summary Cards ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
        {[
          { label: 'Total recaudado', value: `$${totalRecaudado.toLocaleString('es-AR')}`, icon: '💰', color: 'text-accent' },
          { label: 'Tickets emitidos', value: ticketsEmitidos, icon: '🎫', color: 'text-purple-400' },
          { label: 'Vasos vendidos', value: vasosVendidos, icon: '🥤', color: 'text-sky-400' },
          { label: 'Botellas vendidas', value: botellasVendidas, icon: '🍾', color: 'text-amber-400' },
        ].map((card, i) => (
          <div
            key={i}
            className="bg-card-alt rounded-xl sm:rounded-2xl border border-zinc-800 p-3 sm:p-5 flex flex-col gap-0.5 sm:gap-1"
          >
            <span className="text-[10px] sm:text-xs font-medium text-zinc-500 uppercase tracking-wider">
              {card.icon} {card.label}
            </span>
            <span className={`text-lg sm:text-2xl font-mono font-bold ${card.color}`}>{card.value}</span>
          </div>
        ))}
      </div>

      {/* ─── Actions ─── */}
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
        <button onClick={handleComprobante} className="btn-outline px-4 sm:px-5 py-2.5 text-sm touch-manipulation">
          📄 Descargar comprobante
        </button>
        <button onClick={handleCSV} className="btn-outline px-4 sm:px-5 py-2.5 text-sm touch-manipulation">
          📊 Exportar CSV
        </button>
        <button
          onClick={handleReset}
          className="sm:ml-auto px-4 sm:px-5 py-2.5 text-sm rounded-xl border border-red-800/50 text-red-400 active:bg-red-900/20 hover:bg-red-900/20 transition-colors font-display font-medium touch-manipulation"
        >
          🔄 Reiniciar ventas del día
        </button>
      </div>

      {/* ─── Stock Restante ─── */}
      <div className="bg-card-alt rounded-2xl border border-zinc-800 overflow-hidden">
        <div className="p-5 border-b border-zinc-800">
          <h3 className="text-base font-display font-semibold text-zinc-300">
            📦 Stock restante
          </h3>
        </div>
        <div className="p-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {products.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-3 bg-card rounded-xl p-3 border border-zinc-800"
            >
              <span className="text-lg">{p.type === 'botella' ? '🍾' : '🥤'}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-display text-zinc-300 truncate">{p.name}</p>
              </div>
              <span
                className={`font-mono font-bold text-sm ${
                  p.stock === 0
                    ? 'text-red-400'
                    : p.stock <= 5
                    ? 'text-yellow-400'
                    : 'text-accent'
                }`}
              >
                {p.stock}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Historial de tickets ─── */}
      <div className="bg-card-alt rounded-2xl border border-zinc-800 overflow-hidden">
        <div className="p-5 border-b border-zinc-800">
          <h3 className="text-base font-display font-semibold text-zinc-300">
            📋 Historial de tickets ({sales.length})
          </h3>
        </div>
        {sales.length === 0 ? (
          <div className="text-center py-12 text-zinc-500 italic">Sin ventas registradas</div>
        ) : (
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card-alt">
                <tr className="border-b border-zinc-800 text-zinc-400 text-left">
                  <th className="px-5 py-3 font-medium text-center">Ticket</th>
                  <th className="px-5 py-3 font-medium">Fecha / Hora</th>
                  <th className="px-5 py-3 font-medium">Items</th>
                  <th className="px-5 py-3 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => {
                  const d = new Date(sale.created_at);
                  const items = Array.isArray(sale.items) ? sale.items : [];
                  return (
                    <tr
                      key={sale.id}
                      className="border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors"
                    >
                      <td className="px-5 py-3 text-center">
                        <span className="font-mono text-accent text-xs bg-accent/10 px-2 py-1 rounded-md">
                          #{String(sale.ticket_num).padStart(4, '0')}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-zinc-400 font-mono text-xs">
                        {d.toLocaleDateString('es-AR')}{' '}
                        {d.toLocaleTimeString('es-AR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-5 py-3 text-zinc-300 text-xs">
                        {items.map((it) => `${it.qty}x ${it.name}`).join(', ')}
                      </td>
                      <td className="px-5 py-3 text-right font-mono font-semibold text-zinc-200">
                        ${Number(sale.total).toLocaleString('es-AR')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
