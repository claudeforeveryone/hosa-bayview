import type { Metadata, MetadataRoute } from "next";
import { INDEPENDENCE_NOTE, LEGAL_EFFECTIVE_AT } from "./legal";

// Search and link-preview facts shared by the root metadata, robots.txt, the sitemap and the public pages.

export const SITE_NAME = "HOSA Bayview";
export const PRODUCTION_URL = "https://hosa-bayview.vercel.app";

// The site's origin from NEXT_PUBLIC_SITE_URL. Anything that isn't an http(s) URL falls back to production, so a bad
// setting can't break the metadata, and previews (where the variable is unset) still point canonical at production.
export function siteUrl(value: string | undefined): string {
  try {
    const url = new URL((value ?? "").trim());
    if (url.protocol === "https:" || url.protocol === "http:")
      return url.origin;
  } catch {
    // Not a URL: the fallback below.
  }
  return PRODUCTION_URL;
}

// The pages a search engine may list. Each is public in the proxy (route-gate.ts) and opts back in to indexing.
export const INDEXED_PATHS = [
  "/login",
  "/signup",
  "/terms",
  "/privacy",
] as const;

// robots.txt is an allow list: everything is disallowed, then the public pages are let back in, with the files they
// need to render and the social cards. "/$" lets a crawler follow the home page's redirect to /login. Anything added
// to the app later is covered by "Disallow: /" without touching this file.
const CRAWLABLE = [
  "/$",
  ...INDEXED_PATHS,
  "/_next/static/",
  "/brand/",
  "/opengraph-image",
  "/twitter-image",
  "/icon",
  "/apple-icon",
];

export function robots(base: string): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: CRAWLABLE, disallow: "/" },
    sitemap: `${base}/sitemap.xml`,
  };
}

// The sitemap holds the public pages only; the app is private and never listed.
export function sitemap(base: string): MetadataRoute.Sitemap {
  const lastModified = new Date(LEGAL_EFFECTIVE_AT);
  return INDEXED_PATHS.map((path) => ({
    url: `${base}${path}`,
    lastModified,
    changeFrequency: "yearly",
    priority: path === "/login" ? 1 : path === "/signup" ? 0.8 : 0.3,
  }));
}

// Metadata for a page anyone may open: indexable, with its own canonical address. The social card image comes from
// app/opengraph-image.png and app/twitter-image.png, which Next adds to every page.
export function publicPage({ title, description, path }: { title: string; description: string; path: string }): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    robots: { index: true, follow: true },
    openGraph: { type: "website", siteName: SITE_NAME, locale: "en_CA", title, description, url: path },
    twitter: { card: "summary_large_image", title, description },
  };
}

// Organization (the chapter's study site) and WebSite, for the public pages. Says plainly that it is not run by HOSA.
export function siteJsonLd(base: string) {
  const org = `${base}/#organization`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": org,
        name: SITE_NAME,
        url: base,
        logo: `${base}/icon.png`,
        description: `A study site made by and for members of the HOSA Bayview chapter at Bayview Secondary School. ${INDEPENDENCE_NOTE}`,
        sameAs: ["https://www.instagram.com/hosabayview/"],
      },
      {
        "@type": "WebSite",
        "@id": `${base}/#website`,
        name: SITE_NAME,
        url: base,
        inLanguage: "en-CA",
        publisher: { "@id": org },
      },
    ],
  };
}

// The six characters backslash, u, 0, 0, 3, c: JSON's own escape for "<".
const LT = `${String.fromCharCode(92)}u003c`;

// JSON for a <script type="application/ld+json">. "<" is escaped so no value can close the tag (Next's JSON-LD guide).
export function jsonLdHtml(data: unknown): string {
  return JSON.stringify(data).replace(/</g, LT);
}
