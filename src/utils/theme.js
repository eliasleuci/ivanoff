import { useState } from 'react';

/*
 * Tema claro / oscuro. La elección se guarda en este dispositivo (localStorage)
 * y se aplica con data-theme en <html>. index.html la aplica antes de pintar
 * para que no haya un destello del tema equivocado al abrir la app.
 */
const KEY = 'theme';
const BAR_COLORS = { dark: '#14110f', light: '#f5f4f1' };

export function getTheme() {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR_COLORS[theme]);
}

export function useTheme() {
  const [theme, setTheme] = useState(getTheme);

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // modo privado: el cambio vale mientras la página esté abierta
    }
    applyTheme(next);
    setTheme(next);
  };

  return { theme, toggleTheme };
}
