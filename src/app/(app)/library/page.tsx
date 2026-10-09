import type { Metadata } from "next";
import { MaterialForm } from "@/components/material-form";
import { MaterialList } from "@/components/material-list";
import { PageTitle } from "@/components/page-title";
import { requireProfile } from "@/lib/auth";
import { saveMaterial } from "./actions";
import { getMaterials } from "./queries";

export const metadata: Metadata = { title: "Library" };

const heading =
  "font-display text-[clamp(2rem,7vw,3rem)] leading-none font-bold uppercase";

export default async function LibraryPage() {
  const [profile, rows] = await Promise.all([
    requireProfile(),
    getMaterials(null),
  ]);
  const isExec = profile.role === "executive";

  return (
    <div className="grid grid-cols-1 gap-14">
      <div className="grid gap-8">
        <PageTitle meta="Chapter files and links">Library</PageTitle>
        <MaterialList
          rows={rows}
          canManage={isExec}
          empty="Nothing in the library yet"
        />
      </div>

      {isExec ? (
        <section
          aria-labelledby="add-h"
          className="grid gap-6 border-t border-rule pt-10"
        >
          <h2 id="add-h" className={heading}>
            Add to the library
          </h2>
          <MaterialForm
            action={saveMaterial.bind(null, null)}
            classroomId={null}
          />
        </section>
      ) : null}
    </div>
  );
}
