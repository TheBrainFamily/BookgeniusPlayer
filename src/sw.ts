/// <reference lib="webworker" />
import { precacheAndRoute } from "workbox-precaching";
import { clientsClaim } from "workbox-core";

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> };

// ①  Workbox rewrites __WB_MANIFEST at build time
// Provide a fallback for __WB_MANIFEST in development
precacheAndRoute(self.__WB_MANIFEST || []);

// ②  Take control as soon as we're ready
self.skipWaiting();
clientsClaim();

// ③  Let the page know when the precache finished
// Listen for both install and activate events to ensure the message is sent
self.addEventListener("install", (event) => {
  console.log("[Service Worker] Install event");
  event.waitUntil(
    (async () => {
      // waitUntil resolves when precache() finishes
      await self.skipWaiting();
      console.log("[Service Worker] skipWaiting complete");
    })(),
  );
});

self.addEventListener("activate", (event) => {
  console.log("[Service Worker] Activate event");
  event.waitUntil(
    (async () => {
      // Send message to all clients
      const allClients = await self.clients.matchAll({ includeUncontrolled: true });
      console.log(`[Service Worker] Found ${allClients.length} clients to notify`);
      allClients.forEach((c) => c.postMessage({ type: "CACHE_COMPLETE" }));
    })(),
  );
});
