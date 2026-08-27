import React, { useState, useEffect, useRef } from 'react';
import VenderTab from './components/VenderTab';
import ProductosTab from './components/ProductosTab';
import ReportesTab from './components/ReportesTab';
import { fetchEventConfig, updateEventName } from './hooks/useSupabase';
import './App.css';

const TABS = [
  { id: 'vender', label: 'Vender', icon: '💳' },
  { id: 'productos', label: 'Productos', icon: '📦' },
  { id: 'reportes', label: 'Reportes', icon: '📊' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem('pos_active_tab') || 'vender';
  });

  useEffect(() => {
    localStorage.setItem('pos_active_tab', activeTab);
  }, [activeTab]);
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
                onClick={() => setActiveTab(tab.id)}
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
        {activeTab === 'reportes' && <ReportesTab eventName={eventName} />}
      </main>
    </div>
  );
}
