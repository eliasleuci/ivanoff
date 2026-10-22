import React, { useState, useEffect, useRef } from 'react';
import VenderTab from './components/VenderTab';
import ProductosTab from './components/ProductosTab';
import ReportesTab from './components/ReportesTab';
import EntradasTab from './components/EntradasTab';
import EquipoTab from './components/EquipoTab';
import { RrppApp, PuertaApp } from './components/RoleViews';
import ChangePassword from './components/ChangePassword';
import ThemeToggle from './components/ThemeToggle';
import { useHeaderHeightVar } from './utils/layout';
import { supabase } from './supabaseClient';
import {
  fetchEventConfig,
  updateEventName,
  signIn,
  signOut,
  fetchMyProfile,
} from './hooks/useSupabase';
import QRCode from 'qrcode';
import './App.css';

function PublicTicketViewer({ ticketCode }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (canvasRef.current && ticketCode) {
      QRCode.toCanvas(canvasRef.current, ticketCode, {
        width: 280,
        margin: 2,
        color: { dark: '#14110f', light: '#ffffff' },
        errorCorrectionLevel: 'M',
      });
    }
  }, [ticketCode]);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#14110f',
      padding: '20px',
      textAlign: 'center',
      fontFamily: '"Space Grotesk", sans-serif'
    }}>
      <div style={{
        background: '#ffffff',
        padding: '24px',
        borderRadius: '24px',
        boxShadow: '0 8px 32px rgba(45,212,168,0.2)'
      }}>
        <h1 style={{ color: '#14110f', margin: '0 0 16px', fontSize: '24px', fontWeight: 'bold' }}>🎟️ Tu Entrada</h1>
        <canvas ref={canvasRef} style={{ maxWidth: '100%', height: 'auto' }} />
        <p style={{ color: '#52525b', margin: '16px 0 0', fontSize: '15px', fontWeight: '600' }}>
          Presentá este QR en la puerta.
        </p>
      </div>
      <button
        style={{
          marginTop: '32px',
          padding: '14px 28px',
          background: 'rgba(255,255,255,0.05)',
          border: '1.5px solid #3f3f46',
          color: '#e4e4e7',
          borderRadius: '16px',
          fontWeight: '700',
          cursor: 'pointer',
          fontSize: '15px'
        }}
        onClick={() => {
          if(!canvasRef.current) return;
          const link = document.createElement('a');
          link.download = `entrada-${ticketCode.slice(4,12)}.png`;
          link.href = canvasRef.current.toDataURL();
          link.click();
        }}
      >
        ⬇ Descargar imagen
      </button>
    </div>
  );
}

// Clave extra para Entradas/RRPP dentro de la cuenta admin (por si el bar usa la misma sesión)
const ENTRADAS_PASSWORD = 'adm2026';
const LOCKED_TABS = ['entradas', 'equipo'];

const TABS = [
  { id: 'vender', label: 'Vender', icon: '💳' },
  { id: 'productos', label: 'Productos', icon: '📦' },
  { id: 'entradas', label: 'Entradas', icon: '🏟️' },
  { id: 'equipo', label: 'RRPP', icon: '👥' },
  { id: 'reportes', label: 'Reportes', icon: '📊' },
];


export default function App() {
  const publicTicket = new URLSearchParams(window.location.search).get('ticket');
  if (publicTicket) {
    return <PublicTicketViewer ticketCode={publicTicket} />;
  }
  return <AuthGate />;
}

/* ─── Sesión de Supabase Auth + perfil con rol ─── */
function AuthGate() {
  const [session, setSession] = useState(undefined); // undefined = todavía cargando
  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState('');
  const userId = session?.user?.id;

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    setProfile(null);
    setProfileError('');
    if (!userId) return;

    let cancelled = false;
    const check = (isRecheck) =>
      fetchMyProfile(userId)
        .then((p) => {
          if (cancelled) return;
          if (!p) setProfileError('Tu usuario no existe más. Hablá con el administrador.');
          else if (!p.active) setProfileError('Tu usuario está pausado. Hablá con el administrador.');
          else setProfile(p);
        })
        // Un corte de red al volver a la app no debe sacar al usuario
        .catch((err) => !cancelled && !isRecheck && setProfileError(err.message));

    check(false);

    // Al volver a la app se revisa si el admin lo pausó o eliminó
    const onVisible = () => document.visibilityState === 'visible' && check(true);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userId]);

  const logout = async () => {
    sessionStorage.removeItem('entradas_ok');
    try {
      await signOut();
    } catch (err) {
      console.error(err);
    }
  };

  if (session === undefined) return <FullScreenMessage icon="⏳" text="Cargando…" />;
  if (!session) return <LoginScreen />;
  if (profileError) {
    return <FullScreenMessage icon="🚫" text={profileError} onLogout={logout} />;
  }
  if (!profile) return <FullScreenMessage icon="⏳" text="Cargando…" />;

  if (profile.must_change_password) {
    return (
      <ChangePassword
        forced
        onDone={() => setProfile((p) => ({ ...p, must_change_password: false }))}
        onLogout={logout}
      />
    );
  }

  if (profile.role === 'rrpp') return <RrppApp profile={profile} onLogout={logout} />;
  if (profile.role === 'puerta') return <PuertaApp profile={profile} onLogout={logout} />;
  return <AdminApp profile={profile} onLogout={logout} />;
}

