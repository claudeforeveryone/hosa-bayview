import { FileText, Link2 } from "lucide-react";
import { deleteMaterial, updateMaterial } from "@/app/(app)/library/actions";
import { ConfirmAction } from "@/components/confirm-action";
import { EmptyState } from "@/components/empty-state";
import { MaterialEditForm } from "@/components/material-form";
import { type MaterialItem, materialMeta } from "@/lib/materials";

// Files and links, newest first. Files open their signed link; links open in a new tab.
// canManage adds Edit and Delete, the same controls the links list has.
export function MaterialList({
  rows,
  canManage,
  empty = "Nothing here yet",
}: {
  rows: MaterialItem[];
  canManage: boolean;
  empty?: string;
}) {
  if (!rows.length) return <EmptyState title={empty} />;

  return (
    <ul className="border-t border-rule">
      {rows.map((r) => {
        const Icon = r.path ? FileText : Link2;
        const unavailable = Boolean(r.path) && !r.href;
        return (
          <li
            key={r.id}
            className="grid gap-4 border-b border-rule px-1 py-4 sm:px-3"
          >
            <div className="flex min-w-0 items-start gap-3">
              <Icon
                size={18}
                strokeWidth={1.75}
                aria-hidden
                className="mt-2 shrink-0 text-ink-2"
              />
              <div className="grid min-w-0 gap-1">
                {r.href ? (
                  <a
                    href={r.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="step text-[19px] font-semibold underline decoration-rule-strong underline-offset-4 [overflow-wrap:anywhere] hover:decoration-ink"
                  >
                    {r.title}
                  </a>
                ) : (
                  <span className="text-[19px] font-semibold [overflow-wrap:anywhere]">
                    {r.title}
                  </span>
                )}
                <span className="text-[15px] text-ink-2">
                  {[materialMeta(r), unavailable && "File unavailable"]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                {r.note ? (
                  <p className="text-[17px] whitespace-pre-line text-ink-2 [overflow-wrap:anywhere]">
                    {r.note}
                  </p>
                ) : null}
              </div>
            </div>
            {canManage ? (
              <div className="grid justify-items-start gap-4 pl-7">
                <details className="w-full max-w-xl">
                  <summary className="caps step inline-flex h-11 cursor-pointer items-center text-[15px] text-ink-2 hover:text-ink">
                    Edit
                  </summary>
                  <div className="pt-5">
                    <MaterialEditForm
                      action={updateMaterial.bind(null, r.id)}
                      initial={{ title: r.title, note: r.note }}
                    />
                  </div>
                </details>
                <ConfirmAction
                  action={deleteMaterial.bind(null, r.id)}
                  label="Delete"
                  confirmLabel="Delete"
                  pendingLabel="Deleting"
                  question={`Delete ${r.title}?`}
                  compact
                />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
