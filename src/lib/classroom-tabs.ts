// Which classroom tabs a room shows. Pure, so the rule is testable apart from the nav component.
export type Category = "mc" | "practical" | "showcase";
export type Tab = { slug: string; label: string };

export function parseCategory(value: unknown): Category | null {
  return value === "mc" || value === "practical" || value === "showcase" ? value : null;
}

// Hub first, then most used. Practical rooms add Skills; showcase rooms have no tests.
// Grades (the whole-class grid) and Settings are for managers.
export function tabsFor(category: Category | null, isManager: boolean): Tab[] {
  const tabs: Tab[] = [{ slug: "", label: "Board" }];
  if (category !== "showcase") tabs.push({ slug: "tests", label: "Tests" });
  if (category === "practical") tabs.push({ slug: "skills", label: "Skills" });
  tabs.push(
    { slug: "flashcards", label: "Cards" },
    { slug: "resources", label: "Resources" },
    { slug: "members", label: "People" },
    { slug: "attendance", label: "Attendance" },
  );
  if (isManager) tabs.push({ slug: "grades", label: "Grades" }, { slug: "settings", label: "Settings" });
  return tabs;
}
