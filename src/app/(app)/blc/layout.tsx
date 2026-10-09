import { notFound } from "next/navigation";
import { BLC_ENABLED } from "@/lib/features";

// BLC is hidden for now (src/lib/features.ts); every /blc page reads as missing.
export default function BlcLayout({ children }: LayoutProps<"/blc">) {
  if (!BLC_ENABLED) notFound();
  return children;
}
