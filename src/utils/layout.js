import { useEffect, useRef } from 'react';

/*
 * Publica el alto real del header en la variable CSS --header-h,
 * para que las barras "sticky" (buscador del listado) queden justo debajo.
 * El alto cambia según el celular: notch, header en 1 o 2 filas, etc.
 */
export function useHeaderHeightVar() {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const update = () => document.documentElement.style.setProperty('--header-h', `${el.offsetHeight}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return ref;
}
