/*
 * Offline shell for the atlas. All URLs are relative to the service worker's
 * scope, so the same file works at / and under a GitHub Pages base path.
 *
 * Strategy:
 *  - precache the app shell (index + manifest + icons) at install;
 *  - cache-first for hashed build assets and fonts (immutable by name);
 *  - network-first for navigations, falling back to the cached shell, so the
 *    atlas opens in the lane with no signal.
 */
const VERSION = 'shca-v1'
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './favicon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
]

/**
 * The build hashes its JS/CSS names, so the worker cannot hardcode them.
 * Instead it reads the shipped index.html at install time and precaches every
 * same-origin script and stylesheet it references — the whole shell, including
 * the bundled basemap, is offline before the reader leaves the first visit.
 */
async function shellAssets() {
  try {
    const html = await fetch('./index.html').then((r) => (r.ok ? r.text() : ''))
    const urls = new Set()
    const re = /(?:src|href)="([^"]+\.(?:js|css))"/g
    let m
    while ((m = re.exec(html))) {
      const url = new URL(m[1], self.registration.scope)
      if (url.origin === self.location.origin) urls.add(url.href)
    }
    return [...urls]
  } catch {
    return []
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION)
      await cache.addAll(SHELL)
      const assets = await shellAssets()
      await Promise.all(
        assets.map((a) => cache.add(a).catch(() => undefined)),
      )
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

function cacheable(request, response) {
  return (
    response &&
    response.ok &&
    (response.type === 'basic' || response.type === 'cors') &&
    request.method === 'GET'
  )
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (cacheable(request, response)) {
            const copy = response.clone()
            caches.open(VERSION).then((cache) => cache.put('./index.html', copy))
          }
          return response
        })
        .catch(() =>
          caches.match('./index.html').then((hit) => hit ?? Response.error()),
        ),
    )
    return
  }

  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ??
        fetch(request).then((response) => {
          if (cacheable(request, response)) {
            const copy = response.clone()
            caches.open(VERSION).then((cache) => cache.put(request, copy))
          }
          return response
        }),
    ),
  )
})
