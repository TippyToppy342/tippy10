// ═══════════════════════════════════════════
//  sw.js — Minimal service worker for PWA installability
// ═══════════════════════════════════════════
// Android Chrome only offers the "Install app" prompt when a service worker is
// registered AND has at least one fetch handler. This worker doesn't do offline
// caching (Firebase Realtime DB needs the network anyway), but its existence
// makes the site installable. iOS Safari ignores service workers for PWA install,
// but reads the manifest + apple-touch-icon meta tags — handled separately.

self.addEventListener('install', (event) => {
  // Activate immediately on first install
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Take control of open clients without waiting for a reload
  event.waitUntil(self.clients.claim());
});

// A fetch handler is required for Chrome to recognise the SW as installable,
// but we just pass through — no caching.
self.addEventListener('fetch', (event) => {
  // network-only; the browser handles everything as normal
});
