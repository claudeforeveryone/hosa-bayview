// The full-screen opener (src/components/site-intro.tsx): it plays every time someone opens the site (typing the
// address, a link from outside, opening the installed app, a refresh), the owner's ask. Moving around inside the
// app never replays it, since that's client-side navigation and the page never loads again; neither does coming
// back with the browser's Back button. A tiny script in <head> decides before the first paint, so the page never
// flashes underneath; it marks <html data-intro> and the CSS does the rest.

export const INTRO_MS = 2700;
// The terms and the privacy policy open straight to the text: people reach them from a link or a search, often a
// parent, and the opener would sit on top of what they came to read.
export const NO_INTRO_PATHS = /^\/(terms|privacy)(\/|$)/;
// When the opener plays, it marks <html data-intro-played> for the rest of the page load and the Home banner
// shows at rest instead of playing its own animation: one entrance, never two.

// `navigation` is the page load's PerformanceNavigationTiming type ("navigate", "reload", "back_forward",
// "prerender"), or null when the browser doesn't say.
export function shouldPlayIntro(navigation: string | null, quiet: boolean): boolean {
  if (quiet) return false;
  return navigation !== "back_forward";
}

// Inline in <head>, so it works before the app hydrates. Mirrors shouldPlayIntro. Reduced motion (the OS setting
// or a stored calm), automated browsers and the reading pages (NO_INTRO_PATHS) skip it; storage throwing (blocked
// site data) skips it too. A tap or key (not a bare modifier) skips it at once; the click that
// ends the tap is swallowed so it can't land on the page underneath, the CSS hides the overlay at the end even if
// this never ran again.
export const introScript = `(function(){try{var d=document.documentElement,e0=performance.getEntriesByType&&performance.getEntriesByType("navigation")[0],t=e0?e0.type:null;if(matchMedia("(prefers-reduced-motion: reduce)").matches||navigator.webdriver||localStorage.getItem("motion")==="calm"||${NO_INTRO_PATHS}.test(location.pathname))return;if(t==="back_forward")return;d.setAttribute("data-intro","");d.setAttribute("data-intro-played","");var off=function(){removeEventListener("pointerup",skip,true);removeEventListener("keydown",skip,true)};var eat=function(e){e.preventDefault();e.stopPropagation();removeEventListener("click",eat,true)};var skip=function(e){if(e.type==="keydown"&&/^(Shift|Control|Alt|Meta)$/.test(e.key))return;off();d.removeAttribute("data-intro");if(e.type==="pointerup"){addEventListener("click",eat,true);setTimeout(function(){removeEventListener("click",eat,true)},60)}};addEventListener("pointerup",skip,true);addEventListener("keydown",skip,true);setTimeout(function(){off();d.removeAttribute("data-intro")},${INTRO_MS + 100})}catch(e){}})();`;
