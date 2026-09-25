import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';

/* PDF A4 con entradas de puerta: 3 x 4 por hoja, con línea de corte */
const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 8;
const COLS = 3;
const ROWS = 4;
const CELL_W = (PAGE_W - MARGIN * 2) / COLS;
const CELL_H = (PAGE_H - MARGIN * 2) / ROWS;
const QR_SIZE = 42;

export const doorNumber = (t) => parseInt(t.buyer_name?.match(/#(\d+)/)?.[1] ?? '0', 10);

const pad3 = (n) => String(n).padStart(3, '0');

// Las fuentes estándar de PDF no tienen el espacio duro que usa Intl
const fmtPrice = (n) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 })
    .format(n)
    .replace(/ /g, ' ');

export async function buildDoorTicketsPdf(tickets, eventName) {
  const sorted = [...tickets].sort((a, b) => doorNumber(a) - doorNumber(b));
  const qrs = await Promise.all(
    sorted.map((t) =>
      QRCode.toDataURL(t.ticket_code, {
        width: 400,
        margin: 1,
        color: { dark: '#000000', light: '#ffffff' },
        errorCorrectionLevel: 'M',
      })
    )
  );

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const title = (eventName || 'Evento').toUpperCase();

  sorted.forEach((t, i) => {
    const slot = i % (COLS * ROWS);
    if (i > 0 && slot === 0) doc.addPage();

    const x = MARGIN + (slot % COLS) * CELL_W;
    const y = MARGIN + Math.floor(slot / COLS) * CELL_H;
    const cx = x + CELL_W / 2;

    // Línea de corte
    doc.setDrawColor(150);
    doc.setLineWidth(0.2);
    doc.setLineDashPattern([1.5, 1.5], 0);
    doc.rect(x, y, CELL_W, CELL_H);
    doc.setLineDashPattern([], 0);

    doc.setTextColor(0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    const [titleLine] = doc.splitTextToSize(title, CELL_W - 6);
    doc.text(titleLine, cx, y + 9, { align: 'center' });

    doc.addImage(qrs[i], 'PNG', cx - QR_SIZE / 2, y + 12, QR_SIZE, QR_SIZE);

    doc.setFont('courier', 'bold');
    doc.setFontSize(18);
    doc.text(`#${pad3(doorNumber(t))}`, cx, y + 61, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(60);
    doc.text(`${t.ticket_type} - ${fmtPrice(t.price)}`, cx, y + 66.5, { align: 'center' });
  });

  return doc;
}

export async function downloadDoorTicketsPdf(tickets, eventName) {
  const doc = await buildDoorTicketsPdf(tickets, eventName);
  const nums = tickets.map(doorNumber);
  const range = `${pad3(Math.min(...nums))}-${pad3(Math.max(...nums))}`;
  const slug = (eventName || 'evento').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  doc.save(`entradas-puerta-${slug}-${range}.pdf`);
}
