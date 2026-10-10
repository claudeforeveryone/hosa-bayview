import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Condensed, Lexend } from "next/font/google";
import localFont from "next/font/local";
import { headers } from "next/headers";
import { AppearanceSync } from "@/components/appearance";
import { appearanceScript } from "@/lib/appearance";
import { heroRestScript } from "@/lib/hero";
import { introScript } from "@/lib/intro";
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

export const metadata: Metadata = {
  title: { default: "HOSA Bayview", template: "%s · HOSA Bayview" },
  description: "Training for HOSA Bayview members: events, practice tests, flashcards, and leaderboards.",
  // Private by default: nothing here should be indexed or previewed with member data.
  robots: { index: false, follow: false, nocache: true },
  // Link previews carry the chapter name and nothing else (no description, no images).
  openGraph: { siteName: "HOSA Bayview", title: "HOSA Bayview", description: "HOSA Bayview", type: "website" },
  twitter: { card: "summary", title: "HOSA Bayview", description: "HOSA Bayview" },
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
      </head>
      <body className="min-h-full">
        <SiteIntro />
        {children}
        <AppearanceSync />
      </body>
    </html>
  );
}
