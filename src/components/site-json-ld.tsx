import { jsonLdHtml, siteJsonLd, siteUrl } from "@/lib/seo";

// Organization and WebSite structured data, on the public pages only. A data block, not a script, so the CSP
// nonce doesn't apply; jsonLdHtml escapes "<" so nothing in it can end the tag.
export function SiteJsonLd() {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: jsonLdHtml(
          siteJsonLd(siteUrl(process.env.NEXT_PUBLIC_SITE_URL)),
        ),
      }}
    />
  );
}
