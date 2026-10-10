// Storage meter maths for the admin page. Byte formatting itself lives in materials.ts (formatBytes).
import { formatBytes } from "@/lib/materials";

export const STORAGE_LIMIT_BYTES = 1073741824; // Supabase free plan: 1 GB.
export const STORAGE_WARN_RATIO = 0.8;

// "412 MB of 1 GB".
export function usedOfLimit(usedBytes: number): string {
  return `${formatBytes(usedBytes)} of ${formatBytes(STORAGE_LIMIT_BYTES)}`;
}

// Bar fill (0 to 100, whole percent) and whether to show the "almost full" warning.
export function storageMeter(usedBytes: number): {
  percent: number;
  warn: boolean;
} {
  if (!Number.isFinite(usedBytes) || usedBytes <= 0)
    return { percent: 0, warn: false };
  return {
    percent: Math.min(100, Math.round((usedBytes / STORAGE_LIMIT_BYTES) * 100)),
    warn: usedBytes >= STORAGE_LIMIT_BYTES * STORAGE_WARN_RATIO,
  };
}
