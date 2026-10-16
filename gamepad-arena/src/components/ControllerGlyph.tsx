/**
 * Decorative gamepad silhouette (inline SVG so it scales and inherits colour via
 * currentColor). Purely ornamental — always aria-hidden.
 */
export function ControllerGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 220 140" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M70 34 Q110 18 150 34 Q188 46 196 92 Q200 124 172 128 Q150 130 138 104 Q122 92 110 92 Q98 92 82 104 Q70 130 48 128 Q20 124 24 92 Q32 46 70 34 Z"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      {/* Left stick / right stick */}
      <circle cx="78" cy="74" r="12" stroke="currentColor" strokeWidth="4" />
      <circle cx="132" cy="86" r="12" stroke="currentColor" strokeWidth="4" />
      {/* D-pad */}
      <path d="M96 92 h14 M103 85 v14" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
      {/* Four face buttons */}
      <circle cx="158" cy="58" r="6" stroke="currentColor" strokeWidth="3" />
      <circle cx="158" cy="86" r="6" stroke="currentColor" strokeWidth="3" />
      <circle cx="144" cy="72" r="6" stroke="currentColor" strokeWidth="3" />
      <circle cx="172" cy="72" r="6" stroke="currentColor" strokeWidth="3" />
    </svg>
  )
}
