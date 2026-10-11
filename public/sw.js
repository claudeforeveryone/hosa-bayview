// HOSA Bayview service worker. Three jobs: an offline page, a small cache of build files, and push notifications.
//
// It never stores member data. Pages always come from the network (network first); only when the network is gone
// does the precached /offline page answer, at the address the member asked for. API routes, Supabase calls and
// anything cross-origin are left alone. Bump VERSION when the precache list or the offline page changes.
const VERSION = "hosa-v5";
const SHELL = `${VERSION}-shell`;
const STATIC = "hosa-static";
const STATIC_LIMIT = 160;
const OFFLINE_URL = "/offline";
const PRECACHE = [
  OFFLINE_URL,
  "/brand/classic.png",
  "/icons/icon-192.png",
  "/icons/badge-96.png",
  // The offline page's type (src/lib/pwa/offline-html.ts).
  "/fonts/barlow-latin-400-normal.woff2",
  "/fonts/barlow-latin-600-normal.woff2",
  "/fonts/barlow-condensed-latin-600-normal.woff2",
  "/fonts/barlow-condensed-latin-700-normal.woff2",
];
// Content-hashed build files never change, so the cached copy is always right.
const IMMUTABLE = "/_next/static/";
// Icons, brand art and fonts keep their names across deploys: served from cache, refreshed in the background.
const REFRESHED = ["/icons/", "/brand/", "/fonts/"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      // cache: "reload" skips the browser's HTTP cache, so the shell is the deployed one.
      await cache.addAll(
        PRECACHE.map((url) => new Request(url, { cache: "reload" })),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith("hosa-") && key !== SHELL && key !== STATIC) {
          await caches.delete(key);
        }
      }
      // Lets the browser start a page's network request while the worker boots.
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstPage(event));
    return;
  }
  if (url.pathname.startsWith(IMMUTABLE)) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (REFRESHED.some((prefix) => url.pathname.startsWith(prefix))) {
    event.respondWith(staleWhileRevalidate(event, request));
  }
});

async function networkFirstPage(event) {
  try {
    const preloaded = await event.preloadResponse;
    if (preloaded) return preloaded;
    return await fetch(event.request);
  } catch {
    const shell = await caches.open(SHELL);
    const offline = await shell.match(OFFLINE_URL);
    return (
      offline ||
      new Response("You're offline. Reconnect, then try again.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      })
    );
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok && response.type === "basic") {
    await cache.put(request, response.clone());
    await trim(cache);
  }
  return response;
}

async function staleWhileRevalidate(event, request) {
  const cache = await caches.open(STATIC);
  const hit = (await cache.match(request)) || (await caches.match(request));
  const refresh = fetch(request)
    .then(async (response) => {
      if (response.ok && response.type === "basic") {
        await cache.put(request, response.clone());
        await trim(cache);
      }
      return response;
    })
    .catch(() => null);
  if (hit) {
    event.waitUntil(refresh);
    return hit;
  }
  return (await refresh) || Response.error();
}

// Oldest first: Cache Storage keeps insertion order.
async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - STATIC_LIMIT; i += 1) {
    await cache.delete(keys[i]);
  }
}

// Push text comes from this site's server. Only short plain strings and same-site paths are used.
function text(value, max) {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function samePath(value) {
  return typeof value === "string" &&
    /^\/(?![/\\])/.test(value) &&
    !value.includes("\\")
    ? value
    : "/";
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = text(data.title, 200) || "HOSA Bayview";
  event.waitUntil(
    (async () => {
      // Browsers require every push to show a notification, so one always shows, even for a bad payload.
      await self.registration.showNotification(title, {
        body: text(data.body, 500),
        tag: text(data.tag, 80) || undefined,
        icon: "/icons/icon-192.png",
        badge: "/icons/badge-96.png",
        lang: "en",
        // The device's "Notification sound" setting, sent with each push.
        silent: data.silent === true,
        data: { url: samePath(data.url) },
      });
      // An open page refreshes its bell at once instead of on its next poll.
      const windows = await self.clients.matchAll({ type: "window" });
      for (const client of windows) client.postMessage({ type: "hosa:push" });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(
    samePath(event.notification.data && event.notification.data.url),
    self.location.origin,
  ).href;
  event.waitUntil(openOrFocus(target));
});

// Reuse an open HOSA window (taking it to the notification's page) before opening a new one. A tap allows one
// window interaction, focus or open, so a window is navigated first and focused only once it has moved: focusing
// one that then can't be navigated (opened before this worker took over) would spend the tap, and the
// openWindow fallback would be refused. Frames inside other pages are skipped.
async function openOrFocus(target) {
  const windows = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  const ours = windows.filter(
    (client) =>
      client.frameType !== "nested" &&
      new URL(client.url).origin === self.location.origin,
  );
  const exact = ours.find((client) => client.url === target);
  if (exact) return exact.focus();
  for (const client of ours) {
    let moved = null;
    try {
      moved = await client.navigate(target);
    } catch {
      // Not navigable from here (uncontrolled, or a browser without navigate()): try the next, then open one.
    }
    if (moved) return moved.focus();
  }
  return self.clients.openWindow(target);
}

// The browser replaced this device's push subscription (expired or rotated keys). Subscribe again with the same
// key and tell the server, so pushes keep arriving without a trip to Settings. No sound setting is sent (a worker
// can't read the page's storage): the server copies it from the row this browser saved before, found by its
// device cookie, and drops that old row.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const key =
        event.oldSubscription &&
        event.oldSubscription.options &&
        event.oldSubscription.options.applicationServerKey;
      const fresh =
        event.newSubscription ||
        (key
          ? await self.registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: key,
            })
          : null);
      if (!fresh) return;
      const json = fresh.toJSON();
      await fetch("/api/push/subscribe", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      }).catch(() => {});
    })(),
  );
});
