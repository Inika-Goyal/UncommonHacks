"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { BarChart3, ChevronDown, ChevronRight, Loader2, Newspaper, ShieldAlert } from "lucide-react";

import IntroScreen from "@/components/IntroScreen";
import { VideoBackground } from "@/components/video-background";

type InputMode = "company" | "region";

const REGIONS = [
  "South & Southeast Asia",
  "East Asia",
  "Sub-Saharan Africa",
  "Latin America",
  "Eastern Europe",
  "Middle East & North Africa",
];

const HOME_AGENTS = [
  { id: "news", label: "News Agent" },
  { id: "watch", label: "Watchlist" },
  { id: "supplier", label: "Supplier" },
  { id: "legal", label: "Legal" },
  { id: "risk", label: "Risk" },
];

const LIVE_FEED = [
  { location: "Xinjiang, China", risk: 5 },
  { location: "Dhaka, Bangladesh", risk: 3 },
  { location: "Yangon, Myanmar", risk: 4 },
];

function getRiskColor(score: number): string {
  if (score >= 5) return "#ef4444";
  if (score >= 4) return "#f97316";
  if (score >= 3) return "#f59e0b";
  return "#22c55e";
}

function MiniGlobe() {
  const R = 36;
  const cx = 48;
  const cy = 40;
  const phi0 = (20 * Math.PI) / 180;
  const lambda0 = (85 * Math.PI) / 180;

  function project(lat: number, lng: number): [number, number] {
    const phi = (lat * Math.PI) / 180;
    const lambda = (lng * Math.PI) / 180;
    const x = R * Math.cos(phi) * Math.sin(lambda - lambda0);
    const y = -R * (Math.sin(phi0) * Math.cos(phi) * Math.cos(lambda - lambda0) - Math.cos(phi0) * Math.sin(phi));
    return [cx + x, cy + y];
  }

  const pins = [
    { lat: 41.2, lng: 85.5, color: "#ef4444" },
    { lat: 23.8, lng: 90.4, color: "#f59e0b" },
    { lat: 16.9, lng: 96.2, color: "#f97316" },
  ];

  const latLines = [-60, -30, 0, 30, 60];
  const lngLines = [30, 60, 90, 120, 150];

  return (
    <svg width="96" height="80" viewBox="0 0 96 80" aria-hidden>
      <defs>
        <radialGradient id="landing-mini-globe" cx="40%" cy="35%">
          <stop offset="0%" stopColor="#1a2340" />
          <stop offset="100%" stopColor="#060a18" />
        </radialGradient>
        <clipPath id="landing-mini-globe-clip">
          <circle cx={cx} cy={cy} r={R} />
        </clipPath>
      </defs>
      <circle cx={cx} cy={cy} r={R} fill="url(#landing-mini-globe)" />
      <g clipPath="url(#landing-mini-globe-clip)" stroke="rgba(255,255,255,0.07)" strokeWidth="0.5" fill="none">
        {latLines.map((lat) => {
          const points = Array.from({ length: 37 }, (_, i) => {
            const [x, y] = project(lat, -180 + i * 10);
            return `${x},${y}`;
          });
          return <polyline key={lat} points={points.join(" ")} />;
        })}
        {lngLines.map((lng) => {
          const points = Array.from({ length: 19 }, (_, i) => {
            const [x, y] = project(-90 + i * 10, lng);
            return `${x},${y}`;
          });
          return <polyline key={lng} points={points.join(" ")} />;
        })}
      </g>
      {pins.map(({ lat, lng, color }, index) => {
        const [x, y] = project(lat, lng);
        return (
          <g key={index}>
            <circle cx={x} cy={y} r={5} fill={color} opacity={0.22} />
            <circle cx={x} cy={y} r={2.5} fill={color} />
          </g>
        );
      })}
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
    </svg>
  );
}

