"""The installable shell: manifest, icons, service worker, precache, offline page, and what the worker caches.

Run against a production build (the worker registers only there). See scripts/e2e/README.md.
Signed-out checks always run. With QA credentials, signed-in pages are visited too before the cache is checked,
so private pages are proven never to land in Cache Storage.
"""
import json
import struct

from playwright.sync_api import sync_playwright

from pwa_common import (BASE, DESKTOP, PHONE, cache_inventory, check, finish, qa_credentials, shot, sign_in,
                        wait_for_worker)

OFFLINE_FONTS = {
    "/fonts/barlow-latin-400-normal.woff2",
    "/fonts/barlow-latin-600-normal.woff2",
    "/fonts/barlow-condensed-latin-600-normal.woff2",
    "/fonts/barlow-condensed-latin-700-normal.woff2",
}


def png_size(data):
    return struct.unpack(">II", data[16:24])


def html_only_offline(entries):
    """The worker's one rule for pages: nothing with an HTML body is stored except the offline page."""
    html = [e for e in entries if "text/html" in e["type"]]
    return all(e["path"] == "/offline" for e in html), [e["path"] for e in html]


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)

    # Manifest and icons --------------------------------------------------------------------------------------
    ctx = browser.new_context(**DESKTOP)
    page = ctx.new_page()
    res = page.request.get(f"{BASE}/manifest.webmanifest")
    check("manifest is served as JSON", res.status == 200 and "json" in res.headers.get("content-type", ""),
          res.headers.get("content-type", ""))
    m = res.json()
    for key in ("id", "name", "short_name", "start_url", "scope", "display", "theme_color", "background_color",
                "icons"):
        check(f"manifest has {key}", key in m)
    check("manifest opens standalone at / with / as scope",
          m.get("display") == "standalone" and m.get("start_url") == "/" and m.get("scope") == "/")
    check("manifest has any and maskable icons", {"any", "maskable"} <= {i.get("purpose") for i in m["icons"]})
    for icon in m["icons"]:
        r = page.request.get(BASE + icon["src"])
        w, h = png_size(r.body())
        check(f"icon {icon['src']} really is {icon['sizes']}", r.status == 200 and f"{w}x{h}" == icon["sizes"],
              f"{w}x{h}")
    r = page.request.get(f"{BASE}/apple-icon.png")
    check("apple-touch-icon is 180x180", r.status == 200 and png_size(r.body()) == (180, 180))
    r = page.request.get(f"{BASE}/sw.js")
    check("sw.js is never cached by the browser", "no-store" in r.headers.get("cache-control", ""),
          r.headers.get("cache-control", ""))

    # The worker registers and precaches the offline shell ------------------------------------------------------
    page.goto(f"{BASE}/login")
    page.wait_for_load_state("networkidle")
    head = page.evaluate("""() => ({
      manifest: document.querySelector('link[rel=manifest]')?.getAttribute('href'),
      capable: !!document.head.querySelector('meta[name="apple-mobile-web-app-capable"][content=yes]'),
      title: document.querySelector('meta[name="apple-mobile-web-app-title"]')?.content,
    })""")
    check("head links the manifest and has the iPhone home-screen tags",
          head["manifest"] == "/manifest.webmanifest" and head["capable"] and head["title"] == "HOSA", json.dumps(head))
    wait_for_worker(page)
    reg = page.evaluate("async () => { const r = await navigator.serviceWorker.ready; "
                        "return { scope: r.scope, script: r.active && r.active.scriptURL }; }")
    check("service worker is active at scope /", reg["scope"] == f"{BASE}/" and reg["script"] == f"{BASE}/sw.js",
          json.dumps(reg))
    page.wait_for_timeout(500)
    entries = cache_inventory(page)
    shell = {e["path"] for e in entries if e["cache"].endswith("-shell")}
    check("precache holds the offline page, logo, icons and the offline page's fonts",
          {"/offline", "/brand/classic.png", "/icons/icon-192.png", "/icons/badge-96.png"} | OFFLINE_FONTS <= shell,
          ", ".join(sorted(shell)))
    page.reload()
    page.wait_for_load_state("networkidle")
    check("the page is controlled by the worker after a reload",
          page.evaluate("() => !!navigator.serviceWorker.controller"))
    check("navigation preload is on", page.evaluate(
        "async () => (await (await navigator.serviceWorker.ready).navigationPreload?.getState())?.enabled") is True)

    # Offline fallback --------------------------------------------------------------------------------------
    ctx.set_offline(True)
    page.goto(f"{BASE}/calendar?m=2026-10")
    page.wait_for_load_state("load")
    page.evaluate("() => document.fonts.ready")
    check("offline: the offline page answers at the address asked for",
          page.url == f"{BASE}/calendar?m=2026-10" and page.locator("h1").inner_text().strip().lower().startswith("you"),
          page.url)
    check("offline: logo loads from the cache",
          page.evaluate("() => { const i = document.querySelector('header img'); return i.complete && i.naturalWidth > 0; }"))
    loaded = page.evaluate("() => [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family.replace(/\"/g, '') + ' ' + f.weight)")
    check("offline: Barlow and Barlow Condensed load from the cache",
          {"Barlow 400", "Barlow Condensed 600", "Barlow Condensed 700"} <= set(loaded), json.dumps(loaded))
    btn = page.evaluate("() => { const s = getComputedStyle(document.querySelector('a.btn')); "
                        "return { family: s.fontFamily, weight: s.fontWeight, transform: s.textTransform }; }")
    check("offline: Try again is set like the app's buttons (Barlow Condensed 600, caps)",
          btn["family"].startswith('"Barlow Condensed"') and btn["weight"] == "600" and btn["transform"] == "uppercase",
          json.dumps(btn))
    check("offline: the inline script set the theme",
          page.evaluate("() => document.documentElement.dataset.theme") in ("light", "dark"))
    shot(page, "offline-1440")
    page.set_viewport_size(PHONE["viewport"])
    shot(page, "offline-390")
    # Back online, the offline page reloads itself. Waiting for that reload also keeps it from cutting off the next
    # navigation (it once aborted the goto below with net::ERR_ABORTED).
    try:
        with page.expect_navigation(timeout=10000):
            ctx.set_offline(False)
        page.wait_for_load_state("networkidle")
        # Signed out here, so the real /calendar sends the browser on to /login?next=/calendar...
        reloaded = "calendar" in page.url and page.get_by_text("This page needs a connection").count() == 0
    except Exception:
        reloaded = False
    check("back online: the offline page reloads itself into the real page (here, sign-in for /calendar)", reloaded,
          page.url)

    # Signed-out pages never land in the cache -------------------------------------------------------------------
    for path in ("/login", "/signup", "/forgot-password"):
        page.goto(BASE + path)
        page.wait_for_load_state("networkidle")
    ok, html = html_only_offline(cache_inventory(page))
    check("signed out: no page HTML in Cache Storage except /offline", ok, ", ".join(html))
    ctx.close()

    # Signed-in pages never land in the cache either --------------------------------------------------------------
    credentials = qa_credentials()
    if credentials is None:
        print("SKIP signed-in cache check (set QA_EMAIL and QA_PASSWORD, or QA_ENV_FILE)")
    else:
        state = sign_in(browser, credentials)
        ctx = browser.new_context(**PHONE, storage_state=state)
        page = ctx.new_page()
        page.goto(f"{BASE}/")
        page.wait_for_load_state("networkidle")
        wait_for_worker(page)
        for path in ("/", "/notifications", "/settings?tab=app", "/profile", "/calendar", "/events", "/more"):
            page.goto(BASE + path)
            page.wait_for_load_state("networkidle")
        entries = cache_inventory(page)
        ok, html = html_only_offline(entries)
        check("signed in: no page HTML in Cache Storage except /offline", ok, ", ".join(html))
        api = [e["path"] for e in entries if e["path"].startswith("/api/") or "supabase" in e["path"]]
        check("signed in: no API or Supabase response in Cache Storage", not api, ", ".join(api))
        rsc = [e["path"] for e in entries if "_rsc=" in e["path"] or "text/x-component" in e["type"]]
        check("signed in: no page data (RSC payloads) in Cache Storage", not rsc, ", ".join(rsc[:5]))
        ctx.set_offline(True)
        page.goto(f"{BASE}/notifications")
        page.wait_for_load_state("load")
        check("signed in, offline: the offline page, not a stored copy of the member's page",
              page.locator("h1").inner_text().strip().lower().startswith("you") and page.locator("#main a.btn").count() == 1)
        ctx.close()

    browser.close()

finish()
