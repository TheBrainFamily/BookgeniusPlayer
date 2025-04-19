/// <reference lib="webworker" />
import { precacheAndRoute } from "workbox-precaching";
import { clientsClaim } from "workbox-core";
import { registerRoute } from "workbox-routing";
import { CacheFirst } from "workbox-strategies";
import { RangeRequestsPlugin } from "workbox-range-requests";

// tell the new SW to activate right away
self.skipWaiting();
clientsClaim();

// ①  Precache everything listed by vite-plugin-pwa (`__WB_MANIFEST`)
precacheAndRoute(self.__WB_MANIFEST);
// ②  For any *other* video / image request, stream first → cache after
registerRoute(
  ({ request }) => ["video", "image"].includes(request.destination),
  new CacheFirst({
    cacheName: "book-assets",
    plugins: [new RangeRequestsPlugin()], // enables partial mp4 requests
  }),
);
