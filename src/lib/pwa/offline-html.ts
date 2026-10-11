// The page the service worker shows when a page can't load. One self-contained document: inline CSS, one tiny
// inline script, and the logo (precached by the worker). No Next.js chunks, so it renders even when nothing else
// of the app is cached, and the address bar keeps the page the member asked for, so "Try again" reloads it.

const NONCE = /^[A-Za-z0-9+/=]{8,64}$/;

// The brand faces, self-hosted in public/fonts (next/font's files have hashed names this page can't know) and
// precached by the worker, so the page keeps the condensed display type with no network at all.
const FONTS = [
  ["Barlow", 400, "barlow-latin-400-normal"],
  ["Barlow", 600, "barlow-latin-600-normal"],
  ['"Barlow Condensed"', 600, "barlow-condensed-latin-600-normal"],
  ['"Barlow Condensed"', 700, "barlow-condensed-latin-700-normal"],
]
  .map(
    ([family, weight, file]) =>
      `@font-face{font-family:${family};font-style:normal;font-weight:${weight};font-display:swap;src:url(/fonts/${file}.woff2) format("woff2")}`,
  )
  .join("\n");

// Light and dark tokens copied from globals.css (Bayview navy, the default palette). Header and main share one
// centred column, so the logo lines up with the headline at every width.
const CSS = `
${FONTS}
:root{color-scheme:light;--ground:#e8f2fa;--band:#d6e6f3;--ink:#0f2440;--ink-2:#33506f;--field:#1e3d62;--on-field:#e8f2fa;--on-field-2:#b4cbe0}
:root[data-theme=dark]{color-scheme:dark;--ground:#1e3d62;--band:#183353;--ink:#e8f2fa;--ink-2:#b4cbe0;--field:#0f2440;--on-field:#e8f2fa;--on-field-2:#a9c1d8}
*{box-sizing:border-box;margin:0;border-radius:0}
html{-webkit-text-size-adjust:100%}
body{min-height:100dvh;display:flex;flex-direction:column;background:var(--ground);color:var(--ink);font:17px/1.5 Barlow,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.col{width:100%;max-width:30rem;margin:0 auto;padding-left:16px;padding-right:16px}
header{background:var(--field);color:var(--on-field);padding:calc(20px + env(safe-area-inset-top)) 0 20px}
header img{display:block;height:72px;width:auto}
main{flex:1;padding-top:40px;padding-bottom:calc(40px + env(safe-area-inset-bottom));display:grid;align-content:start;gap:20px}
h1{font-family:"Barlow Condensed","Roboto Condensed","Arial Narrow",sans-serif-condensed,system-ui,sans-serif;font-stretch:condensed;font-weight:700;text-transform:uppercase;font-size:clamp(2.75rem,12vw,4.5rem);line-height:.92;letter-spacing:-.01em;border-top:3px solid var(--ink);padding-top:16px}
p{color:var(--ink-2);max-width:34ch}
a.btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 24px;width:fit-content;background:var(--ink);color:var(--ground);font-family:"Barlow Condensed","Roboto Condensed","Arial Narrow",sans-serif-condensed,system-ui,sans-serif;font-stretch:condensed;font-size:17px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;text-decoration:none}
a.btn:hover{background:var(--ink-2)}
a.btn:focus-visible{outline:2px solid var(--ink);outline-offset:3px}
@media (min-width:768px){header img{height:96px}main{padding-top:64px}}
`;

// Applies the theme chosen in Settings (or the device's), and reloads by itself once the phone is back online.
const SCRIPT =
  "(function(){var d=document.documentElement;try{var t=localStorage.getItem('theme');" +
  "if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}d.dataset.theme=t}catch(e){}" +
  "addEventListener('online',function(){location.reload()})})()";

export function offlineHtml(nonce: string | null): string {
  const script =
    nonce && NONCE.test(nonce)
      ? `<script nonce="${nonce}">${SCRIPT}</script>`
      : "";
  return `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#1e3d62">
<title>Offline · HOSA Bayview</title>
${script}
<style>${CSS}</style>
</head>
<body>
<header><div class="col"><img src="/brand/classic.png" alt="HOSA Bayview" width="77" height="72"></div></header>
<main id="main" class="col">
<h1>You&rsquo;re offline</h1>
<p>This page needs a connection. It loads by itself when you&rsquo;re back online.</p>
<a class="btn" href="">Try again</a>
</main>
</body>
</html>
`;
}
