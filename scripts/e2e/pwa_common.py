"""Shared helpers for the PWA browser checks (scripts/e2e/pwa_*.py). See scripts/e2e/README.md."""
import json
import os
import sys
from pathlib import Path

BASE = os.environ.get("BASE_URL", "http://localhost:3102").rstrip("/")
# Screenshots go here when set; nothing is written otherwise.
SHOTS = os.environ.get("SHOTS_DIR")

ANDROID_CHROME = (
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/138.0.0.0 Mobile Safari/537.36"
)
IPHONE_SAFARI = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) "
    "Version/26.0 Mobile/15E148 Safari/604.1"
)
ANDROID_FIREFOX = "Mozilla/5.0 (Android 15; Mobile; rv:139.0) Gecko/139.0 Firefox/139.0"
IPHONE_INSTAGRAM = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 "
    "Instagram 380.0.0.24.104 (iPhone15,3; iOS 18_5; en_CA; en; scale=3.00; 1290x2796; 715322045)"
)
PHONE = dict(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
DESKTOP = dict(viewport={"width": 1440, "height": 900})

CARD = "aside[aria-labelledby=install-card-h]"

_results = []


def visible_text(page, selector):
    """What the element says, for comparing with copy: inner_text() returns text as drawn, so CSS uppercase (the card's
    title, its buttons) comes back in capitals. Lowercased, with runs of whitespace (line breaks, the gap an inline
    icon leaves) collapsed to one space."""
    return " ".join(page.locator(selector).inner_text().split()).lower()


def check(name, ok, detail=""):
    _results.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail else ""), flush=True)
    return bool(ok)


def finish():
    failed = [n for n, ok in _results if not ok]
    print(f"\n{len(_results) - len(failed)}/{len(_results)} checks passed")
    sys.exit(1 if failed else 0)


def shot(page, name, **kwargs):
    if SHOTS:
        Path(SHOTS).mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(Path(SHOTS) / f"{name}.png"), **kwargs)


def qa_credentials():
    """A plain member test account: QA_EMAIL and QA_PASSWORD, from the environment or the file in QA_ENV_FILE.
    Never printed. Returns None when neither is set, so signed-in checks can be skipped."""
    email, password = os.environ.get("QA_EMAIL"), os.environ.get("QA_PASSWORD")
    path = os.environ.get("QA_ENV_FILE")
    if (not email or not password) and path:
        values = {}
        for line in Path(path).read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                key, value = line.split("=", 1)
                values[key.strip()] = value.strip().strip('"')
        email, password = values.get("QA_EMAIL"), values.get("QA_PASSWORD")
    return (email, password) if email and password else None


def sign_in(browser, credentials):
    """Signs in once (Stay signed in left ticked, its default) and returns the storage state to reuse."""
    ctx = browser.new_context(**PHONE, user_agent=ANDROID_CHROME)
    page = ctx.new_page()
    page.goto(f"{BASE}/login")
    page.wait_for_load_state("networkidle")
    page.fill('input[name="email"]', credentials[0])
    page.fill('input[name="password"]', credentials[1])
    page.click('button[type="submit"]')
    page.wait_for_url(lambda u: "/login" not in u, timeout=30000)
    page.wait_for_load_state("networkidle")
    state = ctx.storage_state()
    ctx.close()
    return state


def wait_for_styles(page):
    """Waits until the stylesheet has applied (the body takes the ground colour from it), so nothing is measured on an
    unstyled page. A busy machine once served a page whose CSS hadn't applied by networkidle; one reload covers that."""
    styled = "() => getComputedStyle(document.body).backgroundColor !== 'rgba(0, 0, 0, 0)'"
    try:
        page.wait_for_function(styled, timeout=10000)
    except Exception:
        page.reload()
        page.wait_for_load_state("networkidle")
        page.wait_for_function(styled, timeout=10000)