function FullScreenMessage({ icon, text, onLogout }) {
  return (
    <div className="login-screen no-print">
      <div className="login-card">
        <div className="login-icon">{icon}</div>
        <p className="login-sub">{text}</p>
        {onLogout && (
          <button className="login-btn" onClick={onLogout}>
            Volver al inicio
          </button>
        )}
      </div>
    </div>
  );
}

function LoginScreen() {
  const [userInput, setUserInput] = useState('');
  const [passInput, setPassInput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submitLogin = async () => {
    if (!userInput.trim() || !passInput) return;
    setLoading(true);
    setError('');
    try {
      await signIn(userInput, passInput);
    } catch (err) {
      if (/banned/i.test(err.message)) setError('Tu usuario está desactivado.');
      else if (/not confirmed/i.test(err.message)) setError('El usuario no está confirmado en Supabase.');
      else if (/invalid login/i.test(err.message)) setError('Usuario o contraseña incorrectos.');
      else setError(`No se pudo ingresar: ${err.message}`);
      setPassInput('');
    } finally {
      setLoading(false);
    }
  };

  const handleLoginKey = (e) => {
    if (e.key === 'Enter') submitLogin();
  };

  return (
    <div className="login-screen no-print">
      <ThemeToggle className="logout-btn theme-corner" />
      <div className="login-card">
        <div className="login-icon">🔒</div>
        <div className="login-title">Iniciar sesión</div>
        <p className="login-sub">Ingresá tus credenciales para continuar</p>
        <input
          type="text"
          className="login-input"
          placeholder="Usuario"
          value={userInput}
          onChange={(e) => { setUserInput(e.target.value); setError(''); }}
          onKeyDown={handleLoginKey}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
        />
        <input
          type="password"
          className="login-input"
          placeholder="Contraseña"
          value={passInput}
          onChange={(e) => { setPassInput(e.target.value); setError(''); }}
          onKeyDown={handleLoginKey}
          autoComplete="current-password"
        />
        {error && <p className="pass-error">{error}</p>}
        <button className="login-btn" onClick={submitLogin} disabled={loading}>
          {loading ? 'Ingresando…' : 'Ingresar'}
        </button>
      </div>
    </div>
  );
}

function AdminApp({ profile, onLogout }) {
  const headerRef = useHeaderHeightVar();
  // Contraseña para Entradas / RRPP
  const [entradasUnlocked, setEntradasUnlocked] = useState(
    () => sessionStorage.getItem('entradas_ok') === '1'
  );

  // Si se recarga parado en una pestaña bloqueada, volver a Vender
  const [activeTab, setActiveTab] = useState(() => {
    const saved = localStorage.getItem('pos_active_tab') || 'vender';
    return LOCKED_TABS.includes(saved) && !entradasUnlocked ? 'vender' : saved;
  });

  useEffect(() => {
    localStorage.setItem('pos_active_tab', activeTab);
  }, [activeTab]);

  const [showChangePass, setShowChangePass] = useState(false);
  const [showPassModal, setShowPassModal] = useState(false);
  const [pendingTab, setPendingTab] = useState(null);
  const [passInput, setPassInput] = useState('');
  const [passError, setPassError] = useState(false);
  const passInputRef = useRef(null);

  const handleTabClick = (tabId) => {
    if (LOCKED_TABS.includes(tabId) && !entradasUnlocked) {
      setPendingTab(tabId);
      setShowPassModal(true);
      setPassInput('');
      setPassError(false);
      setTimeout(() => passInputRef.current?.focus(), 200);
    } else {
      setActiveTab(tabId);
    }
  };

  const submitPassword = () => {
    if (passInput === ENTRADAS_PASSWORD) {
      sessionStorage.setItem('entradas_ok', '1');
      setEntradasUnlocked(true);
      setShowPassModal(false);
      setActiveTab(pendingTab || 'entradas');
    } else {
      setPassError(true);
      setPassInput('');
      setTimeout(() => passInputRef.current?.focus(), 50);
    }
  };

  const handlePassKey = (e) => {
    if (e.key === 'Enter') submitPassword();
    if (e.key === 'Escape') setShowPassModal(false);
  };

  const [config, setConfig] = useState(null);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const nameRef = useRef(null);
  const eventName = config?.event_name || '';

  useEffect(() => {
    fetchEventConfig().then(setConfig).catch(console.error);
  }, []);

  const startEditName = () => {
    setNameInput(eventName);
    setEditingName(true);
    setTimeout(() => nameRef.current?.focus(), 50);
  };

  const saveName = async () => {
    try {
      await updateEventName(nameInput);
      setConfig((c) => ({ ...c, event_name: nameInput }));
    } catch (err) {
      console.error(err);
    }
    setEditingName(false);
  };

  const handleNameKeyDown = (e) => {
    if (e.key === 'Enter') saveName();
    if (e.key === 'Escape') setEditingName(false);
  };

  return (
    <div className="app-root no-print">
      {/* ─── Header ─── */}
      <header className="app-header" ref={headerRef}>
        <div className="header-inner">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🍹</span>
            <div>
              {editingName ? (
                <div className="flex items-center gap-2">
                  <input
                    ref={nameRef}
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    onKeyDown={handleNameKeyDown}
                    onBlur={saveName}
                    className="bg-transparent border-b border-accent text-xl font-display font-bold text-zinc-100 outline-none py-0.5 px-1 placeholder-zinc-600"
                    placeholder="Nombre del evento"
                  />
                </div>
              ) : (
                <h1
                  onClick={startEditName}
                  className="text-xl font-display font-bold text-zinc-100 cursor-pointer hover:text-accent transition-colors flex items-center gap-2"
                  title="Click para editar nombre del evento"
                >
                  {eventName || 'Punto de Venta'}
                  <span className="text-xs text-zinc-600">✎</span>
                </h1>
              )}
              <p className="text-xs text-zinc-500 font-mono">
                POS v1.1 • {new Date().toLocaleDateString('es-AR')}
              </p>
            </div>
          </div>

          {/* Tab bar */}
          <nav className="tab-bar">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabClick(tab.id)}
                className={`tab-btn ${activeTab === tab.id ? 'tab-active' : ''}`}
              >
                <span className="tab-icon">{tab.icon}</span>
                <span className="tab-label">{tab.label}</span>
              </button>
            ))}

          </nav>

          <div className="header-actions">
            <ThemeToggle />
            <button className="logout-btn" onClick={() => setShowChangePass(true)} title="Cambiar mi clave">
              🔑
            </button>
            <button className="logout-btn" onClick={onLogout} title="Cerrar sesión">
              Salir
            </button>
          </div>
        </div>
      </header>

      {showChangePass && <ChangePassword onClose={() => setShowChangePass(false)} />}

      {/* ─── Content ─── */}
      <main className="app-content">
        {activeTab === 'vender' && <VenderTab eventName={eventName} />}
        {activeTab === 'productos' && <ProductosTab />}
        {activeTab === 'entradas' && <EntradasTab eventName={eventName} config={config} />}
        {activeTab === 'equipo' && (
          <EquipoTab
            eventName={eventName}
            config={config}
            onConfigChange={setConfig}
            currentUserId={profile.id}
          />
        )}
        {activeTab === 'reportes' && <ReportesTab eventName={eventName} />}
      </main>

      {/* ─── Password Modal ─── */}
      {showPassModal && (
        <div className="pass-overlay" onClick={(e) => e.target === e.currentTarget && setShowPassModal(false)}>
          <div className="pass-sheet">
            <div className="pass-handle" />
            <div className="pass-icon">🔐</div>
            <div className="pass-title">{pendingTab === 'equipo' ? 'Sección RRPP' : 'Sección de Entradas'}</div>
            <p className="pass-sub">Ingresá la clave para acceder</p>
            <input
              ref={passInputRef}
              type="password"
              className="pass-input"
              placeholder="••••••••"
              value={passInput}
              onChange={(e) => { setPassInput(e.target.value); setPassError(false); }}
              onKeyDown={handlePassKey}
              autoComplete="current-password"
            />
            {passError && (
              <p className="pass-error">Clave incorrecta. Intentá de nuevo.</p>
            )}
            <button className="pass-btn" onClick={submitPassword}>
              Ingresar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
