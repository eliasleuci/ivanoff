import React, { useState, useEffect, useCallback } from 'react';
import {
  fetchProducts,
  fetchSales,
  fetchEventConfig,
  resetDaySales,
  voidShiftSales,
} from '../hooks/useSupabase';

export default function ReportesTab({ eventName }) {
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [prods, sls, config] = await Promise.all([
        fetchProducts(), 
        fetchSales(),
        fetchEventConfig()
      ]);
      setProducts(prods || []);
      
      // Ventas del turno actual: el contador arranca en 1 al reiniciar y suma 1 por venta,
      // así que son las últimas (contador - 1) ventas por fecha. No se puede usar el número
      // de ticket para cortar: después de reiniciar, las ventas viejas tienen números más altos.
      const allSales = sls || []; // ordenadas por fecha, más nuevas primero
      setSales(allSales.slice(0, Math.max(0, config.ticket_counter - 1)));
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

  /* ─── Reset ───
     Cerrar el día: lo vendido ya salió, el stock queda como está.
     Anular: ventas de prueba; se devuelve al stock lo vendido y se borran esas ventas. */
  const runReset = async (mode) => {
    if (
      mode === 'void' &&
      !window.confirm(
        `¿Anular ${sales.length} ${sales.length === 1 ? 'venta' : 'ventas'} por $${totalRecaudado.toLocaleString('es-AR')} y devolver lo vendido al stock?\n\nEsto no se puede deshacer.`
      )
    )
      return;
    setResetting(true);
    try {
      if (mode === 'void') await voidShiftSales(sales.map((s) => s.id));
      else await resetDaySales();
      setResetOpen(false);
      await load();
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setResetting(false);
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

  /* ─── Reporte PDF ─── */
  const handlePdf = async () => {
    setDownloading(true);
    try {
      const { downloadBarReport } = await import('../utils/reports');
      downloadBarReport({ eventName, sales, products });
    } catch (err) {
      console.error(err);
      alert('No se pudo generar el PDF: ' + err.message);
    } finally {
      setDownloading(false);
    }
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
        <button
          onClick={handlePdf}
          disabled={downloading}
          className="btn-accent px-4 sm:px-5 py-2.5 text-sm touch-manipulation disabled:opacity-60"
        >
          {downloading ? 'Generando PDF…' : '📄 Descargar reporte PDF'}
        </button>
        <button onClick={handleCSV} className="btn-outline px-4 sm:px-5 py-2.5 text-sm touch-manipulation">
          📊 Exportar CSV
        </button>
        <button
          onClick={() => setResetOpen(true)}
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

      {/* ─── Reiniciar: cerrar el día o anular ventas de prueba ─── */}
      {resetOpen && (
        <div
          className="cierre-confirm-overlay"
          onClick={(e) => e.target === e.currentTarget && !resetting && setResetOpen(false)}
        >
          <div className="cierre-confirm-sheet">
            <div className="cierre-confirm-handle" />
            <div className="cierre-confirm-title">Reiniciar ventas del día</div>
            <p className="cierre-confirm-text">
              En este turno: <strong>{sales.length} {sales.length === 1 ? 'venta' : 'ventas'}</strong> ·{' '}
              <strong>${totalRecaudado.toLocaleString('es-AR')}</strong>
            </p>
            <button className="rp-reset-option" onClick={() => runReset('close')} disabled={resetting}>
              <span className="rp-reset-icon">🌙</span>
              <span>
                <span className="rp-reset-name">Cerrar el día</span>
                <span className="rp-reset-desc">
                  Pone en 0 lo vendido y el contador de tickets. El stock queda como está, porque lo vendido ya salió.
                </span>
              </span>
            </button>
            <button
              className="rp-reset-option rp-reset-option--danger"
              onClick={() => runReset('void')}
              disabled={resetting || sales.length === 0}
            >
              <span className="rp-reset-icon">↩️</span>
              <span>
                <span className="rp-reset-name">Anular ventas de prueba</span>
                <span className="rp-reset-desc">
                  Devuelve al stock todo lo vendido en este turno y borra esas ventas.
                </span>
              </span>
            </button>
            <button
              className="cierre-confirm-cancel rp-reset-cancel"
              onClick={() => setResetOpen(false)}
              disabled={resetting}
            >
              {resetting ? 'Procesando…' : 'Cancelar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
