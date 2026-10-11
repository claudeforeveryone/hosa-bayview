import { PUSH_DEVICE_EVENT } from "./browser";

// When to read this device's notification facts again after the first read. The copy for a blocked device tells the
// member to allow notifications in the phone's Settings "then come back", and an installed app comes back to the same
// page without reloading, so the facts must be read again then, or the page keeps saying "blocked".
// - visibilitychange to visible: back from the phone's Settings, another app, or another tab.
// - pageshow with persisted: restored from the back/forward cache, where no effect runs again (a first load's
//   pageshow is skipped: the first read already covers it).
// - the notifications PermissionStatus change event, where the browser has one: a change made while the page is open.
// - PUSH_DEVICE_EVENT: this device was turned on or off in another view, or the layer dropped a dead subscription.
// Returns a function that stops all of it, including a permission query still in flight.

type Permissions = {
  query(descriptor: { name: "notifications" }): Promise<EventTarget>;
};

export type WatchEnv = {
  win: EventTarget;
  doc: EventTarget & { visibilityState: DocumentVisibilityState };
  permissions?: Permissions;
};

const browserEnv = (): WatchEnv => ({
  win: window,
  doc: document,
  permissions: navigator.permissions as Permissions | undefined,
});

export function watchPushFacts(
  read: () => void,
  env: WatchEnv = browserEnv(),
): () => void {
  const { win, doc, permissions } = env;
  let watching = true;
  let status: EventTarget | null = null;

  const onVisible = () => {
    if (doc.visibilityState === "visible") read();
  };
  const onPageShow = (e: Event) => {
    if ((e as PageTransitionEvent).persisted) read();
  };

  doc.addEventListener("visibilitychange", onVisible);
  win.addEventListener("pageshow", onPageShow);
  win.addEventListener(PUSH_DEVICE_EVENT, read);
  try {
    permissions
      ?.query({ name: "notifications" })
      .then((s) => {
        if (!watching) return;
        status = s;
        s.addEventListener("change", read);
      })
      .catch(() => {});
  } catch {
    // Some browsers throw at once for a permission name they don't know. The other triggers still work.
  }

  return () => {
    watching = false;
    doc.removeEventListener("visibilitychange", onVisible);
    win.removeEventListener("pageshow", onPageShow);
    win.removeEventListener(PUSH_DEVICE_EVENT, read);
    status?.removeEventListener("change", read);
  };
}
