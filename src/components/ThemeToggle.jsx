import React from 'react';
import { useTheme } from '../utils/theme';

export default function ThemeToggle({ className = 'logout-btn' }) {
  const { theme, toggleTheme } = useTheme();
  const label = theme === 'light' ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro';

  return (
    <button type="button" className={className} onClick={toggleTheme} title={label} aria-label={label}>
      {theme === 'light' ? '🌙' : '☀️'}
    </button>
  );
}
