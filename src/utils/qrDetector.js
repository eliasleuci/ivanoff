import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

/*
 * html5-qrcode usa window.BarcodeDetector como lector principal cuando existe (Android).
 * En iPhone y Windows no existe y cae en su lector JS (zxing-js), que no logra leer
 * un 3-5% de los QR. Ahí cargamos un BarcodeDetector basado en zxing-cpp (WebAssembly),
 * servido desde la propia app para que no dependa de un CDN.
 * Si la carga falla, todo sigue funcionando como antes con zxing-js.
 */
let loading = null;

async function hasNativeQrDetector() {
  if (!('BarcodeDetector' in window)) return false;
  try {
    return (await window.BarcodeDetector.getSupportedFormats()).includes('qr_code');
  } catch {
    return false;
  }
}

export function ensureBarcodeDetector() {
  loading ??= (async () => {
    if (await hasNativeQrDetector()) return;
    const { BarcodeDetector, prepareZXingModule } = await import('barcode-detector/ponyfill');
    await prepareZXingModule({
      overrides: { locateFile: (path, prefix) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) },
      fireImmediately: true,
    });
    window.BarcodeDetector = BarcodeDetector;
  })().catch((err) => {
    console.warn('No se pudo cargar el lector de QR mejorado, se usa el de respaldo:', err);
    loading = null;
  });
  return loading;
}
