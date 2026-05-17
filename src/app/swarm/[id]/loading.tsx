export default function Loading() {
  return (
    <main className="launch-page lumina-shell">
      <div className="launch-backdrop" aria-hidden="true" />

      <header className="launch-header">
        <div className="launch-brand" aria-label="Lumina">
          <LuminaLogo size={26} />
          <span>LUMINA</span>
        </div>
        <span className="launch-status">Preparing source run</span>
      </header>

      <section className="launch-loading-shell">
        <div className="launch-loading-card liquid-glass">
          <div className="launch-loading-orbit" aria-hidden="true">
            <span className="launch-loading-node" />
            <span className="launch-loading-node" />
            <span className="launch-loading-node" />
          </div>
          <div className="launch-titlebar">
            <p className="launch-eyebrow">Labour Exploitation Intelligence Platform</p>
            <h1 className="launch-title">Preparing public evidence scan</h1>
            <p className="launch-subtitle">
              The investigation workspace is loading source agents, report state, and the live
              collection view.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

function LuminaLogo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="16" r="15" stroke="rgba(255,255,255,0.5)" strokeWidth="1.2" />
      <circle cx="16" cy="16" r="6" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.35)" strokeWidth="1" />
      {[0, 60, 120, 180, 240, 300].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        const x1 = (16 + 7 * Math.cos(rad)).toFixed(3);
        const y1 = (16 + 7 * Math.sin(rad)).toFixed(3);
        const x2 = (16 + 13 * Math.cos(rad)).toFixed(3);
        const y2 = (16 + 13 * Math.sin(rad)).toFixed(3);
        return <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,255,255,0.4)" strokeWidth="1" />;
      })}
      <circle cx="16" cy="16" r="2" fill="white" />
    </svg>
  );
}
