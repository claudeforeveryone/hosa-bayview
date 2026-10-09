"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { SEASON } from "@/components/classic-logo";

// Shards of the triangle (together they are the whole triangle): wedges around the point the tiger roars from, each thrown
// outward and toward the viewer. Coordinates are percentages of the logo stage.
const IMPACT = [62, 46];
const RIM: [number, number][] = [
  [0, 0],
  [30, 0],
  [62, 0],
  [100, 0],
  [100, 40],
  [100, 100],
  [62, 100],
  [28, 100],
  [0, 100],
  [0, 48],
];
const TRIANGLE_SHARDS = RIM.map((a, i) => {
  const b = RIM[(i + 1) % RIM.length];
  const cx = (IMPACT[0] + a[0] + b[0]) / 3 - IMPACT[0];
  const cy = (IMPACT[1] + a[1] + b[1]) / 3 - IMPACT[1];
  const len = Math.hypot(cx, cy) || 1;
  return {
    clip: `polygon(${IMPACT[0]}% ${IMPACT[1]}%, ${a[0]}% ${a[1]}%, ${b[0]}% ${b[1]}%)`,
    tx: (cx / len) * 70,
    ty: (cy / len) * 60,
    tz: 180 + (i % 3) * 90,
    rx: (i % 2 ? 1 : -1) * (40 + i * 7),
    ry: (i % 3 ? -1 : 1) * (55 + i * 5),
    rz: (i % 2 ? -1 : 1) * (20 + i * 9),
    delay: i * 18,
  };
});

// The wordmark breaks into slanted strips that fall away down and to the left.
const CUTS = [-10, 13, 26, 39, 52, 80];
const WORD_SHARDS = CUTS.slice(0, -1).map((x0, i) => {
  const x1 = CUTS[i + 1];
  return {
    clip: `polygon(${x0 + 3}% 74%, ${x1 + 3}% 74%, ${x1 - 2}% 100%, ${x0 - 2}% 100%)`,
    tx: -18 - i * 6,
    ty: 34 + (i % 2) * 14,
    tz: 120 + i * 40,
    rx: 50 + i * 12,
    ry: -30 - i * 8,
    rz: (i % 2 ? 1 : -1) * (14 + i * 6),
    delay: 60 + i * 26,
  };
});

type Shard = (typeof TRIANGLE_SHARDS)[number];
const shardStyle = (s: Shard) =>
  ({
    clipPath: s.clip,
    "--tx": `${s.tx}%`,
    "--ty": `${s.ty}%`,
    "--tz": `${s.tz}px`,
    "--rx": `${s.rx}deg`,
    "--ry": `${s.ry}deg`,
    "--rz": `${s.rz}deg`,
    "--d": `${s.delay}ms`,
  }) as CSSProperties;

const LINES = ["Shatter", "Every limit"];

// Set once the banner has played in this page load. Coming back to a page client-side shows it finished.
let playedThisLoad = false;

// The banner at the top of Home and the sign-in page. On a fresh load it drops in, the classic logo breaks
// apart in 3D and "Shatter every limit" flips in beside the tiger; then it stays as a plain band.
export function HeroBanner({
  bare = false,
  className = "",
}: {
  bare?: boolean;
  className?: string;
}) {
  // Server and first client render agree (nothing has played yet), so hydration matches.
  const [play] = useState(() => !playedThisLoad);
  useEffect(() => {
    playedThisLoad = true;
  }, []);

  return (
    <div
      className={`hero ${bare ? "hero-bare" : ""} ${className}`}
      data-play={play ? "" : undefined}
    >
      <p className="sr-only">Shatter every limit. HOSA Bayview {SEASON}.</p>
      <div className="hero-panel" aria-hidden>
        <div className="hero-stage">
          {TRIANGLE_SHARDS.map((s, i) => (
            <span
              key={`t${i}`}
              className="hero-layer hero-triangle hero-shard"
              style={shardStyle(s)}
            />
          ))}
          {WORD_SHARDS.map((s, i) => (
            <span
              key={`w${i}`}
              className="hero-layer hero-word hero-shard"
              style={shardStyle(s)}
            />
          ))}
          <span className="hero-season-old">{SEASON}</span>
          <span className="hero-layer hero-tiger">
            <span className="hero-glint" />
          </span>
          <span className="hero-flash" />
        </div>
        <div className="hero-words">
          {LINES.map((line, li) => (
            <span key={line} className={`hero-line hero-line-${li + 1}`}>
              {[...line].map((ch, ci) => (
                <span
                  key={ci}
                  className={ch === " " ? "hero-char hero-space" : "hero-char"}
                  style={{ "--i": li * 7 + ci } as CSSProperties}
                >
                  {ch === " " ? " " : ch}
                </span>
              ))}
            </span>
          ))}
          <span className="hero-season">{SEASON}</span>
        </div>
      </div>
    </div>
  );
}
