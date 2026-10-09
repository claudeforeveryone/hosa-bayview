// Pure helpers for the Resources tab: link validation, breakdown totals. Safe on client and server.

export const MAX_TOPICS = 30;

export type ResourceRow = { id: string; title: string; url: string; note: string; position: number };
export type TopicRow = { id: string; topic: string; percent: number; position: number };

// Accepts a full http(s) URL, a bare host like "example.com/guide", or host:port like "localhost:3000"
// (https is added to those). Anything else (javascript:, mailto:, data:, ftp:, whitespace, empty) is null.
export function cleanUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s || s.length > 2048 || /\s/.test(s)) return null;
  let input: string;
  if (/^https?:\/\//i.test(s)) {
    input = s;
  } else if (/^[a-z][a-z0-9+.-]*:/i.test(s) && !/^[a-z0-9.-]+:\d+(?:[/?#]|$)/i.test(s)) {
    // Some other scheme ("javascript:", "mailto:"). A host:port like "example.com:8080" is not one.
    return null;
  } else {
    input = `https://${s}`;
  }
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!url.hostname) return null;
  return url.href;
}

// Shown under each link: the host without "www.".
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export type TopicInput = { topic: string; percent: string };
export type TopicItem = { topic: string; percent: number };

// Blank rows are dropped. Percent is a whole number from 0 to 100.
export function parseTopics(rows: TopicInput[]): { items: TopicItem[]; error?: string } {
  const kept = rows.filter((r) => r.topic.trim() || r.percent.trim());
  if (kept.length > MAX_TOPICS) return { items: [], error: `Use ${MAX_TOPICS} topics at most.` };
  const items: TopicItem[] = [];
  for (const r of kept) {
    const topic = r.topic.trim();
    const percent = r.percent.trim();
    if (!topic) return { items: [], error: "Every row needs a topic name." };
    if (topic.length > 80) return { items: [], error: "Keep topic names under 80 characters." };
    if (!/^\d{1,3}$/.test(percent) || Number(percent) > 100) {
      return { items: [], error: "Percent is a whole number from 0 to 100." };
    }
    items.push({ topic, percent: Number(percent) });
  }
  return { items };
}

export function topicTotal(items: { percent: number }[]): number {
  return items.reduce((sum, i) => sum + i.percent, 0);
}

export type TotalState = { state: "exact" | "under" | "over"; off: number };

export function totalState(total: number): TotalState {
  if (total === 100) return { state: "exact", off: 0 };
  return total < 100 ? { state: "under", off: 100 - total } : { state: "over", off: total - 100 };
}

// Bars never run past the track, even if a bad value slips through.
export function barWidth(percent: number): number {
  return Math.min(100, Math.max(0, percent));
}
