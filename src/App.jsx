import React, { useState, useEffect, useRef } from 'react';
import VenderTab from './components/VenderTab';
import ProductosTab from './components/ProductosTab';
import ReportesTab from './components/ReportesTab';
import EntradasTab from './components/EntradasTab';
import { fetchEventConfig, updateEventName } from './hooks/useSupabase';
import './App.css';

const ENTRADAS_PASSWORD = 'ivan2026';



const TABS = [
  { id: 'vender', label: 'Vender', icon: '💳' },
  { id: 'productos', label: 'Productos', icon: '📦' },
  { id: 'entradas', label: 'Entradas', icon: '🏟️' },
  { id: 'reportes', label: 'Reportes', icon: '📊' },
];


export default function App() {
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem('pos_active_tab') || 'vender';
  });

  useEffect(() => {
    localStorage.setItem('pos_active_tab', activeTab);
  }, [activeTab]);

  // Contraseña para Entradas
  const [entradasUnlocked, setEntradasUnlocked] = useState(
    () => sessionStorage.getItem('entradas_ok') === '1'
  );
  const [showPassModal, setShowPassModal] = useState(false);
  const [passInput, setPassInput] = useState('');
  const [passError, setPassError] = useState(false);
  const passInputRef = useRef(null);

  const handleTabClick = (tabId) => {
    if (tabId === 'entradas' && !entradasUnlocked) {
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
      setActiveTab('entradas');
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

  const [eventName, setEventName] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const nameRef = useRef(null);

  useEffect(() => {
    fetchEventConfig()
      .then((config) => {
        setEventName(config.event_name || '');
      })
      .catch(console.error);
  }, []);

  const startEditName = () => {
    setNameInput(eventName);
    setEditingName(true);
    setTimeout(() => nameRef.current?.focus(), 50);
  };

  const saveName = async () => {
    try {
      await updateEventName(nameInput);
      setEventName(nameInput);
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
      <header className="app-header">
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
        </div>
      </header>

      {/* ─── Content ─── */}
      <main className="app-content">
        {activeTab === 'vender' && <VenderTab eventName={eventName} />}
        {activeTab === 'productos' && <ProductosTab />}
        {activeTab === 'entradas' && <EntradasTab eventName={eventName} />}
        {activeTab === 'reportes' && <ReportesTab eventName={eventName} />}
      </main>

      {/* ─── Password Modal ─── */}
      {showPassModal && (
        <div className="pass-overlay" onClick={(e) => e.target === e.currentTarget && setShowPassModal(false)}>
          <div className="pass-sheet">
            <div className="pass-handle" />
            <div className="pass-icon">🔐</div>
            <div className="pass-title">Sección de Entradas</div>
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

