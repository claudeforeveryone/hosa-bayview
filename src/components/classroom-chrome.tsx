"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// The classroom header and tabs. Hidden while taking or reviewing a test, so the question owns the screen;
// that page has its own way back.
export function ClassroomChrome({ children }: { children: ReactNode }) {
  const path = usePathname();
  if (/\/tests\/[^/]+\/a\//.test(path)) return null;
  return <>{children}</>;
}
