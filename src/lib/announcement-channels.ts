// Announcement channels: the chapter (executives post) and one per event room you're in (its managers post).
// /announcements?channel= picks one: "chapter", a room id, or nothing for everything.

export type ChannelRoom = { id: string; name: string; can_manage: boolean };
export type Channel = "all" | "chapter" | string;
export type ChannelOption = { value: string; label: string };

export const CHAPTER_LABEL = "Chapter";

// Anything that isn't "chapter" or one of your rooms reads as everything, so an old or foreign link still opens.
export function parseChannel(raw: unknown, rooms: ChannelRoom[]): Channel {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v === "chapter") return "chapter";
  if (typeof v === "string" && rooms.some((r) => r.id === v)) return v;
  return "all";
}

export function channelLabel(classroomId: string | null, rooms: ChannelRoom[]): string {
  if (classroomId === null) return CHAPTER_LABEL;
  return rooms.find((r) => r.id === classroomId)?.name ?? "Event room";
}

// True when a row belongs in the picked channel. Rows from rooms you're not in never show (an executive can read
// every room's news, but their inbox holds the chapter and their own rooms).
export function inChannel(classroomId: string | null, channel: Channel, rooms: ChannelRoom[]): boolean {
  if (channel === "chapter") return classroomId === null;
  if (channel !== "all") return classroomId === channel;
  return classroomId === null || rooms.some((r) => r.id === classroomId);
}

// Where you may post: the chapter for an executive, then every room you manage. The picked channel comes first
// when you can post there, so the form starts on the channel you're looking at.
export function postChannels(exec: boolean, rooms: ChannelRoom[], current: Channel): ChannelOption[] {
  const out: ChannelOption[] = [];
  if (exec) out.push({ value: "chapter", label: `${CHAPTER_LABEL} (everyone)` });
  for (const r of rooms) if (r.can_manage) out.push({ value: r.id, label: r.name });
  const i = out.findIndex((o) => o.value === current);
  if (i > 0) out.unshift(...out.splice(i, 1));
  return out;
}

export function channelHref(channel: Channel): string {
  return channel === "all" ? "/announcements" : `/announcements?channel=${encodeURIComponent(channel)}`;
}