def _luminance(rgb):
    def channel(c):
        c = c / 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (channel(c) for c in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b):
    """WCAG contrast ratio of two [r, g, b] colours."""
    la, lb = sorted((_luminance(a), _luminance(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


# The focused element's ring as drawn: outline style, width, colour, and the colour behind it (the nearest solid
# background under the ring). `ring` names the element that draws it: the focused
# element itself, or for a visually hidden radio, the segment next to it.
FOCUS_RING = """() => {
  const rgb = (c) => (c.match(/[\\d.]+/g) || []).slice(0, 4).map(Number);
  const a = document.activeElement;
  if (!a || a === document.body) return null;
  const ring = a.matches('input.sr-only') ? a.nextElementSibling : a;
  const cs = getComputedStyle(ring);
  // A ring drawn outside the element (outline-offset 0 or more) sits on the parent's background; an inset one on
  // the element's own.
  let behind = null;
  for (let e = parseFloat(cs.outlineOffset) < 0 ? ring : ring.parentElement; e && !behind; e = e.parentElement) {
    const c = rgb(getComputedStyle(e).backgroundColor);
    if (c.length === 3 || (c.length === 4 && c[3] > 0)) behind = c.slice(0, 3);
  }
  return { tag: a.tagName, id: a.id, value: a.value || null, checked: !!a.checked,
           text: (a.innerText || '').trim().slice(0, 80), style: cs.outlineStyle,
           width: parseFloat(cs.outlineWidth), colour: rgb(cs.outlineColor).slice(0, 3),
           behind: behind || rgb(getComputedStyle(document.body).backgroundColor).slice(0, 3) };
}"""


def ring_visible(ring):
    """A ring that shows: drawn, at least 2 px, at least 3:1 against what is behind it (WCAG 1.4.11)."""
    return bool(ring) and ring["style"] != "none" and ring["width"] >= 2 and contrast(ring["colour"], ring["behind"]) >= 3


def wait_for_worker(page):
    page.evaluate(
        """() => Promise.race([
          navigator.serviceWorker.ready.then(() => true),
          new Promise((_, no) => setTimeout(() => no(new Error('service worker never became ready')), 15000)),
        ])"""
    )


def cache_inventory(page):
    """Every Cache Storage entry: cache name, path, content type."""
    return page.evaluate(
        """async () => {
          const out = [];
          for (const name of await caches.keys()) {
            const cache = await caches.open(name);
            for (const req of await cache.keys()) {
              const res = await cache.match(req);
              out.push({ cache: name, path: new URL(req.url).pathname + new URL(req.url).search,
                         type: (res && res.headers.get('content-type')) || '' });
            }
          }
          return out;
        }"""
    )


def stand_in_push(permission="default", answer="granted", existing_key=None, ios_standalone=False,
                  display_standalone=False):
    """An init script that stands in for the browser's push service, which headless Chromium doesn't have.

    - Notification.permission starts at `permission`; requestPermission() answers `answer` and counts the asks.
    - PushManager.subscribe/getSubscription keep one stand-in subscription in localStorage, so it survives page
      loads like a real one. `existing_key` (base64url) starts the page with a subscription made with that key.
    - ios_standalone sets navigator.standalone (the installed iPhone app); display_standalone makes
      matchMedia('(display-mode: standalone)') match (an installed Android app).
    The page's state is in window.__push: { asked, unsubscribed }.
    """
    cfg = json.dumps(dict(permission=permission, answer=answer, existingKey=existing_key,
                          iosStandalone=ios_standalone, displayStandalone=display_standalone))
    return """
(() => {
  const cfg = %s;
  const KEY = 'e2e-push-stand-in';
  const bytes = (b) => { const p = '='.repeat((4 - b.length %% 4) %% 4); const s = atob((b + p).replace(/-/g, '+').replace(/_/g, '/'));
    const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u.buffer; };
  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } };
  const write = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} };
  if (read() === null) write({ key: cfg.existingKey, permission: cfg.permission, unsubscribed: 0, asked: 0 });
  const state = () => read();
  window.__push = { get asked() { return state().asked; }, get unsubscribed() { return state().unsubscribed; } };
  if (window.Notification) {
    Object.defineProperty(Notification, 'permission', { get: () => state().permission, configurable: true });
    Notification.requestPermission = async () => { const s = state(); s.asked += 1; s.permission = cfg.answer; write(s); return cfg.answer; };
  }
  const make = (keyB64) => ({
    endpoint: 'https://fcm.googleapis.com/fcm/send/e2e-stand-in',
    options: { applicationServerKey: bytes(keyB64), userVisibleOnly: true },
    toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'B' + 'a'.repeat(86), auth: 'a'.repeat(22) } }; },
    async unsubscribe() { const s = state(); s.key = null; s.unsubscribed += 1; write(s); return true; },
  });
  if (window.PushManager) {
    PushManager.prototype.getSubscription = async function () { const k = state().key; return k ? make(k) : null; };
    PushManager.prototype.subscribe = async function (o) {
      const k = o.applicationServerKey;
      const buf = k instanceof ArrayBuffer ? k : k.buffer.slice(k.byteOffset, k.byteOffset + k.byteLength);
      const s = state(); s.key = b64(buf); write(s); return make(s.key);
    };
  }
  if (cfg.iosStandalone) Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true, configurable: true });
  if (cfg.displayStandalone) {
    const real = window.matchMedia.bind(window);
    window.matchMedia = (q) => /display-mode:\\s*standalone/.test(q)
      ? { matches: true, media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } }
      : real(q);
  }
})();
""" % cfg


def record_push_routes(page):
    """Answers the push routes with 204 in the browser and records each call (method, path, JSON body), so the
    UI can be driven without push tables in the database or a push service."""
    calls = []

    def answer(route):
        req = route.request
        try:
            body = json.loads(req.post_data or "null")
        except ValueError:
            body = None
        calls.append((req.method, "/" + req.url.split("/", 3)[3], body))
        route.fulfill(status=204, body="")

    page.route("**/api/push/subscribe", answer)
    page.route("**/api/push/test", answer)
    return calls
