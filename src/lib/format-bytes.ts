// Storage meter maths for the admin page. Byte formatting itself lives in materials.ts (formatBytes).
import { formatBytes } from "@/lib/materials";

export const STORAGE_LIMIT_BYTES = 1073741824; // Supabase free plan: 1 GB.
export const STORAGE_WARN_RATIO = 0.8;

// "412 MB of 1 GB".
export function usedOfLimit(usedBytes: number): string {
  return `${formatBytes(usedBytes)} of ${formatBytes(STORAGE_LIMIT_BYTES)}`;
}

// Bar fill (0 to 100, whole percent), whether to show the "almost full" warning, and the bar's spoken value.
// The warning reads the same rounded percent the bar shows, so a bar at 80% always warns.
export function storageMeter(usedBytes: number): {
  percent: number;
  warn: boolean;
  valueText: string;
} {
  const used = Number.isFinite(usedBytes) && usedBytes > 0 ? usedBytes : 0;
  const percent = Math.min(100, Math.round((used / STORAGE_LIMIT_BYTES) * 100));
  return { percent, warn: percent >= STORAGE_WARN_RATIO * 100, valueText: usedOfLimit(used) };
}
