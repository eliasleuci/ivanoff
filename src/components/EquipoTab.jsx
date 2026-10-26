import React, { useState, useEffect, useCallback } from 'react';
import {
  fetchEventTickets,
  fetchProfiles,
  createTeamUser,
  resetTeamPassword,
  setTeamUserActive,
  updateTeamUser,
  deleteTeamUser,
  updateEventSettings,
} from '../hooks/useSupabase';
import { TICKET_TYPES, fmt, isSold, groupBySeller, downloadFile } from '../utils/tickets';

const ROLE_LABELS = { admin: 'Admin', rrpp: 'RRPP', puerta: 'Puerta' };

function Loading({ text }) {
  return (
    <div className="scan-centered">
      <div className="scan-big-spinner" />
      <p className="scan-loading-txt">{text}</p>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   PANEL GENERAL — cuántas vendió cada RRPP
══════════════════════════════════════════════════════════ */
/* Entradas de un vendedor: primero las que faltan escanear */
function SellerTickets({ tickets }) {
  const sorted = [...tickets].sort((a, b) => Number(a.used) - Number(b.used) || new Date(b.created_at) - new Date(a.created_at));
  const time = (d) => new Date(d).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="eq-detail">
      {sorted.map((t) => {
        const ti = TICKET_TYPES.find((x) => x.id === t.ticket_type) || TICKET_TYPES[0];
        return (
          <div key={t.id} className={`eq-detail-row ${t.used ? 'eq-detail-row--used' : ''}`}>
            <span className="eq-detail-status">{t.used ? '✅' : '⏳'}</span>
            <div className="eq-detail-info">
              <span className="eq-detail-name">{t.buyer_name || 'Sin nombre'}</span>
              <span className="eq-detail-meta">
                <span style={{ color: ti.color }}>{ti.emoji} {t.ticket_type}</span>
                {' · '}
                {t.used ? `Escaneada ${time(t.used_at)}` : `Vendida ${time(t.created_at)}`}
              </span>
            </div>
            <span className="eq-detail-price">{fmt(t.price)}</span>
          </div>
        );
      })}
    </div>
  );
}

function PanelGeneral({ eventName }) {
  const [tickets, setTickets] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openKey, setOpenKey] = useState(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  const downloadPdf = async () => {
    setPdfBusy(true);
    try {
      const { downloadRrppReport } = await import('../utils/reports');
      downloadRrppReport({ eventName, tickets, profiles });
    } catch (err) {
      console.error(err);
      alert('No se pudo generar el PDF: ' + err.message);
    } finally {
      setPdfBusy(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, p] = await Promise.all([fetchEventTickets(), fetchProfiles()]);
      setTickets(t.filter(isSold));
      setProfiles(p);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Loading text="Cargando panel…" />;

  // Incluir a los RRPP activos que todavía no vendieron
  const groups = groupBySeller(tickets);
  const empty = { count: 0, used: 0, revenue: 0, efectivo: 0, transferencia: 0, byType: {}, tickets: [] };
  for (const p of profiles) {
    if (p.role === 'rrpp' && p.active && !groups.some((g) => g.key === p.id)) {
      groups.push({ key: p.id, name: p.display_name, ...empty });
    }
  }

  const total = tickets.length;
  const used = tickets.filter((t) => t.used).length;
  const revenue = tickets.reduce((s, t) => s + Number(t.price), 0);
  const downloadCSV = () => {
    const header = ['Vendedor', 'Vendidas', 'Escaneadas', 'Sin escanear', ...TICKET_TYPES.map((t) => t.label), 'Efectivo', 'Transferencia', 'Total'].join(',');
    const rows = groups.map((g) => [
      `"${g.name}"`,
      g.count,
      g.used,
      g.count - g.used,
      ...TICKET_TYPES.map((t) => g.byType[t.id] || 0),
      g.efectivo,
      g.transferencia,
      g.revenue,
    ].join(','));
    const dateStr = new Date().toLocaleDateString('es-AR').replace(/\//g, '-');
    downloadFile(
      '﻿' + [`"${eventName || 'Evento'}"`, header, ...rows].join('\n'),
      `rrpp-${dateStr}.csv`,
      'text/csv;charset=utf-8;'
    );
  };

  return (
    <div className="cierre-wrap">
      <div className="ls-stats">
        <div className="ls-stat">
          <span className="ls-stat-n">{total}</span>
          <span className="ls-stat-l">Vendidas</span>
        </div>
        <div className="ls-stat ls-stat--used">
          <span className="ls-stat-n">{used}</span>
          <span className="ls-stat-l">Escaneadas</span>
        </div>
        <div className="ls-stat ls-stat--pen">
          <span className="ls-stat-n">{total - used}</span>
          <span className="ls-stat-l">Sin escanear</span>
        </div>
        <div className="ls-stat ls-stat--rev">
          <span className="ls-stat-n ls-stat-n--sm">{fmt(revenue)}</span>
          <span className="ls-stat-l">Recaudado</span>
        </div>
      </div>

      <div className="cierre-section">
        <div className="eq-section-head">
          <div className="cierre-section-title">
            Ventas por vendedor · {profiles.filter((p) => p.role === 'rrpp' && p.active).length} RRPP activos
          </div>
          <button className="ls-refresh-btn" onClick={load} title="Actualizar" aria-label="Actualizar">↻</button>
        </div>
        {groups.length === 0 ? (
          <div className="ls-empty"><p>Todavía no hay entradas vendidas.</p></div>
        ) : (
          <div className="cierre-type-list">
            {groups.map((g, i) => {
              const open = openKey === g.key;
              const pct = g.count ? Math.round((g.used / g.count) * 100) : 0;
              return (
                <div key={g.key} className="eq-seller-row">
                  <button
                    type="button"
                    className="eq-seller-top"
                    onClick={() => setOpenKey(open ? null : g.key)}
                    disabled={g.count === 0}
                    aria-expanded={open}
                  >
                    <span className="eq-rank">{i + 1}</span>
                    <span className="eq-seller-name">{g.name}</span>
                    {g.count > 0 && <span className="eq-seller-toggle">{open ? 'Ocultar ▲' : 'Ver entradas ▼'}</span>}
                  </button>

                  <div className="eq-seller-stats">
                    <div className="eq-seller-stat">
                      <span className="eq-seller-stat-n">{g.count}</span>
                      <span className="eq-seller-stat-l">Vendidas</span>
                    </div>
                    <div className="eq-seller-stat eq-seller-stat--used">
                      <span className="eq-seller-stat-n">{g.used}</span>
                      <span className="eq-seller-stat-l">Escaneadas</span>
                    </div>
                    <div className="eq-seller-stat eq-seller-stat--pen">
                      <span className="eq-seller-stat-n">{g.count - g.used}</span>
                      <span className="eq-seller-stat-l">Sin escanear</span>
                    </div>
                  </div>

                  <div className="eq-bar" title={`${pct}% escaneadas`}>
                    <div className="eq-bar-fill" style={{ width: `${pct}%` }} />
                  </div>

                  <div className="eq-seller-meta">
                    {TICKET_TYPES.filter((t) => g.byType[t.id]).map((t) => (
                      <span key={t.id} style={{ color: t.color }}>{t.emoji} {g.byType[t.id]}</span>
                    ))}
                    <span>💵 {fmt(g.efectivo)}</span>
                    <span>📲 {fmt(g.transferencia)}</span>
                    <span className="eq-seller-total">{fmt(g.revenue)}</span>
                  </div>

                  {open && <SellerTickets tickets={g.tickets} />}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="cierre-dl-grid">
        <button className="cierre-dl-btn cierre-dl-btn--main" onClick={downloadPdf} disabled={groups.length === 0 || pdfBusy}>
          <span className="cierre-dl-icon">📄</span>
          <div>
            <div className="cierre-dl-name">{pdfBusy ? 'Generando…' : 'Rendición PDF'}</div>
            <div className="cierre-dl-desc">Cada RRPP con sus entradas, para contar y pagar</div>
          </div>
        </button>
        <button className="cierre-dl-btn" onClick={downloadCSV} disabled={groups.length === 0}>
          <span className="cierre-dl-icon">📊</span>
          <div>
            <div className="cierre-dl-name">Planilla CSV</div>
            <div className="cierre-dl-desc">Abrir en Excel / Sheets</div>
          </div>
        </button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   EQUIPO — alta, edición, pausa, eliminación y claves
══════════════════════════════════════════════════════════ */

/* Datos de acceso listos para pasarle al RRPP */
function CredentialsCard({ title, username, password, onClose }) {
  const [copied, setCopied] = useState(false);
  const text = `Tu acceso para vender entradas:\n👤 Usuario: ${username}\n🔑 Clave: ${password}\n🔗 ${window.location.origin}\n\nAl entrar te va a pedir que elijas una clave nueva.`;

  const copy = () => {
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="eq-created">
      <div className="eq-created-title">{title}</div>
      <pre className="eq-created-text">{text}</pre>
      <div className="eq-created-actions">
        <button className="qrm-btn-outline" onClick={copy}>{copied ? '✓ Copiado' : '⎘ Copiar'}</button>
        <button
          className="qrm-btn-primary"
          onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')}
        >
          Enviar por WhatsApp
        </button>
      </div>
      <button className="eq-link-btn" onClick={onClose}>Cerrar</button>
    </div>
  );
}

/* Hoja modal para editar / cambiar clave / eliminar un integrante */
function MemberSheet({ mode, member, soldCount, onClose, onSaved }) {
  const [displayName, setDisplayName] = useState(member.display_name);
  const [username, setUsername] = useState(member.username);
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [credentials, setCredentials] = useState(null);

  const run = async () => {
    setError('');
    setSaving(true);
    try {
      if (mode === 'edit') {
        await updateTeamUser(member.id, { displayName, username });
        onSaved();
        onClose();
      } else if (mode === 'password') {
        if (password.length < 6) throw new Error('La clave debe tener al menos 6 caracteres.');
        await resetTeamPassword(member.id, password);
        setCredentials({ username: member.username, password });
        onSaved();
      } else if (mode === 'delete') {
        await deleteTeamUser(member.id);
        onSaved();
        onClose();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const titles = {
    edit: `Editar a ${member.display_name}`,
    password: `Nueva clave para ${member.display_name}`,
    delete: `Eliminar a ${member.display_name}`,
  };

  return (
    <div className="pass-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pass-sheet eq-sheet">
        <div className="pass-handle" />
        <div className="pass-title">{titles[mode]}</div>

        {credentials ? (
          <CredentialsCard
            title="✅ Clave cambiada"
            username={credentials.username}
            password={credentials.password}
            onClose={onClose}
          />
        ) : (
          <>
            {mode === 'edit' && (
              <>
                <label className="vf-label eq-sheet-label">Nombre</label>
                <input className="vf-input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoFocus />
                <label className="vf-label eq-sheet-label">Usuario para ingresar</label>
                <input
                  className="vf-input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoCapitalize="none"
                  autoCorrect="off"
                />
                <p className="pt-note">Las entradas que ya vendió pasan a mostrar el nombre nuevo.</p>
              </>
            )}

            {mode === 'password' && (
              <>
                <input
                  className="vf-input"
                  placeholder="Clave nueva (mínimo 6 caracteres)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoFocus
                />
                <p className="pt-note">Cuando entre con esta clave, se le va a pedir que elija una propia.</p>
              </>
            )}

            {mode === 'delete' && (
              <p className="pass-sub">
                Ya no va a poder ingresar.{' '}
                {soldCount > 0
                  ? `Sus ${soldCount} entradas vendidas siguen siendo válidas y quedan registradas a su nombre.`
                  : 'No tiene entradas vendidas.'}
                {' '}Si solo querés frenarlo por un tiempo, usá <strong>Pausar</strong>.
              </p>
            )}

            {error && <div className="vf-error eq-sheet-full">{error}</div>}
            <div className="cierre-confirm-actions eq-sheet-full">
              <button className="cierre-confirm-cancel" onClick={onClose} disabled={saving}>Cancelar</button>
              <button
                className={mode === 'delete' ? 'cierre-confirm-ok' : 'eq-confirm-ok'}
                onClick={run}
                disabled={saving}
              >
                {saving ? 'Guardando…' : mode === 'delete' ? 'Eliminar' : 'Guardar'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function GestionEquipo({ currentUserId }) {
  const [profiles, setProfiles] = useState([]);
  const [soldBySeller, setSoldBySeller] = useState({});
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ displayName: '', username: '', password: '', role: 'rrpp' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [sheet, setSheet] = useState(null); // { mode, member }

  const load = useCallback(async () => {
    try {
      const [p, t] = await Promise.all([fetchProfiles(), fetchEventTickets()]);
      setProfiles(p);
      const counts = {};
      for (const ticket of t.filter(isSold)) {
        if (ticket.seller_id) counts[ticket.seller_id] = (counts[ticket.seller_id] || 0) + 1;
      }
      setSoldBySeller(counts);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const profile = await createTeamUser(form);
      setCreated({ displayName: profile.display_name, username: profile.username, password: form.password });
      setForm({ displayName: '', username: '', password: '', role: form.role });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (p) => {
    const msg = p.active
      ? `¿Pausar a ${p.display_name}? No va a poder ingresar ni vender hasta que lo reactives. Sus entradas siguen siendo válidas.`
      : `¿Reactivar a ${p.display_name}?`;
    if (!window.confirm(msg)) return;
    setBusyId(p.id);
    try {
      await setTeamUserActive(p.id, !p.active);
      await load();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const team = profiles.filter((p) => p.role !== 'admin');
  const admins = profiles.filter((p) => p.role === 'admin');

  return (
    <div className="cierre-wrap">
      <form className="vender-form" onSubmit={handleCreate}>
        <div className="cierre-section-title">Nuevo integrante</div>
        <div className="vf-pay-grid">
          {['rrpp', 'puerta'].map((r) => (
            <button
              type="button"
              key={r}
              className={`vf-pay-btn ${form.role === r ? 'vf-pay-btn--active' : ''}`}
              onClick={() => setForm((f) => ({ ...f, role: r }))}
            >
              <span className="vf-pay-icon">{r === 'rrpp' ? '🎟️' : '📷'}</span>
              <span>{r === 'rrpp' ? 'RRPP (vende)' : 'Puerta (escanea)'}</span>
            </button>
          ))}
        </div>
        <input
          className="vf-input"
          placeholder="Nombre (ej: Juan Pérez)"
          value={form.displayName}
          onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
          required
        />
        <input
          className="vf-input"
          placeholder="Usuario para ingresar (ej: juanp)"
          value={form.username}
          onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
          autoCapitalize="none"
          autoCorrect="off"
          required
        />
        <input
          className="vf-input"
          placeholder="Clave inicial (mínimo 6 caracteres)"
          value={form.password}
          onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          autoCapitalize="none"
          autoCorrect="off"
          minLength={6}
          required
        />
        {error && <div className="vf-error">{error}</div>}
        <button type="submit" className="vf-submit" style={{ background: 'var(--color-accent)' }} disabled={saving}>
          {saving ? <span className="vf-spinner" /> : 'Dar de alta'}
        </button>
      </form>

      {created && (
        <CredentialsCard
          title={`✅ ${created.displayName} ya puede ingresar`}
          username={created.username}
          password={created.password}
          onClose={() => setCreated(null)}
        />
      )}

      <div className="cierre-section">
        <div className="eq-section-head">
          <div className="cierre-section-title">Equipo ({team.length})</div>
          <button className="ls-refresh-btn" onClick={load} title="Actualizar">↻</button>
        </div>
        {loading ? (
          <Loading text="Cargando equipo…" />
        ) : team.length === 0 ? (
          <div className="ls-empty"><p>Todavía no diste de alta a nadie.</p></div>
        ) : (
          <div className="cierre-type-list">
            {team.map((p) => (
              <div key={p.id} className={`eq-member ${p.active ? '' : 'eq-member--off'}`}>
                <div className="eq-member-top">
                  <div className="eq-member-info">
                    <span className="eq-member-name">
                      {p.display_name}
                      {!p.active && <span className="eq-badge eq-badge--off">Pausado</span>}
                      {p.active && p.must_change_password && <span className="eq-badge">Clave sin cambiar</span>}
                    </span>
                    <span className="eq-member-user">
                      @{p.username} · {ROLE_LABELS[p.role]}
                      {p.role === 'rrpp' && ` · ${soldBySeller[p.id] || 0} vendidas`}
                    </span>
                  </div>
                </div>
                <div className="eq-member-actions">
                  <button className="eq-small-btn" disabled={busyId === p.id} onClick={() => setSheet({ mode: 'edit', member: p })}>
                    ✎ Editar
                  </button>
                  <button className="eq-small-btn" disabled={busyId === p.id} onClick={() => setSheet({ mode: 'password', member: p })}>
                    🔑 Clave
                  </button>
                  <button className="eq-small-btn" disabled={busyId === p.id} onClick={() => handleToggle(p)}>
                    {p.active ? '⏸ Pausar' : '▶ Reactivar'}
                  </button>
                  <button
                    className="eq-small-btn eq-small-btn--danger"
                    disabled={busyId === p.id}
                    onClick={() => setSheet({ mode: 'delete', member: p })}
                  >
                    🗑 Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {admins.length > 0 && (
        <p className="pt-note">
          Administradores: {admins.map((a) => `${a.display_name} (@${a.username})${a.id === currentUserId ? ' — vos' : ''}`).join(', ')}
        </p>
      )}

      {sheet && (
        <MemberSheet
          key={`${sheet.mode}-${sheet.member.id}`}
          mode={sheet.mode}
          member={sheet.member}
          soldCount={soldBySeller[sheet.member.id] || 0}
          onClose={() => setSheet(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   AJUSTES — alias y escáner exclusivo
══════════════════════════════════════════════════════════ */
function Ajustes({ config, onConfigChange }) {
  const [alias, setAlias] = useState(config?.payment_alias || '');
  const [scanner, setScanner] = useState(config?.exclusive_scanner || '');
  const [scanners, setScanners] = useState([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    fetchProfiles()
      .then((p) => setScanners(p.filter((u) => u.active && (u.role === 'admin' || u.role === 'puerta'))))
      .catch(console.error);
  }, []);

  const save = async () => {
    setSaving(true);
    setMsg('');
    try {
      const updated = await updateEventSettings({
        payment_alias: alias.trim() || null,
        exclusive_scanner: scanner || null,
      });
      onConfigChange(updated);
      setMsg('✓ Guardado');
    } catch (err) {
      setMsg(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="vender-form">
      <div className="vf-section">
        <label className="vf-label">Alias de la cuenta principal</label>
        <p className="pt-note">
          Se agrega al mensaje de WhatsApp de las entradas pagadas por transferencia, y el RRPP lo puede copiar al vender.
        </p>
        <input
          className="vf-input"
          placeholder="ej: evento.cuenta.mp"
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
          autoCapitalize="none"
        />
      </div>

      <div className="vf-section">
        <label className="vf-label">Quién puede escanear</label>
        <select className="vf-input" value={scanner} onChange={(e) => setScanner(e.target.value)}>
          <option value="">Cualquier admin o usuario de puerta</option>
          {scanners.map((u) => (
            <option key={u.id} value={u.id}>Solo {u.display_name} (@{u.username})</option>
          ))}
        </select>
        <p className="pt-note">Los RRPP nunca pueden escanear.</p>
      </div>

      {msg && <div className={msg.startsWith('✓') ? 'eq-ok' : 'vf-error'}>{msg}</div>}
      <button className="vf-submit" style={{ background: 'var(--color-accent)' }} onClick={save} disabled={saving}>
        {saving ? <span className="vf-spinner" /> : 'Guardar ajustes'}
      </button>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   ROOT — EQUIPO TAB
══════════════════════════════════════════════════════════ */
const SUB_TABS = [
  { id: 'panel', label: 'Panel', icon: '📈' },
  { id: 'equipo', label: 'Equipo', icon: '👥' },
  { id: 'ajustes', label: 'Ajustes', icon: '⚙️' },
];

export default function EquipoTab({ eventName, config, onConfigChange, currentUserId }) {
  const [subTab, setSubTab] = useState('panel');

  return (
    <div className="et-root">
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

      <div className="et-content">
        {subTab === 'panel' && <PanelGeneral eventName={eventName} />}
        {subTab === 'equipo' && <GestionEquipo currentUserId={currentUserId} />}
        {subTab === 'ajustes' && (
          config ? <Ajustes config={config} onConfigChange={onConfigChange} /> : <Loading text="Cargando ajustes…" />
        )}
      </div>
    </div>
  );
}
