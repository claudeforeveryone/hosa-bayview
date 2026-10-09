import { ClassicLogo } from "@/components/classic-logo";

// The crack runs down the middle in these points (percent of the screen); each half is cut along it.
const CRACK: [number, number][] = [
  [50, 0],
  [47, 12],
  [53.5, 25],
  [48, 37],
  [55, 50],
  [48.5, 62],
  [54, 75],
  [46.5, 88],
  [51, 100],
];
const path = CRACK.map(([x, y]) => `${x}% ${y}%`);
const LEFT = `polygon(0 0, ${path.join(", ")}, 0 100%)`;
const RIGHT = `polygon(100% 0, 100% 100%, ${[...path].reverse().join(", ")})`;
const LINE = CRACK.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ");
const BRANCHES = [
  "M53.5 25 L60 21 L65 27",
  "M48 37 L41 42 L36 40",
  "M55 50 L62 56",
  "M48.5 62 L42 67 L37 65",
  "M54 75 L61 80",
];

function Face() {
  return (
    <>
      <svg
        className="intro-ecg"
        viewBox="0 0 200 40"
        preserveAspectRatio="none"
        aria-hidden
      >
        <path d="M0 24 H72 l2 -2 l2 2 H82 l1.5 4 l3 -22 l3 30 l2 -10 H96 q3 -5 6 0 H108 l1.5 4 l3 -22 l3 30 l2 -10 H122 l2 -2 l2 2 H200" />
      </svg>
      <div className="intro-mark">
        <ClassicLogo className="intro-logo" />
        <p className="intro-words">
          <span className="intro-line-1">Shatter</span>
          <span className="intro-line-2">Every limit</span>
        </p>
      </div>
    </>
  );
}

// Full-screen opener: a heartbeat, the mark and motto slam in, the screen cracks down the middle and the two
// halves pull apart onto the page. Pure CSS driven by <html data-intro>; the head script (src/lib/intro.ts)
// decides when it plays and lets a tap or key skip it, so it works before the app hydrates.
export function SiteIntro() {
  return (
    <div className="intro" aria-hidden>
      <div className="intro-half intro-left" style={{ clipPath: LEFT }}>
        <Face />
      </div>
      <div className="intro-half intro-right" style={{ clipPath: RIGHT }}>
        <Face />
      </div>
      <span className="intro-flash" />
      <svg
        className="intro-crack"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <path d={LINE} />
        {BRANCHES.map((d) => (
          <path key={d} className="intro-branch" d={d} />
        ))}
      </svg>
    </div>
  );
}
