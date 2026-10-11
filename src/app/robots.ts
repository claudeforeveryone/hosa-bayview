import type { MetadataRoute } from "next";
import { robots as rules, siteUrl } from "@/lib/seo";

// An allow list: the public pages (log in, sign up, terms, privacy) and what they need; the app stays out.
export default function robots(): MetadataRoute.Robots {
  return rules(siteUrl(process.env.NEXT_PUBLIC_SITE_URL));
}
