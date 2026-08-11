/* sw-offline.js — precaches the offline_<W>X<H>.png fallback images
   so they are available from cache even when there is no network
   connection at all (usinter.js alone cannot fetch them offline). */

const CACHE_NAME = "aw-offline-images-v1";

const APP_SHELL = [
  "anime.html",
  "index.html",
  "search.html",
  "watch.html",
  "save.html",
  "settings.js",
  "share.js",
  "notification.html",
  "404.html",
  "adblocker.js",
  "net.js",
  "theme.css",
  "tmdb-config.js",
  "ui.css",
  "ui.js",
  "USDSS.js",
  "usinter.js",
  "logo.PNG"
];

const OFFLINE_IMAGES = [
  "images/offline_360X640.png",
  "images/offline_390X844.png",
  "images/offline_430X932.png",
  "images/offline_768X1024.png",
  "images/offline_810X1080.png",
  "images/offline_1080X810.png",
  "images/offline_1640X2360.png",
  "images/offline_1366X768.png",
  "images/offline_1536X864.png",
  "images/offline_1920X1080.png",
  "images/offline_2560X1440.png",
  "images/offline_3440X1440.png",
  "images/offline_3840X2160.png",
  "images/offline_7680X4320.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_IMAGES.concat(APP_SHELL)))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Serve page navigations from cache when offline, instead of the
// browser's default offline error page (same idea as YouTube's offline shell).
self.addEventListener("fetch", (event) => {
  const url = event.request.url;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match("anime.html"))
    );
    return;
  }

  const isOfflineImage = OFFLINE_IMAGES.some((path) => url.endsWith(path));
  const isAppShell = APP_SHELL.some((path) => url.endsWith(path));

  if (isOfflineImage || isAppShell) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return cached || fetch(event.request);
      })
    );
  }
});