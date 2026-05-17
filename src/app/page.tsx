"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { ChevronDown, Loader2, Search } from "lucide-react";

import { VideoBackground } from "@/components/video-background";
import { LandingFooter } from "@/components/landing-footer";
import { LuminaLogo } from "@/components/lumina-brand";

type InputMode = "company" | "region";

const REGIONS = [
  "South & Southeast Asia",
  "East Asia",
  "Sub-Saharan Africa",
  "Latin America",
  "Eastern Europe",
  "Middle East & North Africa",
];

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

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
      if (DEMO_MODE) {
        router.push(`/dashboard?mode=${mode}&query=${encodeURIComponent(query)}`);
        return;
      }

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
    <div className="lumina-shell relative min-h-screen flex flex-col">
      <VideoBackground />

      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: "easeOut" }}
          className="w-full max-w-lg"
        >
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.8 }}
            className="text-center mb-8"
          >
            <div className="flex items-center justify-center gap-3 mb-4">
              <LuminaLogo size={28} />
              <span className="text-white text-3xl tracking-[0.35em] uppercase font-light">
                LUMINA
              </span>
            </div>
            <p className="text-white/50 text-sm tracking-wide">
              Labour Exploitation Intelligence Platform
            </p>
          </motion.div>

          <div className="liquid-glass rounded-3xl p-7">
            <div className="flex gap-1 bg-white/5 rounded-2xl p-1 mb-6">
              {(["company", "region"] as InputMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className="flex-1 py-2 rounded-xl text-sm transition-all duration-200"
                  style={{
                    background: mode === m ? "rgba(255,255,255,0.12)" : "transparent",
                    color: mode === m ? "white" : "rgba(255,255,255,0.4)",
                  }}
                >
                  {m === "company" ? "Company" : "Region"}
                </button>
              ))}
            </div>

            {mode === "company" ? (
              <div className="relative mb-4">
                <input
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                  placeholder="Enter company name (e.g. Shein, Nike, H&M)"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-white placeholder:text-white/30 text-sm outline-none focus:border-white/25 transition-colors pr-10"
                />
                <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/25" size={16} />
              </div>
            ) : (
              <div className="relative mb-4">
                <button
                  onClick={() => setShowRegionMenu((v) => !v)}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-sm flex items-center justify-between transition-colors hover:border-white/20"
                  style={{ color: region ? "white" : "rgba(255,255,255,0.3)" }}
                >
                  <span>{region || "Select a geographic region"}</span>
                  <ChevronDown
                    size={14}
                    className="text-white/30 transition-transform duration-200"
                    style={{ transform: showRegionMenu ? "rotate(180deg)" : "rotate(0deg)" }}
                  />
                </button>
                {showRegionMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="liquid-glass absolute top-full mt-1 left-0 right-0 rounded-2xl overflow-hidden z-20"
                  >
                    {REGIONS.map((r) => (
                      <button
                        key={r}
                        onClick={() => {
                          setRegion(r);
                          setShowRegionMenu(false);
                        }}
                        className="w-full text-left px-4 py-3 text-sm text-white/80 hover:text-white hover:bg-white/10 transition-colors"
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
              whileHover={isValid && !loading ? { scale: 1.02 } : {}}
              whileTap={isValid && !loading ? { scale: 0.98 } : {}}
              className="liquid-glass w-full py-3.5 rounded-2xl text-sm font-medium transition-all duration-300 flex items-center justify-center gap-2 mt-2"
              style={{
                color: isValid && !loading ? "white" : "rgba(255,255,255,0.3)",
                cursor: isValid && !loading ? "pointer" : "not-allowed",
              }}
            >
              {loading ? (
                <>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  >
                    <Loader2 size={15} />
                  </motion.div>
                  Launching Agent Swarm…
                </>
              ) : (
                <>
                  <Search size={15} />
                  Analyse {mode === "company" ? "Company" : "Region"}
                </>
              )}
            </motion.button>

            {error ? (
              <p className="text-red-300/80 text-xs text-center mt-3">{error}</p>
            ) : null}

            <p className="text-white/20 text-xs text-center mt-4">
              Analysis uses public data sources only. Not legal advice.
            </p>
          </div>
        </motion.div>
      </main>

      <LandingFooter />
    </div>
  );
}
