import type { MetadataRoute } from "next";

// What a phone uses when HOSA is added to its home screen. Field navy (the site's --field token) is the icon
// ground, the splash and the title bar, so opening the app is one continuous navy screen. Icons come from
// scripts/make-pwa-icons.py. The pages' own theme-color (root layout) takes over once a page has loaded.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "HOSA Bayview",
    short_name: "HOSA",
    description:
      "Training for HOSA Bayview members: events, practice tests, flashcards, and leaderboards.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#1e3d62",
    theme_color: "#1e3d62",
    lang: "en",
    dir: "ltr",
    categories: ["education"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    // Long-press the home screen icon (Android) for these.
    shortcuts: [
      { name: "Notifications", url: "/notifications" },
      { name: "Calendar", url: "/calendar" },
      { name: "Events", url: "/events" },
    ],
  };
}
