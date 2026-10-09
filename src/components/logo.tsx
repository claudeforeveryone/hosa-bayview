// Stand-in lockup (triangle, ECG trace, wordmark) until the official logo files land in /public.
export function Logo({ className, title = "HOSA Bayview" }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 180 160" role="img" aria-label={title} className={className}>
      <title>{title}</title>
      <path
        d="M40 96 L92 6 L172 150 L160 150"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinejoin="miter"
      />
      <path
        d="M96 78 H124 L129 66 L135 92 L141 56 L147 84 L151 78 H174"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="miter"
      />
      <text x="4" y="122" fill="currentColor" fontFamily="var(--font-barlow)" fontWeight="400" fontSize="31" letterSpacing="1">
        HOSA
      </text>
      <text x="2" y="154" fill="currentColor" fontFamily="var(--font-barlow)" fontWeight="700" fontSize="35" letterSpacing="0.5">
        BAYVIEW
      </text>
    </svg>
  );
}
