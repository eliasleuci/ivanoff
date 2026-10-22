import React, { useState, useEffect } from 'react';
import { fetchEventConfig } from '../hooks/useSupabase';
import { VenderEntrada, ListadoEntradas, EscanearEntrada, QRModal } from './EntradasTab';
import ChangePassword from './ChangePassword';

const ROLE_SUBTITLE = { rrpp: 'RRPP', puerta: 'Puerta' };

/* Header simple para los usuarios del equipo (sin bar ni reportes) */
function RoleShell({ profile, eventName, onLogout, children }) {
  const [showChangePass, setShowChangePass] = useState(false);

  return (
    <div className="app-root no-print">
      <header className="app-header">
        <div className="header-inner">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🎟️</span>
            <div>
              <h1 className="text-xl font-display font-bold text-zinc-100">
                {eventName || 'Entradas'}
              </h1>
              <p className="text-xs text-zinc-500 font-mono">
                {ROLE_SUBTITLE[profile.role]} • {profile.display_name}
              </p>
            </div>
          </div>
          <div className="header-actions">
            <button className="logout-btn" onClick={() => setShowChangePass(true)} title="Cambiar mi clave">
              🔑
            </button>
            <button className="logout-btn" onClick={onLogout} title="Cerrar sesión">
              Salir
            </button>
          </div>
        </div>
      </header>
      <main className="app-content">{children}</main>
      {showChangePass && <ChangePassword onClose={() => setShowChangePass(false)} />}
    </div>
  );
}

// Se vuelve a leer al volver a la app, para tomar cambios del admin (alias, escáner, nombre del evento)
function useEventConfig() {
  const [config, setConfig] = useState(null);
  useEffect(() => {
    fetchEventConfig().then(setConfig).catch(console.error);
    // Si falla al volver (sin señal, o el admin lo pausó) se mantiene la config que ya tenía
    const onVisible = () =>
      document.visibilityState === 'visible' && fetchEventConfig().then(setConfig).catch(() => {});
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);
  return config;
}

const RRPP_TABS = [
  { id: 'vender', label: 'Vender', icon: '🎟️' },
  { id: 'mis', label: 'Mis entradas', icon: '📋' },
];

export function RrppApp({ profile, onLogout }) {
  const config = useEventConfig();
  const [subTab, setSubTab] = useState('vender');
  const [qrTicket, setQrTicket] = useState(null);
  const [listRefresh, setListRefresh] = useState(0);

  const handleGenerated = (ticket) => {
    setQrTicket(ticket);
    setListRefresh((n) => n + 1);
  };

  return (
    <RoleShell profile={profile} eventName={config?.event_name} onLogout={onLogout}>
      <div className="et-root">
        <div className="et-subnav">
          {RRPP_TABS.map((t) => (
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
          {subTab === 'vender' && (
            <VenderEntrada config={config} onGenerated={handleGenerated} />
          )}
          {subTab === 'mis' && (
            <ListadoEntradas refresh={listRefresh} onResend={setQrTicket} isAdmin={false} />
          )}
        </div>
      </div>

      {qrTicket && (
        <QRModal
          ticket={qrTicket}
          eventName={config?.event_name}
          paymentAlias={config?.payment_alias}
          onClose={() => setQrTicket(null)}
        />
      )}
    </RoleShell>
  );
}

export function PuertaApp({ profile, onLogout }) {
  const config = useEventConfig();
  const blocked = config?.exclusive_scanner && config.exclusive_scanner !== profile.id;

  return (
    <RoleShell profile={profile} eventName={config?.event_name} onLogout={onLogout}>
      {blocked ? (
        <div className="ls-empty">
          <span style={{ fontSize: 40 }}>🔒</span>
          <p>El escaneo está asignado a otro usuario. Consultá con el administrador.</p>
        </div>
      ) : (
        <EscanearEntrada />
      )}
    </RoleShell>
  );
}
