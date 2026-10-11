import type { MetadataRoute } from "next";
import { siteUrl, sitemap as entries } from "@/lib/seo";

// Public pages only. The app is private and never listed.
export default function sitemap(): MetadataRoute.Sitemap {
  return entries(siteUrl(process.env.NEXT_PUBLIC_SITE_URL));
}
