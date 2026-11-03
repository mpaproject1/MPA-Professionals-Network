/* MPA PWA foundation. Never cache API responses, authenticated pages, or user-specific data. */
const CACHE_PREFIX = "mpa-pwa-";
const CACHE_VERSION = "v5";
const STATIC_CACHE = `${CACHE_PREFIX}static-${CACHE_VERSION}`;
const OFFLINE_PUBLIC_ROUTES = ["/", "/mobile", "/about", "/jobs", "/serve-community"];
const PRECACHE_URLS = [
  ...OFFLINE_PUBLIC_ROUTES,

  "/manifest.webmanifest",
  "/brand/mpa-pwa-icon.svg",
  "/brand/apple-touch-icon.png",
  "/brand/mpa-logo-light.svg",
  "/brand/mpa-logo-dark.svg",
  "/brand/mpa-favicon-light.svg",
  "/brand/mpa-favicon-dark.svg"
];

self.addEventListener("install", (event) => {
  // A failed optional shell URL must not prevent the worker from installing.
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(async (cache) => {
        await Promise.all(PRECACHE_URLS.map(async (url) => {
          try {
            const response = await fetch(url, { cache: "reload" });
            if (response.ok && response.type === "basic") await cache.put(url, response);
          } catch { /* offline-first install remains best-effort */ }
        }));
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== STATIC_CACHE)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function safeNotificationPath(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/notifications";
  const path = value.split(/[?#]/)[0];
  let decoded;
  try { decoded = decodeURIComponent(path); } catch { return "/notifications"; }
  if (decoded.includes("\\") || decoded.startsWith("//") || decoded.split("/").includes("..") || /[\x00-\x1f\x7f]/.test(decoded)) return "/notifications";
  const allowed = ["/notifications", "/mobile", "/serve-community", "/mentorship", "/learning", "/jobs", "/recruitment", "/members", "/track", "/membership", "/verification", "/organizations", "/services", "/dashboard", "/profile", "/account", "/workspaces", "/network-plus", "/community-impact/recognition"];
  if (!allowed.some((route) => decoded === route || decoded.startsWith(route + "/"))) return "/notifications";
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (value[index] === "\\" || code < 32 || code === 127) return "/notifications";
  }
  return value;
}

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  const priority = ["low", "normal", "high", "urgent"].includes(data.priority) ? data.priority : "normal";
  const title = typeof data.title === "string" && data.title.trim() ? data.title.trim().slice(0, 100) : "MPA · New update";
  const body = typeof data.body === "string" && data.body.trim() ? data.body.trim().slice(0, 180) : "You have an MPA update. Open the app to review it.";
  const url = safeNotificationPath(data.url);
  const options = {
    body,
    icon: "/brand/mpa-pwa-icon.svg",
    badge: "/brand/mpa-favicon-light.svg",
    tag: typeof data.notificationId === "string" ? "mpa-" + data.notificationId : "mpa-update",
    renotify: false,
    requireInteraction: priority === "urgent",
    data: { url },
    ...(priority === "urgent" || priority === "high" ? { vibrate: [120, 60, 120] } : {})
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = safeNotificationPath(event.notification.data && event.notification.data.url);
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if ("focus" in client) {
        await client.focus();
        if ("navigate" in client && new URL(client.url).origin === self.location.origin) await client.navigate(target);
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "MPA_SKIP_WAITING") self.skipWaiting();
});

function offlineNavigationHtml() {
  return "<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><meta name=\"theme-color\" content=\"#0A3258\"><title>MPA offline workspace</title><body style=\"font:16px system-ui;max-width:44rem;margin:8vh auto;padding:1.25rem;color:#0A3258;background:#f7f9fb\"><p style=\"font-size:12px;font-weight:700;letter-spacing:.15em\">MPA · OFFLINE</p><h1 style=\"font-size:2rem\">Your front-end is ready offline.</h1><p>You can still open public pages saved on this device. Sign-in, account records, notifications, forms and changes need an internet connection.</p><nav aria-label=\"Offline navigation\" style=\"display:grid;gap:.75rem;margin:2rem 0\"><a style=\"padding:1rem;border:1px solid #cbd5e1;border-radius:12px;background:white;color:#0A3258\" href=\"/mobile\">MPA mobile home</a><a style=\"padding:1rem;border:1px solid #cbd5e1;border-radius:12px;background:white;color:#0A3258\" href=\"/about\">About MPA</a><a style=\"padding:1rem;border:1px solid #cbd5e1;border-radius:12px;background:white;color:#0A3258\" href=\"/jobs\">Jobs and opportunities</a><a style=\"padding:1rem;border:1px solid #cbd5e1;border-radius:12px;background:white;color:#0A3258\" href=\"/serve-community\">Serve the community</a></nav><p>Pages you have not opened while online may not yet be available offline.</p><button onclick=\"location.reload()\">Try connection again</button></body></html>";
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Private and authenticated routes always require the network. Never cache their HTML.
  const privatePrefixes = [
    "/api", "/auth", "/account", "/admin", "/dashboard", "/notifications",
    "/membership", "/verification", "/organizations", "/applications",
    "/members", "/mentorship", "/learning", "/network-plus", "/track",
    "/profile", "/saved", "/services", "/workspaces", "/recruitment"
  ];
  if (privatePrefixes.some((prefix) => url.pathname === prefix || url.pathname.startsWith(prefix + "/"))) return;

  if (request.mode === "navigate") {
    const isPublicOfflineRoute = OFFLINE_PUBLIC_ROUTES.includes(url.pathname) && !url.search;
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        const contentType = response.headers.get("content-type") || "";
        const cacheControl = response.headers.get("cache-control") || "";
        if (isPublicOfflineRoute && response.ok && contentType.includes("text/html") && !/private|no-store/i.test(cacheControl)) {
          const cache = await caches.open(STATIC_CACHE);
          await cache.put(url.pathname, response.clone());
        }
        return response;
      } catch {
        if (isPublicOfflineRoute) {
          const cached = await caches.match(url.pathname);
          if (cached) return cached;
        }
        return new Response(offlineNavigationHtml(), {
          headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
          status: 503
        });
      }
    })());
    return;
  }

  // Cache-first only for public brand assets and Next's fingerprinted static output.
  const isStaticAsset = url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/brand/");
  if (!isStaticAsset) return;
  event.respondWith(caches.open(STATIC_CACHE).then(async (cache) => {
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && response.type === "basic") await cache.put(request, response.clone());
    return response;
  }));
});