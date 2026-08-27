import React from 'react';

export default function Ticket({ ticketData, eventName }) {
  if (!ticketData) return null;

  const { ticket_num, total, items, created_at } = ticketData;
  const date = new Date(created_at);
  const dateStr = date.toLocaleDateString('es-AR');
  const timeStr = date.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="ticket-print">
      <div className="ticket-inner">
        {/* Header */}
        <div className="ticket-header">
          <p className="ticket-event-name">{eventName || 'EVENTO'}</p>
          <p className="ticket-subtitle">COMPROBANTE DE VENTA</p>
        </div>

        {/* Ticket info */}
        <div className="ticket-info">
          <div className="ticket-row">
            <span>Ticket #</span>
            <span className="ticket-num">{String(ticket_num).padStart(4, '0')}</span>
          </div>
          <div className="ticket-row">
            <span>Fecha</span>
            <span>{dateStr}</span>
          </div>
          <div className="ticket-row">
            <span>Hora</span>
            <span>{timeStr}</span>
          </div>
        </div>

        <div className="ticket-divider">{'─'.repeat(32)}</div>

        {/* Items */}
        <div className="ticket-items">
          {items.map((item, i) => (
            <div key={i} className="ticket-item">
              <div className="ticket-item-name">
                {item.qty}x {item.name}
              </div>
              <div className="ticket-item-price">
                ${Number(item.subtotal).toLocaleString('es-AR')}
              </div>
            </div>
          ))}
        </div>

        <div className="ticket-divider">{'─'.repeat(32)}</div>

        {/* Total */}
        <div className="ticket-total">
          <span>TOTAL</span>
          <span>${Number(total).toLocaleString('es-AR')}</span>
        </div>

        <div className="ticket-divider">{'─'.repeat(32)}</div>

        {/* Footer */}
        <div className="ticket-footer">
          <p>¡Gracias por tu compra!</p>
          <p className="ticket-footer-small">No válido como factura</p>
        </div>
      </div>
    </div>
  );
}
