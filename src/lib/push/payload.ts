// What a push carries, and how the device's notification settings change it. Pure: no I/O.

export type NotificationFields = {
  notification_id: string;
  kind: string;
  title: string;
  body: string;
  link: string;
};

export type PushPayload = {
  title: string;
  body: string;
  // Where a tap goes. Always a path on this site.
  url: string;
  // The notification's id: a repeat of the same push replaces the first instead of stacking.
  tag: string;
  kind: string;
  // The "Notification sound" setting (Settings > Sound): off means the push shows without a chime or buzz.
  silent: boolean;
};

// Only same-site paths. Anything else would let a push open an outside page.
export function safeLink(link: string): string {
  return /^\/(?![/\\])/.test(link) && !link.includes("\\") ? link : "/";
}

export function buildPayload(
  row: NotificationFields,
  sound: boolean,
): PushPayload {
  return {
    title: row.title.slice(0, 200),
    body: row.body.slice(0, 500),
    url: safeLink(row.link),
    tag: row.notification_id,
    kind: row.kind,
    silent: !sound,
  };
}
