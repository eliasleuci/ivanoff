import React, { useState } from 'react';
import { changeMyPassword } from '../hooks/useSupabase';

/*
 * Cambio de clave del propio usuario.
 * forced: primer ingreso o clave reseteada por el admin → pantalla completa, sin pedir la actual.
 * Si no, es un modal que pide la clave actual.
 */
export default function ChangePassword({ forced = false, onDone, onClose, onLogout }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    setError('');
    if (!forced && !current) return setError('Ingresá tu clave actual.');
    if (next.length < 6) return setError('La clave nueva debe tener al menos 6 caracteres.');
    if (next !== confirm) return setError('Las claves nuevas no coinciden.');
    setSaving(true);
    try {
      await changeMyPassword(next, forced ? null : current);
      setDone(true);
      if (forced) onDone?.();
    } catch (err) {
      setError(err.message || 'No se pudo cambiar la clave.');
    } finally {
      setSaving(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter') submit();
    if (e.key === 'Escape' && !forced) onClose?.();
  };

  const fields = (
    <>
      {!forced && (
        <input
          type="password"
          className="login-input"
          placeholder="Clave actual"
          value={current}
          onChange={(e) => { setCurrent(e.target.value); setError(''); }}
          onKeyDown={handleKey}
          autoComplete="current-password"
          autoFocus
        />
      )}
      <input
        type="password"
        className="login-input"
        placeholder="Clave nueva (mín. 6)"
        value={next}
        onChange={(e) => { setNext(e.target.value); setError(''); }}
        onKeyDown={handleKey}
        autoComplete="new-password"
        autoFocus={forced}
      />
      <input
        type="password"
        className="login-input"
        placeholder="Repetir clave nueva"
        value={confirm}
        onChange={(e) => { setConfirm(e.target.value); setError(''); }}
        onKeyDown={handleKey}
        autoComplete="new-password"
      />
      {error && <p className="pass-error">{error}</p>}
      <button className="login-btn" onClick={submit} disabled={saving}>
        {saving ? 'Guardando…' : 'Cambiar clave'}
      </button>
    </>
  );

  if (forced) {
    return (
      <div className="login-screen no-print">
        <div className="login-card">
          <div className="login-icon">🔑</div>
          <div className="login-title">Elegí tu clave</div>
          <p className="login-sub">Es tu primer ingreso o te resetearon la clave. Elegí una nueva para continuar.</p>
          {fields}
          <button className="eq-link-btn" onClick={onLogout}>Salir</button>
        </div>
      </div>
    );
  }

  return (
    <div className="pass-overlay" onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="pass-sheet">
        <div className="pass-handle" />
        <div className="pass-icon">🔑</div>
        <div className="pass-title">Cambiar mi clave</div>
        {done ? (
          <>
            <p className="pass-sub">✓ Listo, tu clave fue cambiada.</p>
            <button className="pass-btn" onClick={onClose}>Cerrar</button>
          </>
        ) : (
          fields
        )}
      </div>
    </div>
  );
}
