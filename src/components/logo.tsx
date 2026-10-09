// Official Bayview HOSA logo, drawn as a mask so it takes the current text colour:
// navy on the ice ground, ice on navy. Source art and build script: scripts/make-logo.py.
export function Logo({ className = "", title = "HOSA Bayview" }: { className?: string; title?: string }) {
  return (
    <span
      role="img"
      aria-label={title}
      className={`inline-block aspect-[793/746] bg-current ${className}`}
      style={{
        maskImage: "url(/brand/logo-mask.png)",
        WebkitMaskImage: "url(/brand/logo-mask.png)",
        maskSize: "contain",
        WebkitMaskSize: "contain",
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
      }}
    />
  );
}
