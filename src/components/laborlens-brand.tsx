export function LaborLensLogo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="16" r="15" stroke="rgba(255,255,255,0.55)" strokeWidth="1.2" />
      <circle cx="16" cy="16" r="6" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.38)" strokeWidth="1" />
      {[0, 60, 120, 180, 240, 300].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        const x1 = (16 + 7 * Math.cos(rad)).toFixed(3);
        const y1 = (16 + 7 * Math.sin(rad)).toFixed(3);
        const x2 = (16 + 13 * Math.cos(rad)).toFixed(3);
        const y2 = (16 + 13 * Math.sin(rad)).toFixed(3);
        return (
          <line
            key={deg}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="rgba(255,255,255,0.45)"
            strokeWidth="1"
          />
        );
      })}
      <circle cx="16" cy="16" r="2" fill="white" />
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
