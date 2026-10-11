import type { Role } from "@/lib/auth";

const LABEL: Record<Role, string> = {
  executive: "Executive",
  trainer: "Trainer",
  trainee: "Trainee",
  jobless: "Jobless",
};

// What people see for someone's role. A title an executive set (e.g. "Developer") stands in for it;
// permissions still follow the role. `short` is for tight lists.
export function roleLabel(role: Role, title?: string | null, short = false) {
  const t = title?.trim();
  if (t) return t;
  return short && role === "executive" ? "Exec" : LABEL[role];
}
