"""Signed-in PWA checks: the install card, the notifications ask, Settings > Phone app, /notifications and short
sessions. Needs a production build and QA credentials (see scripts/e2e/README.md).

Headless Chromium has no push service, so the push service is a stand-in (pwa_common.stand_in_push) and the
two push routes are answered in the browser (pwa_common.record_push_routes), except where a check says it
calls the real route. Nothing here writes to the database.
"""
import json
import sys

from playwright.sync_api import sync_playwright

from pwa_common import (ANDROID_CHROME, ANDROID_FIREFOX, BASE, CARD, DESKTOP, IPHONE_INSTAGRAM, IPHONE_SAFARI, PHONE,
                        check, finish, qa_credentials, record_push_routes, shot, sign_in, stand_in_push, visible_text,
                        wait_for_worker)

INSTALL_PROMPT = """() => {
  const e = new Event('beforeinstallprompt', { cancelable: true });
  e.prompt = async () => {};
  e.userChoice = Promise.resolve({ outcome: 'dismissed' });
  window.dispatchEvent(e);
}"""

credentials = qa_credentials()
if credentials is None:
    print("These checks need a member test account: set QA_EMAIL and QA_PASSWORD, or QA_ENV_FILE.")
    sys.exit(2)


def card_text(page):
    return visible_text(page, CARD)


def open_page(ctx, path):
    page = ctx.new_page()
    calls = record_push_routes(page)
    page.goto(BASE + path)
    page.wait_for_load_state("networkidle")
    return page, calls


