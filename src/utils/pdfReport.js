import { jsPDF } from 'jspdf';

/*
 * Generador de reportes PDF (A4) con el mismo diseño para todas las secciones:
 * encabezado, tarjetas de totales, tablas que continúan en la página siguiente
 * repitiendo los títulos, pie con fecha de generación y número de página.
 */
const PAGE_W = 210;
const PAGE_H = 297;
const M = 14; // margen
const CONTENT_W = PAGE_W - M * 2;
const BOTTOM = PAGE_H - 18; // espacio reservado para el pie

const ACCENT = [12, 134, 107];
const ACCENT_SOFT = [232, 246, 241];
const DARK = [24, 24, 27];
const MUTED = [113, 113, 122];
const LINE = [222, 222, 226];
const ZEBRA = [247, 247, 248];
const WARN = [180, 83, 9];
const DANGER = [185, 28, 28];

// Las fuentes estándar del PDF solo tienen caracteres latinos: se limpian emojis y espacios raros
export const clean = (v) =>
  String(v ?? '')
    .replace(/[\u00a0\u202f]/g, ' ')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2022/g, '\u00b7')
    // eslint-disable-next-line no-control-regex -- quitar lo que no es Latin-1 (emojis, etc.)
    .replace(/[^\x00-\xff]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

// Sin espacio despu\u00e9s del $: as\u00ed el monto no se parte entre renglones
export const money = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-AR').replace(/[\u00a0\u202f]/g, '');

const pad = (n) => String(n).padStart(2, '0');
export const dateTime = (d) => {
  const x = new Date(d);
  return `${pad(x.getDate())}/${pad(x.getMonth() + 1)}/${x.getFullYear()} ${pad(x.getHours())}:${pad(x.getMinutes())}`;
};
export const time = (d) => {
  const x = new Date(d);
  return `${pad(x.getHours())}:${pad(x.getMinutes())}`;
};
export const fileStamp = () => {
  const x = new Date();
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}_${pad(x.getHours())}${pad(x.getMinutes())}`;
};
export const slug = (s) =>
  clean(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'evento';

export function createReport({ title, eventName, subtitle }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const generatedAt = new Date();
  let y = 0;

  const color = (rgb, kind = 'text') => {
    if (kind === 'text') doc.setTextColor(...rgb);
    else if (kind === 'fill') doc.setFillColor(...rgb);
    else doc.setDrawColor(...rgb);
  };
  const font = (size, style = 'normal', rgb = DARK) => {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    color(rgb);
  };
  const newPage = () => {
    doc.addPage();
    color(ACCENT, 'fill');
    doc.rect(0, 0, PAGE_W, 2, 'F');
    y = M;
  };
  const ensure = (h) => {
    if (y + h > BOTTOM) {
      newPage();
      return true;
    }
    return false;
  };

  /* ── Encabezado ── */
  color(ACCENT, 'fill');
  doc.rect(0, 0, PAGE_W, 4, 'F');
  y = 16;
  font(18, 'bold');
  doc.text(clean(title), M, y);
  font(9, 'normal', MUTED);
  doc.text(`Generado: ${dateTime(generatedAt)}`, PAGE_W - M, y, { align: 'right' });
  y += 7;
  font(12, 'bold', ACCENT);
  doc.text(clean(eventName || 'Evento'), M, y);
  if (subtitle) {
    y += 5.5;
    font(9.5, 'normal', MUTED);
    doc.text(doc.splitTextToSize(clean(subtitle), CONTENT_W), M, y);
  }
  y += 5;
  color(LINE, 'draw');
  doc.setLineWidth(0.3);
  doc.line(M, y, PAGE_W - M, y);
  y += 4;

  const api = {
    doc,

    section(text, hint) {
      ensure(18);
      y += 5;
      font(12, 'bold');
      doc.text(clean(text), M, y);
      if (hint) {
        font(8.5, 'normal', MUTED);
        doc.text(clean(hint), PAGE_W - M, y, { align: 'right' });
      }
      y += 1.8;
      color(ACCENT, 'draw');
      doc.setLineWidth(0.6);
      doc.line(M, y, M + 14, y);
      y += 4.5;
      return api;
    },

    // Tarjetas de totales: [{ label, value, tone: 'accent' | 'warn' | 'danger' }]
    kpis(items, perRow = 4) {
      const gap = 3;
      const w = (CONTENT_W - gap * (perRow - 1)) / perRow;
      const h = 17;
      for (let i = 0; i < items.length; i += perRow) {
        ensure(h + 3);
        items.slice(i, i + perRow).forEach((it, j) => {
          const x = M + j * (w + gap);
          color(ZEBRA, 'fill');
          color(LINE, 'draw');
          doc.setLineWidth(0.2);
          doc.roundedRect(x, y, w, h, 1.8, 1.8, 'FD');
          font(7, 'bold', MUTED);
          doc.text(clean(it.label).toUpperCase(), x + 3, y + 5.5);
          const tone = it.tone === 'warn' ? WARN : it.tone === 'danger' ? DANGER : it.tone === 'accent' ? ACCENT : DARK;
          font(12.5, 'bold', tone);
          doc.text(doc.splitTextToSize(clean(it.value), w - 6)[0], x + 3, y + 12.8);
        });
        y += h + 3;
      }
      return api;
    },

    // Pares etiqueta / valor en dos columnas
    facts(pairs) {
      font(9.5);
      const colW = CONTENT_W / 2;
      for (let i = 0; i < pairs.length; i += 2) {
        ensure(6);
        pairs.slice(i, i + 2).forEach(([k, v], j) => {
          const x = M + j * colW;
          font(9, 'normal', MUTED);
          doc.text(clean(k), x, y);
          font(9.5, 'bold');
          doc.text(clean(v), x + colW - 4, y, { align: 'right' });
        });
        y += 5.5;
      }
      y += 1;
      return api;
    },

    /*
     * columns: [{ header, w (proporción), align: 'left'|'right'|'center' }]
     * rows: arrays de celdas (texto). Una celda puede ser { text, bold, tone }.
     * totals: fila final en negrita (opcional).
     */
    table({ columns, rows, totals, empty = 'Sin datos.' }) {
      const totalW = columns.reduce((s, c) => s + (c.w || 1), 0);
      const widths = columns.map((c) => ((c.w || 1) / totalW) * CONTENT_W);
      const padX = 1.8;
      const lineH = 3.6;

      const drawHeader = () => {
        font(7.5, 'bold', DARK);
        const lines = columns.map((c, i) => doc.splitTextToSize(clean(c.header), widths[i] - padX * 2));
        const h = Math.max(...lines.map((l) => l.length)) * lineH + 3.4;
        color(ACCENT_SOFT, 'fill');
        doc.rect(M, y, CONTENT_W, h, 'F');
        let x = M;
        columns.forEach((c, i) => {
          const tx = c.align === 'right' ? x + widths[i] - padX : c.align === 'center' ? x + widths[i] / 2 : x + padX;
          doc.text(lines[i], tx, y + 4.2, { align: c.align || 'left' });
          x += widths[i];
        });
        y += h;
      };

      const prepare = (cells, bold) => {
        font(8.3, bold ? 'bold' : 'normal');
        const prepared = cells.map((cell, i) => {
          const c = typeof cell === 'object' && cell !== null ? cell : { text: cell };
          return { ...c, lines: doc.splitTextToSize(clean(c.text), widths[i] - padX * 2) };
        });
        return { prepared, h: Math.max(...prepared.map((p) => p.lines.length)) * lineH + 2.6 };
      };

      const drawRow = (cells, { zebra, bold, keepWith = 0 } = {}) => {
        const { prepared, h } = prepare(cells, bold);
        if (ensure(h + keepWith)) drawHeader();
        if (zebra) {
          color(ZEBRA, 'fill');
          doc.rect(M, y, CONTENT_W, h, 'F');
        }
        if (bold) {
          color(DARK, 'draw');
          doc.setLineWidth(0.35);
          doc.line(M, y, PAGE_W - M, y);
        }
        let x = M;
        prepared.forEach((p, i) => {
          const col = columns[i];
          const tone = p.tone === 'warn' ? WARN : p.tone === 'danger' ? DANGER : p.tone === 'accent' ? ACCENT : p.tone === 'muted' ? MUTED : DARK;
          font(8.3, bold || p.bold ? 'bold' : 'normal', tone);
          const tx = col.align === 'right' ? x + widths[i] - padX : col.align === 'center' ? x + widths[i] / 2 : x + padX;
          doc.text(p.lines, tx, y + 3.9, { align: col.align || 'left' });
          x += widths[i];
        });
        y += h;
      };

      ensure(16);
      drawHeader();
      if (rows.length === 0) {
        font(8.5, 'italic', MUTED);
        y += 5;
        doc.text(clean(empty), M + padX, y);
        y += 3;
      } else {
        // La última fila viaja junto con el total (no queda un total solo en otra página)
        const totalsH = totals ? prepare(totals, true).h : 0;
        rows.forEach((r, i) => drawRow(r, { zebra: i % 2 === 1, keepWith: i === rows.length - 1 ? totalsH : 0 }));
        if (totals) drawRow(totals, { bold: true });
      }
      color(LINE, 'draw');
      doc.setLineWidth(0.3);
      doc.line(M, y, PAGE_W - M, y);
      y += 4;
      return api;
    },

    note(text) {
      font(8.5, 'italic', MUTED);
      const lines = doc.splitTextToSize(clean(text), CONTENT_W);
      ensure(lines.length * 4 + 2);
      doc.text(lines, M, y + 1);
      y += lines.length * 4 + 2;
      return api;
    },

    // Líneas de firma para el control
    signatures(labels) {
      ensure(28);
      y += 16;
      const w = (CONTENT_W - 10 * (labels.length - 1)) / labels.length;
      labels.forEach((label, i) => {
        const x = M + i * (w + 10);
        color(DARK, 'draw');
        doc.setLineWidth(0.3);
        doc.line(x, y, x + w, y);
        font(8.5, 'normal', MUTED);
        doc.text(clean(label), x + w / 2, y + 4.5, { align: 'center' });
      });
      y += 10;
      return api;
    },

    pageBreak() {
      newPage();
      return api;
    },

    save(filename) {
      const pages = doc.getNumberOfPages();
      for (let i = 1; i <= pages; i++) {
        doc.setPage(i);
        color(LINE, 'draw');
        doc.setLineWidth(0.2);
        doc.line(M, PAGE_H - 12, PAGE_W - M, PAGE_H - 12);
        font(7.5, 'normal', MUTED);
        doc.text(`${clean(title)} · ${clean(eventName || 'Evento')}`, M, PAGE_H - 8);
        doc.text(`Generado ${dateTime(generatedAt)} · Página ${i} de ${pages}`, PAGE_W - M, PAGE_H - 8, { align: 'right' });
      }
      doc.save(filename);
      return doc;
    },
  };

  return api;
}
