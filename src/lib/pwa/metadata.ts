// iOS home-screen settings. Layouts export these as route-segment metadata, so the root metadata (owned by the
// root layout) is left alone. The manifest and apple-icon.png cover the rest.
export const APPLE_WEB_APP = {
  capable: true,
  title: "HOSA",
  statusBarStyle: "default" as const,
};
