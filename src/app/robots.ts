import type { MetadataRoute } from "next";

// Private chapter site: no crawler is welcome anywhere.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
