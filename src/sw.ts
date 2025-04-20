/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching'
import { clientsClaim }      from 'workbox-core'

// ①  Workbox rewrites __WB_MANIFEST at build time
precacheAndRoute(self.__WB_MANIFEST)

// ②  Take control as soon as we’re ready
self.skipWaiting()
clientsClaim()

// ③  Let the page know when the precache finished
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      // waitUntil resolves when precache() finishes
      await self.skipWaiting()
      const allClients = await self.clients.matchAll({ includeUncontrolled: true })
      allClients.forEach((c) => c.postMessage({ type: 'CACHE_COMPLETE' }))
    })()
  )
})