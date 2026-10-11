import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Condensed, Lexend } from "next/font/google";
import localFont from "next/font/local";
import { headers } from "next/headers";
import { AppearanceSync } from "@/components/appearance";
import { appearanceScript } from "@/lib/appearance";
import { heroRestScript } from "@/lib/hero";
import { introScript } from "@/lib/intro";
import { siteUrl } from "@/lib/seo";
import { SiteIntro } from "@/components/site-intro";
import "./globals.css";

const barlow = Barlow({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

// The optional dyslexia-friendly face from Settings > Look. preload: false keeps it off the wire until someone picks it.
const lexend = Lexend({
  variable: "--font-lexend",
  subsets: ["latin"],
  preload: false,
});

// The chapter mark's wordmark face. Static files, one per weight: Google serves Montserrat as a single
// variable font, and some WebKit builds draw that at its thinnest weight whatever weight is asked for.
const montserrat = localFont({
  variable: "--font-montserrat",
  src: [
    { path: "./fonts/montserrat-latin-500-normal.woff2", weight: "500" },
    { path: "./fonts/montserrat-latin-600-normal.woff2", weight: "600" },
    { path: "./fonts/montserrat-latin-800-normal.woff2", weight: "800" },
  ],
});

const SITE_DESCRIPTION =
  "HOSA Bayview's study site: practice tests from past competition papers, flashcards, event classrooms and chapter leaderboards for members preparing for HOSA events.";

// Private by default: every page is noindex unless it opts back in with publicPage() (lib/seo.ts), which also gives
// it a canonical address. Canonical isn't set here, or every page would inherit "/". Link previews of a private
// address show the log-in page's card, since a signed-out crawler is sent there. The card image is
// app/opengraph-image.png and app/twitter-image.png (scripts/make-og-image.py); the icons are app/icon.png and
// app/apple-icon.png.
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl(process.env.NEXT_PUBLIC_SITE_URL)),
  title: { default: "HOSA Bayview", template: "%s · HOSA Bayview" },
  description: SITE_DESCRIPTION,
  applicationName: "HOSA Bayview",
  robots: { index: false, follow: false, nocache: true },
  openGraph: {
    siteName: "HOSA Bayview",
    title: "HOSA Bayview",
    description: SITE_DESCRIPTION,
    type: "website",
    locale: "en_CA",
  },
  twitter: { card: "summary_large_image", title: "HOSA Bayview", description: SITE_DESCRIPTION },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e8f2fa" },
    { media: "(prefers-color-scheme: dark)", color: "#1e3d62" },
  ],
};


export default async function RootLayout({ children }: LayoutProps<"/">) {
  // The proxy's per-request CSP nonce. The inline scripts below run before paint, so they need it too.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${barlow.variable} ${barlowCondensed.variable} ${lexend.variable} ${montserrat.variable} h-full antialiased`}
    >
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: appearanceScript }} />
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: introScript }} />
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: heroRestScript }} />
        {/* The browser's Supabase address and publishable key (both public), read at request time. A host that
            sets them only at run time (the Cloudflare build's vars) never bakes them into the browser bundle,
            and without these every browser-side call (picture uploads, the bell) failed. */}
        <meta name="hosa-supabase-url" content={process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""} />
        <meta name="hosa-supabase-key" content={process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ""} />
      </head>
      <body className="min-h-full">
        <SiteIntro />
        {children}
        <AppearanceSync />
      </body>
    </html>
  );
}
