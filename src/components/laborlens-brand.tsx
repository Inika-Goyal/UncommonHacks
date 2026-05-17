export function LaborLensLogo({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <mask id="laborlens-outer-cuts">
          <rect width="100%" height="100%" fill="white" />
          <line x1="60" y1="60" x2="60" y2="-10" stroke="black" strokeWidth="7" />
          <line x1="60" y1="60" x2="85" y2="103" stroke="black" strokeWidth="7" />
        </mask>
        <mask id="laborlens-middle-cuts">
          <rect width="100%" height="100%" fill="white" />
          <line x1="60" y1="60" x2="-10" y2="60" stroke="black" strokeWidth="7" />
        </mask>
      </defs>
      <circle cx="60" cy="60" r="11" fill="#ffffff" />
      <circle
        cx="60"
        cy="60"
        r="25"
        fill="none"
        stroke="#ffffff"
        strokeWidth="8"
        mask="url(#laborlens-middle-cuts)"
      />
      <circle
        cx="60"
        cy="60"
        r="43"
        fill="none"
        stroke="#ffffff"
        strokeWidth="9"
        mask="url(#laborlens-outer-cuts)"
      />
    </svg>
  );
}

export function LaborLensWordmark({ size = 28 }: { size?: number }) {
  return (
    <span className="laborlens-wordmark">
      <LaborLensLogo size={size} />
      <span>LABORLENS</span>
    </span>
  );
}
