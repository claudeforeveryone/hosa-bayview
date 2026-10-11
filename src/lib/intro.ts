// The full-screen opener (src/components/site-intro.tsx): it plays on a first visit and then at most every
// few days, never on every refresh. A tiny script in <head> decides before the first paint, so the page
// never flashes underneath; it marks <html data-intro> and the CSS does the rest.

export const INTRO_KEY = "hosa-intro-at";
export const INTRO_EVERY_MS = 3 * 24 * 60 * 60 * 1000;
export const INTRO_MS = 2700;
// The terms and the privacy policy open straight to the text: people reach them from a link or a search, often a
// parent, and the opener would sit on top of what they came to read. They don't use up the first-visit opener either.
export const NO_INTRO_PATHS = /^\/(terms|privacy)(\/|$)/;
// When the opener plays, it marks <html data-intro-played> for the rest of the page load and the Home banner
// shows at rest instead of playing its own animation: one entrance, never two.

export function shouldPlayIntro(
  last: number | null,
  now: number,
  quiet: boolean,
): boolean {
  if (quiet) return false;
  if (last === null || !Number.isFinite(last)) return true;
  return now - last >= INTRO_EVERY_MS || last > now;
}

// Inline in <head>, so it works before the app hydrates. Mirrors shouldPlayIntro; storage failing (private
// mode, blocked) means no intro rather than one on every load. Reduced motion, automated browsers and the
// reading pages (NO_INTRO_PATHS) skip it. A tap or key (not a bare modifier) skips it at once; the click that
// ends the tap is swallowed so it can't land on the page underneath, the CSS hides the overlay at the end even if
// this never ran again.
export const introScript = `(function(){try{var d=document.documentElement,k=${JSON.stringify(INTRO_KEY)},n=Date.now(),v=localStorage.getItem(k),l=v===null?null:Number(v);if(matchMedia("(prefers-reduced-motion: reduce)").matches||navigator.webdriver||localStorage.getItem("motion")==="calm"||${NO_INTRO_PATHS}.test(location.pathname))return;if(!(l===null||!isFinite(l)||n-l>=${INTRO_EVERY_MS}||l>n))return;localStorage.setItem(k,String(n));d.setAttribute("data-intro","");d.setAttribute("data-intro-played","");var off=function(){removeEventListener("pointerup",skip,true);removeEventListener("keydown",skip,true)};var eat=function(e){e.preventDefault();e.stopPropagation();removeEventListener("click",eat,true)};var skip=function(e){if(e.type==="keydown"&&/^(Shift|Control|Alt|Meta)$/.test(e.key))return;off();d.removeAttribute("data-intro");if(e.type==="pointerup"){addEventListener("click",eat,true);setTimeout(function(){removeEventListener("click",eat,true)},60)}};addEventListener("pointerup",skip,true);addEventListener("keydown",skip,true);setTimeout(function(){off();d.removeAttribute("data-intro")},${INTRO_MS + 100})}catch(e){}})();`;
