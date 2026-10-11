"use client";

import { useEffect } from "react";
import { platformOf } from "@/lib/pwa/install-logic";
import { trackPwa } from "@/lib/pwa/track";
import { InstallCard } from "./install-card";
import { isStandalone } from "./use-install-env";

const LAUNCHED_KEY = "hosa-app-launched";

// Mounted once per layout. Registers the service worker (production builds only, so dev reloads never meet a
// stale worker), lets a push refresh the bell at once, counts the first launch from the home screen, and shows
// the install card where asked. Renders nothing else.
export function PwaLayer({
  card = false,
  signedIn = false,
}: {
  card?: boolean;
  signedIn?: boolean;
}) {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch(() => {
        // Offline support and push simply stay off. The rest of the app works without them.
      });
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === "hosa:push") {
        window.dispatchEvent(new Event("hosa:notifications"));
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () =>
      navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);

  // The installed app has its own storage, so this flag is set once per install (Android and iPhone alike).
  useEffect(() => {
    if (!signedIn || !isStandalone()) return;
    try {
      if (localStorage.getItem(LAUNCHED_KEY)) return;
      localStorage.setItem(LAUNCHED_KEY, String(Date.now()));
    } catch {
      return;
    }
    const platform = platformOf(navigator.userAgent, navigator.maxTouchPoints);
    trackPwa({ name: "app_installed", code: platform });
  }, [signedIn]);

  return (
    <>
      {/* Next writes only the generic mobile-web-app-capable tag; older iPhones read this Apple one. React
          hoists it into <head>. The manifest's display: standalone covers current iOS. */}
      <meta name="apple-mobile-web-app-capable" content="yes" />
      {card ? <InstallCard /> : null}
    </>
  );
}
