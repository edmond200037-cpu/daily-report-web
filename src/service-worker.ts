/// <reference lib="WebWorker" />

import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, matchPrecache, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { NetworkOnly } from 'workbox-strategies';

declare let self: ServiceWorkerGlobalScope;

clientsClaim();

const navigationRequestFirst = new NetworkOnly();

registerRoute(new NavigationRoute(async (options) => {
  try {
    return await navigationRequestFirst.handle(options);
  } catch {
    return (await matchPrecache('index.html')) ?? Response.error();
  }
}));

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// The previous handwritten workers used persistent cache-first shells. Remove
// only those known app-shell caches after this generated worker takes control;
// IndexedDB is a separate browser storage area and is never touched here.
const legacyCacheNames = new Set(['construction-site-pwa-v2', 'construction-site-pwa-v5']);
self.addEventListener('activate', (event) => event.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((key) => legacyCacheNames.has(key)).map((key) => caches.delete(key)))),
));
