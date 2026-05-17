"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { ChevronDown, Loader2, Search } from "lucide-react";

import { VideoBackground } from "@/components/video-background";
import { LandingFooter } from "@/components/landing-footer";
import { LaborLensLogo } from "@/components/laborlens-brand";

type InputMode = "company" | "region";

const REGIONS = [
  "South & Southeast Asia",
  "East Asia",
  "Sub-Saharan Africa",
  "Latin America",
  "Eastern Europe",
  "Middle East & North Africa",
];

export default function LandingPage() {
  const router = useRouter();
  const [mode, setMode] = useState<InputMode>("company");
  const [company, setCompany] = useState("");
  const [region, setRegion] = useState("");
  const [showRegionMenu, setShowRegionMenu] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <div className="laborlens-shell relative min-h-screen overflow-hidden">
      <VideoBackground />

      <div className="relative z-10 flex min-h-screen gap-6">
        {/* ── LEFT PANEL ── */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="w-[52%] shrink-0 relative min-h-screen"
        >
          {/* glass overlay sits inside the margin */}
          <div className="liquid-glass-strong m-6 rounded-3xl flex flex-col">
            {/* Nav */}
            <div className="flex items-center justify-between px-7 pt-7">
              <div className="flex items-center gap-3">
                <LaborLensLogo size={24} />
                <span className="text-white text-lg tracking-[0.35em] uppercase font-light">
                  LABORLENS
                </span>
              </div>
              <div className="liquid-glass flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-white/50 text-xs">
                Labour Exploitation Intelligence
              </div>
            </div>

            {/* Centre block — hero + search + pills, vertically centred */}
            <div className="flex-1 flex flex-col justify-center gap-7 px-7 py-8">
              {/* Badge */}
              <div className="flex justify-center">
                <div className="liquid-glass w-14 h-14 rounded-full flex items-center justify-center">
                  <div className="w-5 h-5 rounded-full bg-white/15 ring-1 ring-white/20" />
                </div>
              </div>

              {/* Hero */}
              <motion.h1
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25, duration: 0.8 }}
                className="text-white text-5xl font-semibold leading-[1.08] tracking-[-0.03em] text-center"
              >
                Surface exploitation.{' '}
                <span className="font-light opacity-70 italic">
                  Before it surfaces you.
                </span>
              </motion.h1>

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

        {/* ── RIGHT PANEL ── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.9, delay: 0.15 }}
          className="w-[48%] flex flex-col p-6 min-h-screen"
        >
          {/* Top bar */}
          <div className="flex items-center gap-3 mb-4">
            <div className="liquid-glass rounded-2xl px-4 py-2.5 flex items-center gap-4 flex-1 overflow-hidden">
              <span className="text-white/25 text-[10px] tracking-[0.18em] uppercase shrink-0">
                Agent Swarm — Ready
              </span>
              {['News', 'Watchlist', 'Supplier', 'Legal', 'Risk'].map((agent) => (
                <div key={agent} className="flex items-center gap-1.5 min-w-0">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                  </span>
                  <span className="text-white/55 text-xs truncate max-w-[7rem]">{agent}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Spacer — planet shows through here */}
          <div className="flex-1" />

          {/* Bottom link to dashboard */}
          <div className="liquid-glass rounded-2xl p-4 mb-3">
            <p className="text-white text-sm font-medium mb-2">Ready to Launch Analysis</p>
            <p className="text-white/40 text-xs mb-3">Complete your search to begin agent swarm investigation</p>
            <div className="text-white/20 text-xs text-center">
              Analysis uses public data sources only. Not legal advice.
            </div>
          </div>
        </motion.div>
      </div>

      <LandingFooter />
    </div>
  );
}
