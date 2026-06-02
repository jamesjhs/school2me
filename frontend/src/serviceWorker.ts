/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

declare let self: ServiceWorkerGlobalScope;

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

registerRoute(
  ({ request, url }) => request.method === 'GET' && url.pathname.startsWith('/api/'),
  new NetworkFirst({
    cacheName: 'school2me-api-v1',
    networkTimeoutSeconds: 8,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 120, maxAgeSeconds: 60 * 60 })
    ]
  })
);

registerRoute(
  ({ request }) => request.destination === 'document' || request.destination === 'script' || request.destination === 'style',
  new StaleWhileRevalidate({
    cacheName: 'school2me-shell-v1',
    plugins: [new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 })]
  })
);

registerRoute(
  ({ request }) => request.destination === 'image' || request.destination === 'font',
  new StaleWhileRevalidate({
    cacheName: 'school2me-assets-v1',
    plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 })]
  })
);
