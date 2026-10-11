import { storageMeter, usedOfLimit } from "@/lib/format-bytes";
import { createClient } from "@/lib/supabase/server";

type UsageRow = {
  bucket: string;
  files: number | string;
  bytes: number | string;
};

// Used space across every bucket, against the free plan's 1 GB, with a nudge to share links instead.
// Executives only: storage_usage raises for anyone else, so render this only for an executive.
export async function StorageBar() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("storage_usage");
  if (error) {
    return (
      <p className="text-15 text-ink-2">
        Storage usage isn&apos;t available right now.
      </p>
    );
  }
  // bigint columns can arrive as strings, so coerce before adding.
  const used = ((data ?? []) as UsageRow[]).reduce(
    (sum, r) => sum + Number(r.bytes),
    0,
  );
  const { percent, warn, valueText } = storageMeter(used);

  return (
    <div className="grid gap-2 border-t border-rule pt-4">
      <p className="num text-15">
        <span className="text-ink-2">Storage</span>{" "}
        <span className="font-semibold text-ink">{usedOfLimit(used)}</span>
      </p>
      <div
        role="progressbar"
        aria-label="Storage used"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={valueText}
        className="h-2 border border-rule"
      >
        <div
          className={`h-full ${warn ? "bg-danger" : "bg-ink"}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      {warn ? (
        <p className="caps text-15 font-semibold text-danger">
          Storage almost full
        </p>
      ) : null}
      <p className="text-15 text-ink-2">
        Prefer a link (Google Drive, Docs) to save space.
      </p>
    </div>
  );
}
