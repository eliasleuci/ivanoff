import React, { useState, useEffect, useRef, useCallback } from 'react';
import QRCode from 'qrcode';
import { Html5Qrcode } from 'html5-qrcode';
import {
  createEventTicket,
  validateTicket,
  fetchEventTickets,
  deleteAllEventTickets,
} from '../hooks/useSupabase';


/* ─── Tipos de entrada ─── */
const TICKET_TYPES = [
  { id: 'General', label: 'General', emoji: '🎟️', color: '#2dd4a8', bg: 'rgba(45,212,168,0.12)' },
  { id: 'VIP', label: 'VIP', emoji: '⭐', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  { id: 'Combo', label: 'Combo', emoji: '🎁', color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
];

const fmt = (n) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
  }).format(n);

/* ══════════════════════════════════════════════════════════
   MODAL QR — Bottom sheet en mobile, centered en desktop
══════════════════════════════════════════════════════════ */
function QRModal({ ticket, eventName, onClose }) {
  const canvasRef = useRef(null);
  const [phone, setPhone] = useState('');
  const [copied, setCopied] = useState(false);
  const [qrReady, setQrReady] = useState(false);
  const [canShareFiles, setCanShareFiles] = useState(false);

  // Detect Web Share API support on mount
  useEffect(() => {
    setCanShareFiles(!!(navigator.canShare && navigator.share));
  }, []);

  // Prevent body scroll when modal open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // Generate QR onto canvas
  useEffect(() => {
    if (canvasRef.current && ticket) {
      const size = Math.min(window.innerWidth - 80, 260);
      QRCode.toCanvas(canvasRef.current, ticket.ticket_code, {
        width: size,
        margin: 2,
        color: { dark: '#14110f', light: '#ffffff' },
        errorCorrectionLevel: 'H',
      }).then(() => setQrReady(true));
    }
  }, [ticket]);

  const typeInfo = TICKET_TYPES.find((t) => t.id === ticket.ticket_type) || TICKET_TYPES[0];

  const buildMessage = () => [
    `🎟️ *ENTRADA — ${eventName || 'Evento'}*`,
    ``,
    `👤 *${ticket.buyer_name || 'Sin nombre'}*`,
    `🏷️ Tipo: ${ticket.ticket_type}`,
    `💰 Precio: ${fmt(ticket.price)}`,
    `💳 Pago: ${ticket.payment_method === 'efectivo' ? 'Efectivo 💵' : 'Transferencia 📲'}`,
    ``,
    `🔑 Código: \`${ticket.ticket_code}\``,
    ``,
    `⚠️ _Entrada personal e intransferible._`,
  ].join('\n');

  const downloadQR = () => {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    link.download = `entrada-${ticket.buyer_name || ticket.ticket_type}-${ticket.ticket_code.slice(4, 12)}.png`;
    link.href = canvasRef.current.toDataURL('image/png');
    link.click();
  };

  const sendWhatsApp = async () => {
    const num = phone.replace(/\D/g, '');
    // Try Web Share API (mobile — attaches QR image automatically)
    if (canvasRef.current) {
      const blob = await new Promise((res) => canvasRef.current.toBlob(res, 'image/png'));
      const file = new File([blob], `entrada-${ticket.ticket_type}.png`, { type: 'image/png' });
      try {
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], text: buildMessage(), title: `Entrada ${ticket.ticket_type}` });
          return; // done — image was shared
        }
      } catch (e) {
        if (e.name === 'AbortError') return; // user cancelled, do nothing
      }
    }
    // Fallback: download QR + open wa.me
    downloadQR();
    if (num) {
      window.open(`https://wa.me/${num}?text=${encodeURIComponent(buildMessage())}`, '_blank');
    }
  };

  const copyCode = () => {
    navigator.clipboard?.writeText(ticket.ticket_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="qrm-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="qrm-sheet">
        <div className="qrm-handle" />

        {/* Header */}
        <div className="qrm-header">
          <div className="qrm-header-left">
            <span className="qrm-header-emoji">{typeInfo.emoji}</span>
            <div>
              <div className="qrm-header-title">Entrada generada</div>
              <div className="qrm-header-sub">{eventName || 'Evento'}</div>
            </div>
          </div>
          <button className="qrm-close-btn" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        {/* Scrollable body */}
        <div className="qrm-body">
          {/* QR canvas */}
          <div className="qrm-qr-wrap">
            <div className="qrm-qr-frame" style={{ borderColor: typeInfo.color }}>
              <canvas ref={canvasRef} style={{ display: qrReady ? 'block' : 'none' }} />
              {!qrReady && <div className="qrm-qr-placeholder">Generando QR…</div>}
            </div>
            <span className="qrm-type-chip" style={{ background: typeInfo.bg, color: typeInfo.color }}>
              {typeInfo.emoji} {ticket.ticket_type}
            </span>
          </div>

          {/* Info rows */}
          <div className="qrm-info">
            <div className="qrm-info-row">
              <span className="qrm-info-key">Comprador</span>
              <span className="qrm-info-val">{ticket.buyer_name || '—'}</span>
            </div>
            <div className="qrm-info-row">
              <span className="qrm-info-key">Precio</span>
              <span className="qrm-info-val qrm-accent">{fmt(ticket.price)}</span>
            </div>
            <div className="qrm-info-row">
              <span className="qrm-info-key">Pago</span>
              <span className="qrm-info-val">
                {ticket.payment_method === 'efectivo' ? '💵 Efectivo' : '📲 Transferencia'}
              </span>
            </div>
            <button className="qrm-code-row" onClick={copyCode}>
              <span className="qrm-info-key">Código</span>
              <span className="qrm-code-val">
                <span className="qrm-code-text">{ticket.ticket_code.slice(0, 22)}…</span>
                <span className="qrm-copy-icon">{copied ? '✓' : '⎘'}</span>
              </span>
            </button>
          </div>

          {/* WhatsApp */}
          <div className="qrm-wa-card">
            <div className="qrm-wa-title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#25d366">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              Enviar por WhatsApp
            </div>

            {canShareFiles ? (
              /* MOBILE: Web Share API — QR se adjunta automáticamente */
              <>
                <button className="qrm-wa-share-btn" onClick={sendWhatsApp}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  Compartir QR + mensaje
                </button>
                <p className="qrm-wa-hint">📎 El QR se adjunta automáticamente. Solo elegí el contacto en WhatsApp.</p>
              </>
            ) : (
              /* DESKTOP / fallback: número + wa.me */
              <>
                <div className="qrm-wa-row">
                  <div className="qrm-wa-prefix">+</div>
                  <input
                    type="tel"
                    inputMode="numeric"
                    className="qrm-wa-input"
                    placeholder="549xxxxxxxxxx"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    maxLength={20}
                  />
                  <button className="qrm-wa-btn" onClick={sendWhatsApp} disabled={!phone.trim()}>
                    Enviar
                  </button>
                </div>
                <p className="qrm-wa-hint">El QR se descarga y abrís WhatsApp con el mensaje listo.</p>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="qrm-footer">
          <button className="qrm-btn-outline" onClick={downloadQR}>⬇ Descargar QR</button>
          <button className="qrm-btn-primary" onClick={onClose}>Listo ✓</button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   VENDER ENTRADA
══════════════════════════════════════════════════════════ */
function VenderEntrada({ eventName, onGenerated }) {
  const [form, setForm] = useState({
    buyerName: '',
    ticketType: 'General',
    price: '',
    paymentMethod: 'efectivo',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.price || Number(form.price) < 0) {
      setError('Ingresá un precio válido.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const ticket = await createEventTicket(form);
      onGenerated(ticket);
      setForm({ buyerName: '', ticketType: 'General', price: '', paymentMethod: 'efectivo' });
    } catch (err) {
      setError(err.message || 'Error al crear la entrada.');
    } finally {
      setLoading(false);
    }
  };

  const selectedType = TICKET_TYPES.find((t) => t.id === form.ticketType);

  return (
    <div className="vender-wrap">
      <form onSubmit={handleSubmit} className="vender-form" noValidate>

        {/* Tipo de entrada — big visual selector */}
        <div className="vf-section">
          <label className="vf-label">Tipo de entrada</label>
          <div className="vf-type-grid">
            {TICKET_TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`vf-type-card ${form.ticketType === t.id ? 'vf-type-card--active' : ''}`}
                style={form.ticketType === t.id ? {
                  borderColor: t.color,
                  background: t.bg,
                } : {}}
                onClick={() => set('ticketType', t.id)}
              >
                <span className="vf-type-emoji">{t.emoji}</span>
                <span className="vf-type-label" style={form.ticketType === t.id ? { color: t.color } : {}}>
                  {t.label}
                </span>
                {form.ticketType === t.id && (
                  <span className="vf-type-check" style={{ color: t.color }}>✓</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Nombre */}
        <div className="vf-section">
          <label className="vf-label" htmlFor="buyer-name">
            Nombre del comprador <span className="vf-optional">(opcional)</span>
          </label>
          <input
            id="buyer-name"
            type="text"
            className="vf-input"
            placeholder="Ej: Juan Pérez"
            value={form.buyerName}
            onChange={(e) => set('buyerName', e.target.value)}
            autoComplete="name"
          />
        </div>

        {/* Precio */}
        <div className="vf-section">
          <label className="vf-label" htmlFor="ticket-price">Precio</label>
          <div className="vf-price-wrap">
            <span className="vf-price-symbol">$</span>
            <input
              id="ticket-price"
              type="number"
              inputMode="numeric"
              className="vf-input vf-price-input"
              placeholder="0"
              min="0"
              step="100"
              value={form.price}
              onChange={(e) => set('price', e.target.value)}
              required
            />
          </div>
        </div>

        {/* Método de pago */}
        <div className="vf-section">
          <label className="vf-label">Método de pago</label>
          <div className="vf-pay-grid">
            <button
              type="button"
              className={`vf-pay-btn ${form.paymentMethod === 'efectivo' ? 'vf-pay-btn--active' : ''}`}
              onClick={() => set('paymentMethod', 'efectivo')}
            >
              <span className="vf-pay-icon">💵</span>
              <span>Efectivo</span>
            </button>
            <button
              type="button"
              className={`vf-pay-btn ${form.paymentMethod === 'transferencia' ? 'vf-pay-btn--active' : ''}`}
              onClick={() => set('paymentMethod', 'transferencia')}
            >
              <span className="vf-pay-icon">📲</span>
              <span>Transferencia</span>
            </button>
          </div>
        </div>

        {error && <div className="vf-error">{error}</div>}

        <button
          type="submit"
          className="vf-submit"
          disabled={loading}
          style={!loading ? { background: selectedType?.color } : {}}
        >
          {loading ? (
            <span className="vf-spinner" />
          ) : (
            <>{selectedType?.emoji} Generar Entrada {selectedType?.label}</>
          )}
        </button>
      </form>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   ESCANEAR / VALIDAR
══════════════════════════════════════════════════════════ */
function EscanearEntrada() {
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const html5QrRef = useRef(null);

  const stopScanner = useCallback(async () => {
    if (html5QrRef.current) {
      try {
        await html5QrRef.current.stop();
        html5QrRef.current.clear();
      } catch (_) { /* ignore */ }
      html5QrRef.current = null;
    }
    setScanning(false);
  }, []);

  const startScanner = useCallback(async () => {
    setResult(null);
    setScanning(true);
    await new Promise((r) => setTimeout(r, 150));
    try {
      const scanner = new Html5Qrcode('qr-reader-el');
      html5QrRef.current = scanner;
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        async (decoded) => {
          await stopScanner();
          setLoading(true);
          try {
            const res = await validateTicket(decoded);
            setResult(res);
          } catch (err) {
            setResult({ status: 'error', message: err.message });
          } finally {
            setLoading(false);
          }
        },
        () => {}
      );
    } catch (err) {
      setScanning(false);
      setResult({ status: 'camera_error', message: 'No se pudo acceder a la cámara. Verificá los permisos.' });
    }
  }, [stopScanner]);

  useEffect(() => () => { stopScanner(); }, [stopScanner]);

  const reset = () => { setResult(null); stopScanner(); };

  if (loading) {
    return (
      <div className="scan-centered">
        <div className="scan-big-spinner" />
        <p className="scan-loading-txt">Validando entrada…</p>
      </div>
    );
  }

  if (result) {
    const isValid = result.status === 'valid';
    const isUsed = result.status === 'already_used';

    return (
      <div className={`scan-result-card ${isValid ? 'src-valid' : isUsed ? 'src-used' : 'src-unknown'}`}>
        <div className="src-icon">
          {isValid ? '✅' : isUsed ? '🚫' : '⚠️'}
        </div>
        <div className="src-title">
          {isValid ? 'ENTRADA VÁLIDA' : isUsed ? 'YA UTILIZADA' : result.status === 'not_found' ? 'NO RECONOCIDA' : 'ERROR'}
        </div>
        {result.buyer_name && (
          <div className="src-buyer">{result.buyer_name}</div>
        )}
        {result.ticket_type && (
          <div className="src-type">{result.ticket_type}</div>
        )}
        {result.used_at && (
          <div className="src-meta">
            Escaneada el {new Date(result.used_at).toLocaleString('es-AR', {
              day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
            })}
          </div>
        )}
        {result.message && (
          <div className="src-meta">{result.message}</div>
        )}
        <button className="src-again-btn" onClick={reset}>
          📷 Escanear otra entrada
        </button>
      </div>
    );
  }

  if (scanning) {
    return (
      <div className="scan-active-wrap">
        <div id="qr-reader-el" className="qr-reader-el" />
        <p className="scan-active-hint">Apuntá la cámara al código QR</p>
        <button className="scan-cancel-btn" onClick={stopScanner}>
          Cancelar
        </button>
      </div>
    );
  }

  return (
    <div className="scan-idle-wrap">
      <div className="scan-idle-art">
        <div className="scan-idle-corners">
          <span /><span /><span /><span />
        </div>
        <span className="scan-idle-cam">📷</span>
      </div>
      <p className="scan-idle-txt">
        Activá la cámara para escanear el QR de la entrada en la puerta
      </p>
      <button className="scan-start-btn" onClick={startScanner}>
        Activar cámara
      </button>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   LISTADO
══════════════════════════════════════════════════════════ */
function ListadoEntradas({ refresh }) {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchEventTickets();
      setTickets(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, refresh]);

  const filtered = tickets.filter((t) => {
    if (filter === 'pending') return !t.used;
    if (filter === 'used') return t.used;
    return true;
  });

  const total = tickets.length;
  const usedCount = tickets.filter((t) => t.used).length;
  const revenue = tickets.reduce((s, t) => s + Number(t.price), 0);

  if (loading) {
    return (
      <div className="scan-centered">
        <div className="scan-big-spinner" />
        <p className="scan-loading-txt">Cargando entradas…</p>
      </div>
    );
  }

  return (
    <div className="listado-wrap">
      {/* Stats row */}
      <div className="ls-stats">
        <div className="ls-stat">
          <span className="ls-stat-n">{total}</span>
          <span className="ls-stat-l">Total</span>
        </div>
        <div className="ls-stat ls-stat--pen">
          <span className="ls-stat-n">{total - usedCount}</span>
          <span className="ls-stat-l">Pend.</span>
        </div>
        <div className="ls-stat ls-stat--used">
          <span className="ls-stat-n">{usedCount}</span>
          <span className="ls-stat-l">Usadas</span>
        </div>
        <div className="ls-stat ls-stat--rev">
          <span className="ls-stat-n ls-stat-n--sm">{fmt(revenue)}</span>
          <span className="ls-stat-l">Recaudado</span>
        </div>
      </div>

      {/* Filter + refresh */}
      <div className="ls-filters">
        {[
          { id: 'all', label: 'Todas' },
          { id: 'pending', label: '⏳ Pend.' },
          { id: 'used', label: '✅ Usadas' },
        ].map((f) => (
          <button
            key={f.id}
            className={`ls-filter-btn ${filter === f.id ? 'active' : ''}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
        <button className="ls-refresh-btn" onClick={load}>↻</button>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="ls-empty">
          <span style={{ fontSize: 40 }}>🎟️</span>
          <p>No hay entradas{filter !== 'all' ? ' en esta categoría' : ' aún'}.</p>
        </div>
      ) : (
        <div className="ls-list">
          {filtered.map((t) => {
            const ti = TICKET_TYPES.find((x) => x.id === t.ticket_type) || TICKET_TYPES[0];
            return (
              <div key={t.id} className={`ls-card ${t.used ? 'ls-card--used' : ''}`}>
                <div
                  className="ls-card-stripe"
                  style={{ background: t.used ? '#3f3f46' : ti.color }}
                />
                <div className="ls-card-body">
                  <div className="ls-card-top">
                    <span
                      className="ls-type-chip"
                      style={{ background: ti.bg, color: ti.color }}
                    >
                      {ti.emoji} {t.ticket_type}
                    </span>
                    <span className={`ls-status ${t.used ? 'ls-status--used' : 'ls-status--pen'}`}>
                      {t.used ? '✓ Usada' : '⏳ Pendiente'}
                    </span>
                  </div>
                  <div className="ls-card-name">{t.buyer_name || 'Sin nombre'}</div>
                  <div className="ls-card-meta">
                    <span>{t.payment_method === 'efectivo' ? '💵' : '📲'} {fmt(t.price)}</span>
                    <span className="ls-card-date">
                      {new Date(t.created_at).toLocaleString('es-AR', {
                        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                    {t.used && t.used_at && (
                      <span className="ls-used-time">
                        Ingresó: {new Date(t.used_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   CIERRE DE EVENTO
════════════════════════════════════════════════════════ */
function CierreTab({ eventName, onReset }) {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [resetDone, setResetDone] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchEventTickets();
      setTickets(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /* ─ Stats ─ */
  const total = tickets.length;
  const used = tickets.filter((t) => t.used).length;
  const pending = total - used;
  const revenue = tickets.reduce((s, t) => s + Number(t.price), 0);
  const byType = TICKET_TYPES.map((tt) => ({
    ...tt,
    count: tickets.filter((t) => t.ticket_type === tt.id).length,
    revenue: tickets.filter((t) => t.ticket_type === tt.id).reduce((s, t) => s + Number(t.price), 0),
    used: tickets.filter((t) => t.ticket_type === tt.id && t.used).length,
  }));
  const byPayment = [
    { id: 'efectivo', label: '💵 Efectivo', count: tickets.filter((t) => t.payment_method === 'efectivo').length, revenue: tickets.filter((t) => t.payment_method === 'efectivo').reduce((s, t) => s + Number(t.price), 0) },
    { id: 'transferencia', label: '💳 Transferencia', count: tickets.filter((t) => t.payment_method === 'transferencia').length, revenue: tickets.filter((t) => t.payment_method === 'transferencia').reduce((s, t) => s + Number(t.price), 0) },
  ];

  /* ─ Descargar CSV ─ */
  const downloadCSV = () => {
    const now = new Date();
    const dateStr = now.toLocaleDateString('es-AR').replace(/\//g, '-');
    const timeStr = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }).replace(':', '');

    const header = ['#', 'Nombre', 'Tipo', 'Precio', 'Pago', 'Estado', 'Creada', 'Escaneada'].join(',');
    const rows = tickets.map((t, i) => [
      i + 1,
      `"${t.buyer_name || 'Sin nombre'}"`,
      t.ticket_type,
      t.price,
      t.payment_method,
      t.used ? 'Usada' : 'Pendiente',
      `"${new Date(t.created_at).toLocaleString('es-AR')}"`,
      t.used_at ? `"${new Date(t.used_at).toLocaleString('es-AR')}"` : '-',
    ].join(','));

    const summary = [
      '',
      `"RESUMEN"`,
      `"Evento","${eventName || 'Sin nombre'}"`,
      `"Fecha","${now.toLocaleDateString('es-AR')}"`,
      `"Total entradas",${total}`,
      `"Entradas usadas",${used}`,
      `"Entradas pendientes",${pending}`,
      `"Recaudación total",${revenue}`,
      '',
      `"POR TIPO"`,
      ...byType.map((t) => `"${t.label}",${t.count},${t.revenue}`),
      '',
      `"POR PAGO"`,
      ...byPayment.map((p) => `"${p.label}",${p.count},${p.revenue}`),
    ];

    const csv = [header, ...rows, ...summary].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte-entradas-${dateStr}-${timeStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ─ Descargar TXT resumen ─ */
  const downloadTXT = () => {
    const now = new Date();
    const lines = [
      `════════════════════════════════════════`,
      `  REPORTE DE CIERRE`,
      `  ${(eventName || 'Evento').toUpperCase()}`,
      `  ${now.toLocaleDateString('es-AR')} ${now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`,
      `════════════════════════════════════════`,
      ``,
      `RESUMEN GENERAL`,
      `  Total entradas vendidas : ${total}`,
      `  Entradas usadas         : ${used}`,
      `  Entradas pendientes     : ${pending}`,
      `  Recaudación total       : ${fmt(revenue)}`,
      ``,
      `BREAKDOWN POR TIPO`,
      ...byType.map((t) => `  ${t.label.padEnd(12)}: ${t.count} entradas — ${fmt(t.revenue)} — ${t.used} ingresaron`),
      ``,
      `BREAKDOWN POR MÉTODO DE PAGO`,
      ...byPayment.map((p) => `  ${p.label.padEnd(18)}: ${p.count} entradas — ${fmt(p.revenue)}`),
      ``,
      `════════════════════════════════════════`,
      `DETALLE DE ENTRADAS`,
      `════════════════════════════════════════`,
      ...tickets.map((t, i) =>
        `${String(i + 1).padStart(3, ' ')}. [${t.used ? 'USADA  ' : 'PENDING'}] ${(t.buyer_name || 'Sin nombre').padEnd(20)} ${t.ticket_type.padEnd(8)} ${fmt(t.price)}`
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte-cierre-${now.toLocaleDateString('es-AR').replace(/\//g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ─ Reset ─ */
  const handleReset = async () => {
    if (confirmText.trim().toLowerCase() !== 'limpiar') return;
    setResetting(true);
    try {
      await deleteAllEventTickets();
      setResetDone(true);
      setConfirmOpen(false);
      setTickets([]);
      onReset?.();
    } catch (err) {
      alert('Error al limpiar: ' + err.message);
    } finally {
      setResetting(false);
    }
  };

  if (loading) {
    return (
      <div className="scan-centered">
        <div className="scan-big-spinner" />
        <p className="scan-loading-txt">Cargando reporte…</p>
      </div>
    );
  }

  if (resetDone) {
    return (
      <div className="cierre-done">
        <div className="cierre-done-icon">✨</div>
        <div className="cierre-done-title">Sistema limpio</div>
        <p className="cierre-done-sub">Todas las entradas fueron eliminadas. Listo para el próximo evento.</p>
        <button className="scan-start-btn" onClick={() => { setResetDone(false); load(); }}>
          Volver
        </button>
      </div>
    );
  }

  return (
    <div className="cierre-wrap">
      {/* Header */}
      <div className="cierre-header">
        <div className="cierre-header-icon">🌙</div>
        <div>
          <div className="cierre-header-title">Cierre de evento</div>
          <div className="cierre-header-sub">{eventName || 'Sin nombre'} • {new Date().toLocaleDateString('es-AR')}</div>
        </div>
      </div>

      {/* Big stats */}
      <div className="cierre-stats-grid">
        <div className="cierre-stat cierre-stat--main">
          <span className="cierre-stat-n">{total}</span>
          <span className="cierre-stat-l">Entradas vendidas</span>
        </div>
        <div className="cierre-stat cierre-stat--green">
          <span className="cierre-stat-n">{used}</span>
          <span className="cierre-stat-l">Ingresaron</span>
        </div>
        <div className="cierre-stat cierre-stat--yellow">
          <span className="cierre-stat-n">{pending}</span>
          <span className="cierre-stat-l">No vinieron</span>
        </div>
        <div className="cierre-stat cierre-stat--accent">
          <span className="cierre-stat-n cierre-stat-n--sm">{fmt(revenue)}</span>
          <span className="cierre-stat-l">Recaudado</span>
        </div>
      </div>

      {/* By type */}
      <div className="cierre-section">
        <div className="cierre-section-title">Por tipo de entrada</div>
        <div className="cierre-type-list">
          {byType.map((t) => (
            <div key={t.id} className="cierre-type-row">
              <span className="cierre-type-chip" style={{ background: t.bg, color: t.color }}>
                {t.emoji} {t.label}
              </span>
              <div className="cierre-type-info">
                <span className="cierre-type-count">{t.count} entradas</span>
                <span className="cierre-type-used">{t.used} ingresaron</span>
              </div>
              <span className="cierre-type-rev">{fmt(t.revenue)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* By payment */}
      <div className="cierre-section">
        <div className="cierre-section-title">Por método de pago</div>
        <div className="cierre-pay-list">
          {byPayment.map((p) => (
            <div key={p.id} className="cierre-pay-row">
              <span className="cierre-pay-label">{p.label}</span>
              <span className="cierre-pay-count">{p.count}</span>
              <span className="cierre-pay-rev">{fmt(p.revenue)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <div className="cierre-progress-wrap">
          <div className="cierre-progress-label">
            <span>Ingreso: {total > 0 ? Math.round((used / total) * 100) : 0}%</span>
            <span>{used} / {total}</span>
          </div>
          <div className="cierre-progress-bar">
            <div
              className="cierre-progress-fill"
              style={{ width: `${total > 0 ? (used / total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Download buttons */}
      <div className="cierre-section">
        <div className="cierre-section-title">📅 Descargar reporte</div>
        <div className="cierre-dl-grid">
          <button className="cierre-dl-btn" onClick={downloadCSV}>
            <span className="cierre-dl-icon">📊</span>
            <div>
              <div className="cierre-dl-name">Planilla CSV</div>
              <div className="cierre-dl-desc">Abrir en Excel / Sheets</div>
            </div>
          </button>
          <button className="cierre-dl-btn" onClick={downloadTXT}>
            <span className="cierre-dl-icon">📝</span>
            <div>
              <div className="cierre-dl-name">Resumen TXT</div>
              <div className="cierre-dl-desc">Reporte de texto plano</div>
            </div>
          </button>
        </div>
      </div>

      {/* Danger zone */}
      <div className="cierre-danger-zone">
        <div className="cierre-danger-header">
          <span className="cierre-danger-icon">⚠️</span>
          <div>
            <div className="cierre-danger-title">Limpiar sistema</div>
            <div className="cierre-danger-sub">Elimina todas las entradas del evento actual de forma permanente.</div>
          </div>
        </div>
        <button
          className="cierre-danger-btn"
          onClick={() => { setConfirmOpen(true); setConfirmText(''); }}
          disabled={total === 0}
        >
          🗑️ Limpiar todo para el próximo evento
        </button>
      </div>

      {/* Confirm modal */}
      {confirmOpen && (
        <div className="cierre-confirm-overlay">
          <div className="cierre-confirm-sheet">
            <div className="cierre-confirm-handle" />
            <div className="cierre-confirm-icon">🛠️</div>
            <div className="cierre-confirm-title">Confirmar limpieza</div>
            <p className="cierre-confirm-text">
              Esta acción elimina <strong>{total} entradas</strong> de forma permanente.
              No se puede deshacer. Descargá el reporte antes de continuar.
            </p>
            <p className="cierre-confirm-instruction">
              Escribí <strong>limpiar</strong> para confirmar:
            </p>
            <input
              type="text"
              className="cierre-confirm-input"
              placeholder="limpiar"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoCapitalize="none"
            />
            <div className="cierre-confirm-actions">
              <button
                className="cierre-confirm-cancel"
                onClick={() => setConfirmOpen(false)}
                disabled={resetting}
              >
                Cancelar
              </button>
              <button
                className="cierre-confirm-ok"
                onClick={handleReset}
                disabled={confirmText.trim().toLowerCase() !== 'limpiar' || resetting}
              >
                {resetting ? 'Limpiando…' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   ROOT — ENTRADAS TAB
══════════════════════════════════════════════════════════ */
const SUB_TABS = [
  { id: 'vender', label: 'Vender', icon: '🎟️' },
  { id: 'escanear', label: 'Escanear', icon: '📷' },
  { id: 'listado', label: 'Listado', icon: '📋' },
  { id: 'cierre', label: 'Cierre', icon: '🌙' },
];

export default function EntradasTab({ eventName }) {
  const [subTab, setSubTab] = useState('vender');
  const [qrTicket, setQrTicket] = useState(null);
  const [listRefresh, setListRefresh] = useState(0);

  const handleGenerated = (ticket) => {
    setQrTicket(ticket);
    setListRefresh((n) => n + 1);
  };

  const handleReset = () => {
    setListRefresh((n) => n + 1);
  };


  return (
    <div className="et-root">
      {/* Sub-nav sticky */}
      <div className="et-subnav">
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            className={`et-subnav-btn ${subTab === t.id ? 'active' : ''}`}
            onClick={() => setSubTab(t.id)}
          >
            <span className="et-subnav-icon">{t.icon}</span>
            <span className="et-subnav-label">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="et-content">
        {subTab === 'vender' && (
          <VenderEntrada eventName={eventName} onGenerated={handleGenerated} />
        )}
        {subTab === 'escanear' && <EscanearEntrada />}
        {subTab === 'listado' && <ListadoEntradas refresh={listRefresh} />}
        {subTab === 'cierre' && <CierreTab eventName={eventName} onReset={handleReset} />}

      </div>

      {/* QR Modal */}
      {qrTicket && (
        <QRModal
          ticket={qrTicket}
          eventName={eventName}
          onClose={() => setQrTicket(null)}
        />
      )}
    </div>
  );
}
