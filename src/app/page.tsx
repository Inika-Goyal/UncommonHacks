"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import {
  ArrowRight,
  ChevronDown,
  FileText,
  Globe2,
  Loader2,
  Search,
  ShieldAlert,
} from "lucide-react";

import { VideoBackground } from "@/components/video-background";
import { LandingFooter } from "@/components/landing-footer";
import {
  INDUSTRIES,
  OUTPUT_GOALS,
  REPORTER_PERSONAS,
  TIME_WINDOW_MONTHS,
  type Industry,
  type OutputGoal,
  type ReporterPersona,
  type TimeWindowMonths,
} from "@/lib/onboarding-types";

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

  const [industry, setIndustry] = useState<Industry>("Apparel");
  const [timeWindowMonths, setTimeWindowMonths] = useState<TimeWindowMonths>(12);
  const [countries, setCountries] = useState<string[]>([]);
  const [countryDraft, setCountryDraft] = useState("");
  const [reporterPersona, setReporterPersona] = useState<ReporterPersona>("NGO");
  const [outputGoal, setOutputGoal] = useState<OutputGoal>("complaint");

  const isValid = mode === "company" ? company.trim().length > 0 : region.length > 0;

  function addCountry(value: string) {
    const trimmed = value.trim();
    if (!trimmed || countries.includes(trimmed)) {
      setCountryDraft("");
      return;
    }
    setCountries((prev) => [...prev, trimmed]);
    setCountryDraft("");
  }

  function removeCountry(country: string) {
    setCountries((prev) => prev.filter((c) => c !== country));
  }

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
          industry,
          countries,
          timeWindowMonths,
          reporterPersona,
          outputGoal,
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

      router.push(`/dashboard?id=${payload.reportId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start the swarm.");
      setLoading(false);
    }
  };

  return (
    <div className="lumina-shell relative min-h-screen flex flex-col">
      <VideoBackground />

      <header className="lumina-nav relative z-10 flex items-center justify-between px-6 md:px-10 py-5">
        <Link href="/" className="flex items-center gap-3 text-white">
          <LuminaLogo size={26} />
          <span className="text-base tracking-[0.32em] uppercase font-light">LUMINA</span>
        </Link>
        <Link
          href="/dashboard?mode=company&query=Shein"
          className="inline-flex items-center gap-2 text-white/70 hover:text-white text-sm transition-colors"
        >
          Open dashboard
          <ArrowRight size={15} />
        </Link>
      </header>

      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-10">
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

            {!DEMO_MODE ? (
              <div className="lumina-extras">
                <div className="lumina-extras-row">
                  <label className="lumina-field">
                    <span>Industry</span>
                    <select
                      value={industry}
                      onChange={(e) => setIndustry(e.target.value as Industry)}
                    >
                      {INDUSTRIES.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="lumina-field">
                    <span>Time window</span>
                    <select
                      value={timeWindowMonths}
                      onChange={(e) =>
                        setTimeWindowMonths(Number(e.target.value) as TimeWindowMonths)
                      }
                    >
                      {TIME_WINDOW_MONTHS.map((option) => (
                        <option key={option} value={option}>
                          Last {option} months
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="lumina-field">
                  <span>Countries to weight</span>
                  <div className="lumina-chip-input">
                    {countries.map((country) => (
                      <button
                        key={country}
                        type="button"
                        className="lumina-chip"
                        onClick={() => removeCountry(country)}
                      >
                        {country} <span aria-hidden>×</span>
                      </button>
                    ))}
                    <input
                      value={countryDraft}
                      onChange={(e) => setCountryDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === ",") {
                          e.preventDefault();
                          addCountry(countryDraft);
                        } else if (e.key === "Backspace" && !countryDraft && countries.length) {
                          setCountries((prev) => prev.slice(0, -1));
                        }
                      }}
                      onBlur={() => addCountry(countryDraft)}
                      placeholder="Add country, press Enter"
                    />
                  </div>
                </label>

                <fieldset className="lumina-fieldset">
                  <legend>Reporter persona</legend>
                  <div className="lumina-radio-row">
                    {REPORTER_PERSONAS.map((option) => (
                      <label
                        key={option}
                        className={
                          reporterPersona === option
                            ? "lumina-radio-chip lumina-radio-chip-active"
                            : "lumina-radio-chip"
                        }
                      >
                        <input
                          type="radio"
                          name="reporterPersona"
                          value={option}
                          checked={reporterPersona === option}
                          onChange={() => setReporterPersona(option)}
                        />
                        {option}
                      </label>
                    ))}
                  </div>
                </fieldset>

                <fieldset className="lumina-fieldset">
                  <legend>Output goal</legend>
                  <div className="lumina-radio-row">
                    {OUTPUT_GOALS.map((option) => (
                      <label
                        key={option}
                        className={
                          outputGoal === option
                            ? "lumina-radio-chip lumina-radio-chip-active"
                            : "lumina-radio-chip"
                        }
                      >
                        <input
                          type="radio"
                          name="outputGoal"
                          value={option}
                          checked={outputGoal === option}
                          onChange={() => setOutputGoal(option)}
                        />
                        {option === "complaint" ? "Labor-authority complaint" : "Compliance letter"}
                      </label>
                    ))}
                  </div>
                </fieldset>
              </div>
            ) : null}

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

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45, duration: 0.7 }}
            className="lumina-strip mt-8"
            aria-label="MVP flow"
          >
            <div>
              <ShieldAlert size={18} aria-hidden="true" />
              <span>Score exploitation risk</span>
            </div>
            <div>
              <Globe2 size={18} aria-hidden="true" />
              <span>Map source signals</span>
            </div>
            <div>
              <FileText size={18} aria-hidden="true" />
              <span>Generate complaint PDF</span>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.7 }}
            className="lumina-demo mt-6"
          >
            <p className="text-white/40 text-xs uppercase tracking-[0.25em] text-center mb-3">
              Demo paths
            </p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <Link
                href="/dashboard?mode=company&query=Shein"
                className="lumina-demo-btn liquid-glass"
              >
                Shein company brief
              </Link>
              <Link
                href="/dashboard?mode=region&query=Cambodia%20garment%20sector"
                className="lumina-demo-btn liquid-glass"
              >
                Cambodia region brief
              </Link>
            </div>
          </motion.div>
        </motion.div>
      </main>

      <LandingFooter />
    </div>
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
