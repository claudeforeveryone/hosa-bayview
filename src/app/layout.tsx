import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Condensed, Montserrat } from "next/font/google";
import { IntroBanner } from "@/components/intro-banner";
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

// The chapter mark's wordmark face.
const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["500", "600", "800"],
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

// Resolves the theme before first paint so there's no flash.
const themeScript = `(function(){try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${barlow.variable} ${barlowCondensed.variable} ${montserrat.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full">
        {children}
        <IntroBanner />
      </body>
    </html>
  );
}
