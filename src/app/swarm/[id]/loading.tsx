export default function Loading() {
  return (
    <main className="launch-page laborlens-shell">
      <div className="launch-backdrop" aria-hidden="true" />

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
