import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import localFont from "next/font/local";
import { AppearanceSync } from "@/components/appearance";
import { appearanceScript } from "@/lib/appearance";
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
  description: "Training for HOSA Bayview members: classrooms, practice tests, flashcards, and leaderboards.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e8f2fa" },
    { media: "(prefers-color-scheme: dark)", color: "#1e3d62" },
  ],
};


export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${barlow.variable} ${barlowCondensed.variable} ${montserrat.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: appearanceScript }} />
      </head>
      <body className="min-h-full">
        {children}
        <AppearanceSync />
      </body>
    </html>
  );
}
