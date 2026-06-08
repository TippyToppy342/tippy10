// ═══════════════════════════════════════════
//  sw.js — Service worker for PWA installability
// ═══════════════════════════════════════════
// Android Chrome needs the fetch handler to actively call event.respondWith()
// (not just exist as an empty no-op) before it'll consider the site installable.
// This SW does a transparent network passthrough — no offline caching, just
// satisfies the install criteria.

const SW_VERSION = 'tippy10-v2';

self.addEventListener('install', (event) => {
  // Activate immediately on first install so old versions don't linger
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  // Take control of open clients without waiting for a reload
  event.waitUntil(self.clients.claim());
});

// Active fetch handler — calls respondWith for every request, just passing
// through to the network. This is what Chrome's installability check looks for.
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => {
      // Network failure — return a minimal response so the SW doesn't crash
      return new Response('', { status: 408, statusText: 'Network error' });
    })
  );
});