export default function LandingPage() {
  const router = useRouter();
  const [showIntro, setShowIntro] = useState(true);
  const [mode, setMode] = useState<InputMode>("company");
  const [company, setCompany] = useState("");
  const [region, setRegion] = useState("");
  const [showRegionMenu, setShowRegionMenu] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (showIntro) {
    return <IntroScreen onComplete={() => setShowIntro(false)} />;
  }

  const isValid = mode === "company" ? company.trim().length > 0 : region.length > 0;

  const handleSubmit = async () => {
    if (loading || !isValid) return;
    setError(null);
    setLoading(true);

    const query = mode === "company" ? company.trim() : region;

    try {
      const response = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inputType: mode,
          query,
        }),
      });
      const payload = (await response.json()) as
        | { ok: true; reportId: string }
        | { ok: false; error: string; code?: string };

      if (!payload.ok) {
        setError(payload.error);
        setLoading(false);
        return;
      }

      router.push(`/swarm/${payload.reportId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start the swarm.");
      setLoading(false);
    }
  };

  return (
    <div className="laborlens-shell relative min-h-dvh overflow-hidden">
      <VideoBackground />

      <div className="relative z-10 flex min-h-dvh gap-6">
        {/* ── LEFT PANEL ── */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="w-[52%] shrink-0 relative min-h-dvh flex"
        >
          {/* glass overlay sits inside the margin */}
          <div className="liquid-glass-strong m-6 min-h-[calc(100dvh-3rem)] w-full rounded-3xl flex flex-col">
            {/* Nav */}
            <div className="flex items-center justify-between px-7 pt-7">
              <div className="flex items-center gap-3">
                <img src="/logo.svg" alt="LaborLens" className="h-9 w-auto" />
              </div>
              <div className="liquid-glass flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-white/50 text-xs">
                Labour Exploitation Intelligence
              </div>
            </div>

            {/* Centre block — hero + search + pills, vertically centred */}
            <div className="flex-1 flex flex-col justify-center gap-7 px-7 py-8">
              {/* Hero */}
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25, duration: 0.8 }}
                className="text-center"
              >
                <h1 className="text-white text-[2.75rem] font-semibold leading-[1.05] tracking-[-0.03em]">
                  Labour exploitation,{' '}
                  <span className="font-light opacity-70 italic">made visible.</span>
                </h1>
                <p className="text-white/60 text-sm mt-4 max-w-[28rem] mx-auto leading-relaxed">
                  Enter a company or region. Specialist agents pull news, watchlists, supplier disclosures and country-risk data into one cited report — in minutes, not weeks.
                </p>
              </motion.div>

              {/* Search */}
              <div className="liquid-glass rounded-2xl p-4">
                <div className="flex gap-1 bg-white/5 rounded-xl p-1 mb-3">
                  {(["company", "region"] as InputMode[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => setMode(m)}
                      className="flex-1 py-1.5 rounded-lg text-xs transition-all duration-200"
                      style={{
                        background: mode === m ? "rgba(255,255,255,0.12)" : "transparent",
                        color: mode === m ? "white" : "rgba(255,255,255,0.35)",
                      }}
                    >
                      {m === "company" ? "Company" : "Region"}
                    </button>
                  ))}
                </div>

                {mode === "company" ? (
                  <input
                    type="text"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                    placeholder="Enter company name (e.g. Shein, Nike, H&M)"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/25 text-sm outline-none focus:border-white/25 transition-colors mb-3"
                  />
                ) : (
                  <div className="relative mb-3">
                    <button
                      onClick={() => setShowRegionMenu((v) => !v)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm flex items-center justify-between hover:border-white/20 transition-colors"
                      style={{ color: region ? "white" : "rgba(255,255,255,0.25)" }}
                    >
                      <span>{region || "Select a geographic region"}</span>
                      <ChevronDown
                        size={13}
                        className="text-white/30 transition-transform duration-200"
                        style={{ transform: showRegionMenu ? "rotate(180deg)" : "rotate(0deg)" }}
                      />
                    </button>
                    {showRegionMenu && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="liquid-glass absolute top-full mt-1 left-0 right-0 rounded-xl overflow-hidden z-20"
                      >
                        {REGIONS.map((r) => (
                          <button
                            key={r}
                            onClick={() => { setRegion(r); setShowRegionMenu(false); }}
                            className="w-full text-left px-4 py-2.5 text-xs text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                          >
                            {r}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </div>
                )}

                <motion.button
                  onClick={handleSubmit}
                  disabled={!isValid || loading}
                  whileHover={isValid && !loading ? { scale: 1.015 } : {}}
                  whileTap={isValid && !loading ? { scale: 0.985 } : {}}
                  className="liquid-glass-strong w-full py-3 rounded-xl text-xs font-medium tracking-[0.2em] transition-all duration-300 flex items-center justify-center gap-2"
                  style={{
                    color: isValid && !loading ? "white" : "rgba(255,255,255,0.25)",
                    cursor: isValid && !loading ? "pointer" : "not-allowed",
                  }}
                >
                  {loading ? (
                    <>
                      <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
                        <Loader2 size={13} />
                      </motion.div>
                      Launching Agent Swarm…
                    </>
                  ) : 'ANALYSE'}
                </motion.button>

                {error ? (
                  <p className="text-red-300/80 text-xs text-center mt-3">{error}</p>
                ) : null}
              </div>

              {/* Pills */}
              <div className="flex flex-wrap gap-2 justify-center">
                {['Forced Labor', 'Sexual Exploitation', 'Child Labor', 'Illegal Profits'].map((pill) => (
                  <span key={pill} className="liquid-glass text-white/50 text-xs px-3 py-1.5 rounded-full">
                    {pill}
                  </span>
                ))}
              </div>
            </div>

            {/* Stat — pinned at bottom */}
            <div className="px-7 pb-7 pt-5 border-t border-white/10 text-center">
              <p className="text-white/35 text-[10px] tracking-[0.22em] uppercase mb-2">
                The Scale of the Problem
              </p>
              <p className="text-white/90 text-lg font-light">40.3 million people</p>
              <p className="text-white/45 text-xs mt-0.5">live in modern slavery today.</p>
              <div className="flex items-center gap-2 mt-2.5 justify-center">
                <div className="flex-1 h-px bg-white/10" />
                <p className="text-white/25 text-[10px] whitespace-nowrap">
                  — Walk Free Global Slavery Index
                </p>
                <div className="flex-1 h-px bg-white/10" />
              </div>
            </div>
          </div>
        </motion.div>

        {/* ── RIGHT PANEL — keeps the Earth visible ── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.9, delay: 0.15 }}
          className="w-[48%] flex flex-col p-6 min-h-screen"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="liquid-glass rounded-2xl px-4 py-2.5 flex items-center gap-4 flex-1 overflow-hidden">
              <span className="text-white/25 text-[10px] tracking-[0.18em] uppercase shrink-0">
                Agent Swarm - Ready
              </span>
              {HOME_AGENTS.map((agent) => (
                <div key={agent.id} className="flex items-center gap-1.5 min-w-0">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                  </span>
                  <span className="text-white/55 text-xs truncate max-w-[7rem]">{agent.label}</span>
                </div>
              ))}
            </div>
            <button className="liquid-glass flex items-center gap-2 px-4 py-2.5 rounded-2xl text-white/50 text-xs hover:text-white transition-colors shrink-0">
              ✦ Account
            </button>
          </div>

          <div className="liquid-glass rounded-2xl p-4 w-56">
            <p className="text-white text-sm font-medium mb-0.5">Recently Flagged</p>
            <p className="text-white/40 text-xs mb-3">Live risk intelligence feed</p>
            <div className="flex flex-col gap-2">
              {LIVE_FEED.map((entry) => (
                <div key={entry.location} className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: getRiskColor(entry.risk) }} />
                  <span className="text-white/70 text-xs flex-1 leading-tight">{entry.location}</span>
                  <span className="text-[10px] font-medium shrink-0" style={{ color: getRiskColor(entry.risk) }}>
                    {entry.risk}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex-1" />

          <div className="liquid-glass rounded-[2rem] p-3 mb-3">
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div className="liquid-glass rounded-3xl p-5">
                <div className="liquid-glass w-9 h-9 rounded-xl flex items-center justify-center mb-3">
                  <Newspaper size={16} className="text-white/50" />
                </div>
                <p className="text-white text-sm font-medium">News Agent</p>
                <p className="text-white/40 text-xs mt-0.5">Neural render pipeline</p>
              </div>
              <div className="liquid-glass rounded-3xl p-5">
                <div className="liquid-glass w-9 h-9 rounded-xl flex items-center justify-center mb-3">
                  <ShieldAlert size={16} className="text-white/50" />
                </div>
                <p className="text-white text-sm font-medium">Watchlist Agent</p>
                <p className="text-white/40 text-xs mt-0.5">Species + cultivar library</p>
              </div>
            </div>

            <div className="liquid-glass rounded-2xl p-3 flex items-center gap-4 hover:bg-white/5 transition-colors cursor-pointer">
              <div className="shrink-0">
                <MiniGlobe />
              </div>
              <div className="flex-1">
                <p className="text-white text-sm font-medium">Supply Chain Globe</p>
                <p className="text-white/40 text-xs mt-0.5">Interactive 3D risk mapping</p>
              </div>
              <div className="liquid-glass w-8 h-8 rounded-full flex items-center justify-center text-white/50 shrink-0">
                <ChevronRight size={14} />
              </div>
            </div>
          </div>

          <div className="liquid-glass rounded-2xl p-3 flex items-center gap-3 hover:bg-white/5 transition-colors cursor-pointer">
            <div className="liquid-glass w-8 h-8 rounded-xl flex items-center justify-center shrink-0">
              <BarChart3 size={13} className="text-white/50" />
            </div>
            <div className="flex-1">
              <p className="text-white text-xs font-medium">Analytics Dashboard</p>
              <p className="text-white/35 text-[10px]">Regional trends and risk analysis</p>
            </div>
            <ChevronRight size={12} className="text-white/30" />
          </div>

        </motion.div>
      </div>
    </div>
  );
}
