// Hand-written service worker (no next-pwa/serwist dependency) so the
// caching rules stay simple and auditable, which matters here: this app
// must NEVER cache video bytes. next-pwa/serwist route-matching config can
// be easy to get subtly wrong (e.g. a broad runtimeCaching regex swallowing
// /api/* by accident); an explicit allow-list here is easier to verify.

// Cache names include the current Next.js build id (served at /BUILD_ID,
// generated fresh by every `next build`), so every deploy gets its own
// cache namespace automatically - the activate handler below then deletes
// every cache that doesn't match the CURRENT build id, so old builds'
// cached JS/HTML never lingers and a redeploy never requires a manual
// "clear site data" to see the new version.
let buildIdPromise = null;
function getBuildId() {
  if (!buildIdPromise) {
    buildIdPromise = fetch("/BUILD_ID", { cache: "no-store" })
      .then((r) => (r.ok ? r.text() : "unknown"))
      .then((t) => t.trim())
      .catch(() => "unknown");
  }
  return buildIdPromise;
}
function shellCacheName() {
  return getBuildId().then((id) => `yt-pro-shell-${id}`);
}
function runtimeCacheName() {
  return getBuildId().then((id) => `yt-pro-runtime-${id}`);
}

// Must match the RUNTIME_CACHE naming in lib/offlineStore.ts, which also
// writes into this cache directly when a video is saved for offline
// playback - both independently derive the same name from /BUILD_ID.

// Only the app shell / static assets are precached - never anything video-
// or API-related.
const SHELL_ASSETS = [
  "/offline",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    shellCacheName()
      .then((name) => caches.open(name))
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([shellCacheName(), runtimeCacheName()])
      .then(([shellName, runtimeName]) =>
        caches.keys().then((keys) =>
          Promise.all(
            keys
              .filter((key) => key !== shellName && key !== runtimeName)
              .map((key) => caches.delete(key))
          )
        )
      )
      .then(() => self.clients.claim())
  );
});

function isNeverCachePath(pathname) {
  return (
    pathname.startsWith("/api/") ||
    pathname.includes("/download") ||
    pathname.includes("/zip")
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only ever handle same-origin GETs; everything else (including all API
  // calls and the download/zip endpoints, which may be cross-origin to a
  // different API host anyway) passes straight through untouched - no
  // interception, no caching, ever.
  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }
  if (isNeverCachePath(url.pathname)) {
    return;
  }

  if (request.mode === "navigate") {
    // Network-first so users always see fresh content when online, but
    // every successful visit is cached (into the current build's runtime
    // cache) so the same page can be reopened from a cold, fully offline
    // launch later. Only then does it fall back to the generic /offline page.
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            runtimeCacheName()
              .then((name) => caches.open(name))
              .then((cache) => cache.put(request, response.clone()));
          }
          return response;
        })
        .catch(() =>
          caches
            .match(request)
            .then((cached) => cached || caches.match("/offline"))
            .then((r) => r || Response.error())
        )
    );
    return;
  }

  // Static shell assets: cache-first, since they're versioned by filename
  // (manifest/icons) or safe to keep fresh via revalidation.
  if (SHELL_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            if (response.ok) {
              shellCacheName()
                .then((name) => caches.open(name))
                .then((cache) => cache.put(request, response.clone()));
            }
            return response;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // Next.js build output under /_next/static/* is content-hashed and
  // therefore immutable - safe to cache-first indefinitely, and required
  // for the app shell's JS/CSS to load on a fully offline cold launch.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            runtimeCacheName()
              .then((name) => caches.open(name))
              .then((cache) => cache.put(request, response.clone()));
          }
          return response;
        });
      })
    );
  }
});
