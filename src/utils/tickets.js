/* ─── Tipos de entrada ─── */
export const TICKET_TYPES = [
  { id: 'General', label: 'General', emoji: '🎟️', color: '#2dd4a8', bg: 'rgba(45,212,168,0.12)' },
  { id: 'VIP', label: 'VIP', emoji: '⭐', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  { id: 'Combo', label: 'Combo', emoji: '🎁', color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
];

export const fmt = (n) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
  }).format(n);

/* Entradas de puerta: pre-impresas, cuentan como vendidas recién al escanearse */
export const isDoorTicket = (t) => t.ticket_code?.startsWith('PTA-');
export const isSold = (t) => !isDoorTicket(t) || t.used;
export const doorNumber = (t) => parseInt(t.buyer_name?.match(/#(\d+)/)?.[1] ?? '0', 10);

// Vendidas por un admin, o sin vendedor (las anteriores a los RRPP, que generaba el admin)
const isAdminTicket = (t) => t.seller?.role === 'admin' || (!t.seller_id && !t.seller_name);

// seller_name es una copia que queda aunque el RRPP se haya eliminado
export const sellerName = (t) =>
  isDoorTicket(t) ? 'Puerta'
    : isAdminTicket(t) ? 'Administradores'
      : t.seller?.display_name || t.seller_name;

/* Resumen por vendedor (RRPP, admin, puerta) para el panel y los reportes */
export function groupBySeller(tickets) {
  const groups = new Map();
  for (const t of tickets) {
    const key = isDoorTicket(t) ? 'door'
      : isAdminTicket(t) ? 'admin'
        : t.seller_id || `deleted:${t.seller_name}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        name: sellerName(t),
        count: 0,
        used: 0,
        revenue: 0,
        efectivo: 0,
        transferencia: 0,
        byType: {},
      });
    }
    const g = groups.get(key);
    g.count += 1;
    if (t.used) g.used += 1;
    g.revenue += Number(t.price);
    if (t.payment_method === 'transferencia') g.transferencia += Number(t.price);
    else g.efectivo += Number(t.price);
    g.byType[t.ticket_type] = (g.byType[t.ticket_type] || 0) + 1;
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}

export function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