def new_phone(browser, state, ua, push=None, scheme="light", cookies=()):
    ctx = browser.new_context(**PHONE, user_agent=ua, storage_state=state, color_scheme=scheme)
    if push is not None:
        ctx.add_init_script(push)
    if cookies:
        ctx.add_cookies([{"name": n, "value": v, "url": BASE} for n, v in cookies])
    return ctx


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    state = sign_in(browser, credentials)

    # iPhone Safari, not installed: the one-line Add to Home Screen card ----------------------------------------
    for scheme in ("light", "dark"):
        ctx = new_phone(browser, state, IPHONE_SAFARI, stand_in_push(), scheme)
        page, _ = open_page(ctx, "/")
        page.locator(CARD).wait_for(state="visible", timeout=10000)
        page.wait_for_timeout(300)
        if scheme == "light":
            text = card_text(page)
            check("iPhone Safari: Share, then Add to Home Screen", "share, then add to home screen" in text, text)
            check("iPhone Safari: one way to dismiss (Not now), no extra Close button",
                  page.locator(CARD).get_by_role("button", name="Not now").count() == 1
                  and page.locator(CARD).get_by_role("button", name="Close").count() == 0)
            box = page.locator(CARD).bounding_box()
            bar = page.locator('nav[aria-label="Shortcuts"]').bounding_box()
            check("iPhone Safari: card sits on the bottom bar", abs(box["y"] + box["height"] - bar["y"]) <= 1,
                  f"{box['height']:.0f}px tall")
        shot(page, f"card-ios-390{'-dark' if scheme == 'dark' else ''}")
        ctx.close()

    # /notifications on iPhone Safari: the line says Home Screen first, and it is the only ask there.
    ctx = new_phone(browser, state, IPHONE_SAFARI, stand_in_push())
    page, _ = open_page(ctx, "/notifications")
    page.wait_for_timeout(4200)
    check("iPhone Safari /notifications: points to the Home Screen first",
          page.get_by_text("once HOSA is on your Home Screen").is_visible())
    check("iPhone Safari /notifications: no install card on top of the line (one ask)", page.locator(CARD).count() == 0)
    ctx.close()

    # Keyboard focus never lands under the card: Tab through /events with the card up (iPhone Safari) ---------------
    ctx = new_phone(browser, state, IPHONE_SAFARI, stand_in_push())
    page, _ = open_page(ctx, "/events")
    page.locator(CARD).wait_for(state="visible", timeout=10000)
    page.wait_for_timeout(400)
    card_top = page.locator(CARD).bounding_box()["y"]
    hidden, reached = [], 0
    for _ in range(60):
        page.keyboard.press("Tab")
        f = page.evaluate("""() => { const e = document.activeElement; if (!e || e === document.body) return null;
          const r = e.getBoundingClientRect(); const card = document.querySelector('aside[aria-labelledby=install-card-h]');
          const bar = document.querySelector('nav[aria-label=Shortcuts]');
          return { name: (e.innerText || e.getAttribute('aria-label') || e.tagName).trim().slice(0, 40), top: r.top,
                   bottom: r.bottom, inFixed: !!(card && card.contains(e)) || !!(bar && bar.contains(e)) }; }""")
        if not f or f["inFixed"]:
            continue
        reached += 1
        if f["bottom"] > card_top + 1 or f["top"] < 0:
            hidden.append(f"{f['name']} @{f['top']:.0f}-{f['bottom']:.0f}")
    check("Tab on /events with the card up: every focused page element is scrolled clear of the card",
          reached >= 10 and not hidden, f"{reached} reached; under the card: {hidden[:4]}")
    shot(page, "events-focus-390")
    ctx.close()

    # Firefox on Android: the menu card, with the dots glyph next to its comma ------------------------------------
    ctx = new_phone(browser, state, ANDROID_FIREFOX, stand_in_push())
    page, _ = open_page(ctx, "/")
    page.locator(CARD).wait_for(state="visible", timeout=10000)
    page.wait_for_timeout(300)
    gap = page.evaluate("""() => { const p = [...document.querySelectorAll('aside[aria-labelledby=install-card-h] p')]
        .find((x) => x.textContent.includes('browser menu')); const svg = p.querySelector('svg');
      const comma = [...svg.parentElement.childNodes].find((n) => n.nodeType === 3 && n.textContent.includes(','));
      const range = document.createRange(); const at = comma.textContent.indexOf(',');
      range.setStart(comma, at); range.setEnd(comma, at + 1);
      const s = svg.getBoundingClientRect(); return range.getBoundingClientRect().left - (s.left + s.width / 2); }""")
    check("Firefox menu card: the comma sits right after the dots (no stray gap)", gap <= 5, f"{gap:.1f}px from the dots' centre")
    shot(page, "card-android-firefox-390")
    ctx.close()

    # In-app browsers: the card says how to get out ----------------------------------------------------------------
    ctx = new_phone(browser, state, IPHONE_INSTAGRAM, stand_in_push())
    page, _ = open_page(ctx, "/")
    page.locator(CARD).wait_for(state="visible", timeout=10000)
    page.wait_for_timeout(300)
    text = card_text(page)
    check("Instagram on iPhone: the card says where Open in browser is",
          "open in your browser" in text and "at the top right, then open in browser" in text, text)
    shot(page, "card-ios-instagram-390")
    ctx.close()

    # Android Chrome tab: Install first, then the notifications ask --------------------------------------------
    ctx = new_phone(browser, state, ANDROID_CHROME, stand_in_push())
    page, calls = open_page(ctx, "/")
    page.evaluate(INSTALL_PROMPT)
    page.locator(CARD).wait_for(state="visible", timeout=10000)
    page.wait_for_timeout(300)
    check("Android: Install card once the browser offers to install",
          page.locator(CARD).get_by_role("button", name="Install").count() == 1
          and page.locator(CARD).get_by_role("button", name="Close").count() == 0)
    shot(page, "card-android-390")
    page.locator(CARD).get_by_role("button", name="Not now").click()
    check("Android: Not now hides the install card and is remembered",
          page.locator(CARD).count() == 0
          and page.evaluate("() => localStorage.getItem('hosa-install-dismissed-at')") is not None)
    page.reload()
    page.wait_for_load_state("networkidle")
    page.locator(CARD).wait_for(state="visible", timeout=10000)
    check("Android tab, install turned down: the card asks to turn on notifications",
          "turn on notifications" in card_text(page)
          and page.locator(CARD).get_by_role("button", name="Turn on").count() == 1)
    check("Android: the browser's permission question waits for the tap", page.evaluate("() => window.__push.asked") == 0)
    page.locator(CARD).get_by_role("button", name="Not now").click()
    check("Android: the notifications card's Not now has its own key",
          page.evaluate("() => localStorage.getItem('hosa-push-card-dismissed-at')") is not None)
    page.reload()
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(4200)
    check("Android: both turned down, no card after a reload", page.locator(CARD).count() == 0)
    check("Android: nothing was subscribed or saved", not [c for c in calls if c[0] == "POST"], json.dumps(calls))
    page.goto(f"{BASE}/notifications")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(1000)
    check("Android: the card's Not now also quiets the line on /notifications",
          page.get_by_role("link", name="Turn them on in Settings").count() == 0)
    ctx.close()

    # /notifications on Android with push off: one line pointing to Settings, the only ask there, with its own Not now.
    ctx = new_phone(browser, state, ANDROID_CHROME, stand_in_push())
    page, _ = open_page(ctx, "/notifications")
    page.wait_for_timeout(4200)
    hint = page.get_by_role("link", name="Turn them on in Settings")
    check("/notifications: one line links to Settings > Phone app while push is off",
          hint.count() == 1 and hint.get_attribute("href") == "/settings?tab=app")
    check("/notifications: no notifications card on top of the line (one ask)", page.locator(CARD).count() == 0)
    shot(page, "notifications-hint-390")
    page.get_by_role("button", name="Not now").click()
    check("/notifications: the line's Not now hides it and is remembered",
          hint.count() == 0
          and page.evaluate("() => localStorage.getItem('hosa-push-card-dismissed-at')") is not None)
    page.reload()
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(1000)
    check("/notifications: still hidden after a reload", hint.count() == 0)
    page.goto(f"{BASE}/")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(4200)
    check("/notifications: its Not now also quiets the notifications card elsewhere", page.locator(CARD).count() == 0)
    ctx.close()

    # The installed app's status bar takes the page's own ground, not the phone's light/dark default ---------------
    def theme_colour(page):
        return page.evaluate("""() => ({ ground: getComputedStyle(document.documentElement).getPropertyValue('--ground').trim(),
          active: [...document.querySelectorAll('meta[name="theme-color"]')]
            .filter((m) => !m.media || matchMedia(m.media).matches).map((m) => m.content)[0] })""")

    for os_scheme, look, label in (("light", {"theme": "dark"}, "phone light, app dark"),
                                   ("light", {"palette": "maroon"}, "phone light, Maroon"),
                                   ("dark", {"theme": "light"}, "phone dark, app light"),
                                   ("light", {"palette": "forest", "theme": "dark"}, "phone light, Forest dark")):
        ctx = new_phone(browser, state, ANDROID_CHROME, stand_in_push(display_standalone=True), os_scheme)
        # Once, like a member's saved choice: later changes in the page must stick across loads.
        ctx.add_init_script("(() => { if (localStorage.getItem('e2e-look')) return; const v = %s; "
                            "for (const k in v) localStorage.setItem(k, v[k]); localStorage.setItem('e2e-look', '1'); })()"
                            % json.dumps(look))
        page, _ = open_page(ctx, "/calendar")
        tc = theme_colour(page)
        check(f"status bar ({label}): theme-color is the page's ground", tc["active"] == tc["ground"], json.dumps(tc))
        if label == "phone light, app dark":
            page.get_by_role("button", name="Switch to light mode").first.click()
            page.wait_for_timeout(300)
            tc = theme_colour(page)
            check("status bar: follows the header's theme button", tc["active"] == tc["ground"] == "#e8f2fa", json.dumps(tc))
            page.locator('nav[aria-label="Shortcuts"] a[href="/"]').first.click()
            page.wait_for_url(f"{BASE}/")
            page.wait_for_load_state("networkidle")
            tc = theme_colour(page)
            check("status bar: still right after moving to another page in the app", tc["active"] == tc["ground"],
                  json.dumps(tc))
            page.goto(f"{BASE}/settings?tab=appearance")
            page.wait_for_load_state("networkidle")
            page.locator('input[name="look-palette"][value="graphite"]').check(force=True)
            page.wait_for_timeout(300)
            tc = theme_colour(page)
            check("status bar: follows a colour theme picked in Settings", tc["active"] == tc["ground"] == "#f1f1ef",
                  json.dumps(tc))
        ctx.close()

    # Settings tab row on small phones: five tabs, each at least 44 px wide, no sideways scroll -----------------------
    for width in (360, 375, 390):
        ctx = browser.new_context(**{**PHONE, "viewport": {"width": width, "height": 780}}, user_agent=ANDROID_CHROME,
                                  storage_state=state)
        page, _ = open_page(ctx, "/settings?tab=app")
        row = page.evaluate("""() => { const ul = document.querySelector('nav[aria-label="Settings sections"] ul');
          return { tabs: [...ul.querySelectorAll('a')].map((a) => ({ text: a.innerText.trim(),
                     w: Math.round(a.getBoundingClientRect().width), h: Math.round(a.getBoundingClientRect().height) })),
                   overflow: ul.scrollWidth - ul.clientWidth }; }""")
        check(f"Settings tabs at {width}: all five fit, each at least 44x44, Phone app shown as Phone",
              len(row["tabs"]) == 5 and row["overflow"] <= 0 and all(t["w"] >= 44 and t["h"] >= 44 for t in row["tabs"])
              and row["tabs"][2]["text"].split()[0] == "PHONE", json.dumps(row))
        if width == 360:
            shot(page, "settings-tabs-360", clip={"x": 0, "y": 0, "width": 360, "height": 420})
        ctx.close()

    # The installed iPhone app: the notifications ask, Turn on, Send a test, Done -------------------------------
    for scheme in ("light", "dark"):
        ctx = new_phone(browser, state, IPHONE_SAFARI, stand_in_push(ios_standalone=True), scheme)
        page, calls = open_page(ctx, "/")
        page.locator(CARD).wait_for(state="visible", timeout=10000)
        page.wait_for_timeout(300)
        shot(page, f"card-notifications-ios-390{'-dark' if scheme == 'dark' else ''}")
        if scheme == "dark":
            ctx.close()
            continue
        text = card_text(page)
        check("installed iPhone app: the card asks to turn on notifications (not to install)",
              "turn on notifications" in text and "add to home screen" not in text, text)
        check("installed iPhone app: no permission question before the tap", page.evaluate("() => window.__push.asked") == 0)
        page.locator(CARD).get_by_role("button", name="Turn on").click()
        page.locator(CARD).get_by_text("Notifications on").wait_for(timeout=15000)
        saved = [c for c in calls if c[0] == "POST" and c[1] == "/api/push/subscribe"]
        check("Turn on: asks once, subscribes, saves the device with its sound setting",
              page.evaluate("() => window.__push.asked") == 1 and saved and saved[-1][2].get("sound") is True,
              json.dumps(saved[-1][2] if saved else None)[:120])
        text = card_text(page)
        check("Turn on: the card says so, once (title On, then the next step)",
              text.count("notifications on") == 1 and "send yourself a test" in text and " on. " not in text, text)
        shot(page, "card-notifications-on-390")
        page.locator(CARD).get_by_role("button", name="Send a test").click()
        page.locator(CARD).get_by_text("Sent.").wait_for(timeout=10000)
        check("Send a test from the card posts to /api/push/test", any(c[1] == "/api/push/test" for c in calls))
        page.locator(CARD).get_by_role("button", name="Done").click()
        check("Done closes the card", page.locator(CARD).count() == 0)
        page.reload()
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(4200)
        check("once on, the card doesn't come back", page.locator(CARD).count() == 0)
        ctx.close()

    # The installed app, and the member says no in the browser's question.
    ctx = new_phone(browser, state, IPHONE_SAFARI, stand_in_push(ios_standalone=True, answer="denied"))
    page, calls = open_page(ctx, "/")
    page.locator(CARD).wait_for(state="visible", timeout=10000)
    page.locator(CARD).get_by_role("button", name="Turn on").click()
    page.wait_for_timeout(1500)
    check("refused in the browser's question: the card goes and nothing is saved",
          page.locator(CARD).count() == 0 and not [c for c in calls if c[0] == "POST"])
    ctx.close()

    # The installed Android app asks too.
    ctx = new_phone(browser, state, ANDROID_CHROME, stand_in_push(display_standalone=True))
    page, _ = open_page(ctx, "/events")
    page.locator(CARD).wait_for(state="visible", timeout=10000)
    check("installed Android app: the card asks to turn on notifications", "turn on notifications" in card_text(page))
    ctx.close()

    # Settings > Phone app: the OFF | ON segments -------------------------------------------------------------
    ctx = new_phone(browser, state, ANDROID_CHROME, stand_in_push(permission="granted"))
    page, calls = open_page(ctx, "/settings?tab=app")
    wait_for_worker(page)
    page.wait_for_timeout(600)
    group = page.get_by_role("group", name="Notifications on this device")
    check("Settings: notifications on/off is the OFF | ON segments, no one-off switch",
          group.count() == 1 and page.get_by_role("switch").count() == 0)
    check("Settings: starts Off", group.get_by_role("radio", name="Off").is_checked())
    group.get_by_role("radio", name="Off").scroll_into_view_if_needed()
    shot(page, "settings-app-android-390-off")
    group.locator("label", has_text="On").click()
    page.wait_for_function("() => document.querySelector('input[name=push-device][value=on]')?.checked", timeout=15000)
    check("Settings: picking On subscribes and saves the device", any(c[0] == "POST" for c in calls))
    check("Settings: the hint says sound follows the Sound tab",
          page.get_by_role("link", name="Sound tab").count() == 1)
    page.get_by_role("button", name="Send a test").click()
    page.wait_for_function("() => document.getElementById('push-note')?.textContent.includes('Sent')", timeout=10000)
    check("Settings: Send a test posts to /api/push/test", any(c[1] == "/api/push/test" for c in calls))
    group.get_by_role("radio", name="On").scroll_into_view_if_needed()
    shot(page, "settings-app-android-390-on")

    # The Notification sound switch on the Sound tab still reaches the device's row.
    page.goto(f"{BASE}/settings?tab=sound")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(500)
    calls.clear()
    page.locator('input[name="look-notifysound"][value="off"]').check(force=True)
    page.wait_for_timeout(1200)
    sent = [c[2].get("sound") for c in calls if c[0] == "POST"]
    check("Sound tab: Notification sound off re-saves the device silent", sent and sent[-1] is False, json.dumps(sent))
    page.locator('input[name="look-notifysound"][value="on"]').check(force=True)
    page.wait_for_timeout(1200)

    page.goto(f"{BASE}/settings?tab=app")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(600)
    group = page.get_by_role("group", name="Notifications on this device")
    check("Settings: still On after a reload (same stand-in subscription)",
          group.get_by_role("radio", name="On").is_checked())
    calls.clear()
    group.locator("label", has_text="Off").click()
    page.wait_for_function("() => document.querySelector('input[name=push-device][value=off]')?.checked", timeout=15000)
    check("Settings: picking Off deletes the server row", any(c[0] == "DELETE" for c in calls))

    # Short session: same browser, now signed in without Stay signed in.
    group.locator("label", has_text="On").click()
    page.wait_for_function("() => document.querySelector('input[name=push-device][value=on]')?.checked", timeout=15000)
    ctx.add_cookies([{"name": "hosa-short-session", "value": "1", "url": BASE}])
    calls.clear()
    page.reload()
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(1500)
    check("short session: Settings explains Stay signed in instead of offering the control",
          page.get_by_text("Notifications need Stay signed in").is_visible()
          and page.get_by_role("group", name="Notifications on this device").count() == 0)
    check("short session: every signed-in page drops the device it had (DELETE + unsubscribe)",
          any(c[0] == "DELETE" for c in calls) and page.evaluate("() => window.__push.unsubscribed") >= 1,
          json.dumps([c[0] for c in calls]))
    shot(page, "settings-app-short-session-390")
    page.unroute("**/api/push/subscribe")
    real = page.evaluate("""async () => {
      const r = await fetch('/api/push/subscribe', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ endpoint: 'https://fcm.googleapis.com/fcm/send/e2e-stand-in',
                               keys: { p256dh: 'B' + 'a'.repeat(86), auth: 'a'.repeat(22) }, sound: true }) });
      return { status: r.status, body: await r.json().catch(() => null) };
    }""")
    check("short session: the real subscribe route refuses with 409 and says why",
          real["status"] == 409 and "Stay signed in" in (real["body"] or {}).get("error", ""), json.dumps(real))
    page.goto(f"{BASE}/notifications")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(800)
    check("short session: /notifications doesn't point to a switch that can't work",
          page.get_by_role("link", name="Turn them on in Settings").count() == 0)
    ctx.close()

    # Desktop: Settings at 1440 with notifications on.
    ctx = browser.new_context(**DESKTOP, storage_state=state)
    ctx.add_init_script(stand_in_push(permission="granted"))
    page, calls = open_page(ctx, "/settings?tab=app")
    wait_for_worker(page)
    page.wait_for_timeout(600)
    page.get_by_role("group", name="Notifications on this device").locator("label", has_text="On").click()
    page.wait_for_function("() => document.querySelector('input[name=push-device][value=on]')?.checked", timeout=15000)
    check("desktop: On works the same", any(c[0] == "POST" for c in calls))
    shot(page, "settings-app-1440-on")
    ctx.close()

    browser.close()

finish()
