/// <reference lib="webworker" />

/**
 * Service worker mínimo: alcanza para que el navegador ofrezca instalar la app.
 * No guarda nada en caché, porque la prueba siempre quiere datos frescos.
 */
self.addEventListener('install', () => {
  (self as unknown as ServiceWorkerGlobalScope).skipWaiting();
});
