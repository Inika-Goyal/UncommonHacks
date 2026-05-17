"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { ChevronDown, Loader2 } from "lucide-react";

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

const AGENT_PILLS = [
  { id: "news", label: "News Agent" },
  { id: "watch", label: "Watchlist" },
  { id: "supplier", label: "Supplier" },
  { id: "legal", label: "Legal" },
  { id: "risk", label: "Risk Index" },
];

const REPORT_ROWS = [
  { label: "Company", value: "Shein" },
  { label: "Region", value: "China · Bangladesh · Turkey" },
  { label: "Risk Score", value: "4.7 / 5.0" },
  { label: "Severity", value: "Critical" },
];

const FLAG_ROWS = [
  { label: "Watchlist Hits", colored: "3 entities flagged", rest: " — UFLPA", color: "#93c5fd" },
  { label: "News Incidents", colored: "7 in last 90 days", rest: "", color: "#e5e7eb" },
  { label: "ILO Complaints", colored: "2 active filings", rest: "", color: "#a7f3d0" },
  { label: "Suppliers", colored: "14 flagged", rest: " — Open Supply Hub", color: "#6DC8A0" },
];

const OUTPUT_ROWS = [
  { num: "01", text: "Risk report generated · 847 citations" },
  { num: "02", text: "Supply chain globe · 23 risk pins" },
  { num: "03", text: "Complaint letter · US DOL jurisdiction" },
];

const STATS = [
  { num: "49.6M", label: "People in modern slavery today", green: false },
  { num: "160M", label: "Children in child labour globally", green: false },
  { num: "$150B", label: "In illegal profits annually", green: true },
];

const MONO = "'DM Mono', 'Courier New', monospace";

// ── Typewriter — each character lands one at a time ──────────────────────────

function TypeWriter({ text, startDelay = 700 }: { text: string; startDelay?: number }) {
  const [displayed, setDisplayed] = useState("");
  const [active, setActive] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setActive(true);
      let i = 0;
      const id = setInterval(() => {
        i++;
        setDisplayed(text.slice(0, i));
        if (i >= text.length) {
          clearInterval(id);
          setTimeout(() => setDone(true), 900);
        }
      }, 55);
      return () => clearInterval(id);
    }, startDelay);
    return () => clearTimeout(t);
  }, [text, startDelay]);

  return (
    <>
      {displayed}
      <span
        aria-hidden
        style={{
          display: "inline-block",
          width: "3px",
          height: "0.78em",
          background: "#6DC8A0",
          marginLeft: "5px",
          verticalAlign: "text-bottom",
          opacity: done ? 0 : active ? 1 : 0,
          transition: done ? "opacity 0.5s ease" : "none",
          animation: active && !done ? "cursor-blink 0.65s step-end infinite" : "none",
        }}
      />
    </>
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
  const [navDark, setNavDark] = useState(false);

  useEffect(() => {
    const onScroll = () => setNavDark(window.scrollY > 80);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (showIntro) return <IntroScreen onComplete={() => setShowIntro(false)} />;

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
        body: JSON.stringify({ inputType: mode, query }),
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
    <>
      <style>{`
        @keyframes blink { 50% { opacity: 0; } }
        @keyframes cursor-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        @keyframes dot-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(109,200,160,0.5); }
          60% { box-shadow: 0 0 0 5px rgba(109,200,160,0); }
        }
        .ll-agent-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: #6DC8A0; flex-shrink: 0;
          animation: dot-pulse 2.2s ease-in-out infinite;
        }
        .ll-analyse-btn:hover { background: #fff !important; }
        .ll-region-row:hover {
          background: rgba(255,255,255,0.07) !important;
          color: white !important;
        }
      `}</style>

      <div
        style={{
          height: "100dvh",
          overflow: "hidden",
          position: "relative",
          fontFamily: "'DM Sans', system-ui, sans-serif",
          fontWeight: 300,
          color: "#ededed",
        }}
      >
        <VideoBackground />

        {/* Nav */}
        <nav
          style={{
            position: "fixed",
            top: 0, left: 0, right: 0,
            zIndex: 50,
            height: "64px",
            padding: "0 2rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: navDark ? "rgba(0,0,0,0.65)" : "transparent",
            backdropFilter: navDark ? "blur(20px)" : "none",
            WebkitBackdropFilter: navDark ? "blur(20px)" : "none",
            transition: "background 0.4s, backdrop-filter 0.4s",
          }}
        >
          <img src="/logo.svg" alt="LaborLens" style={{ height: "30px", width: "auto" }} />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              flexWrap: "wrap",
              justifyContent: "flex-end",
            }}
          >
            {AGENT_PILLS.map((a) => (
              <div
                key={a.id}
                style={{
                  borderRadius: "999px",
                  padding: "6px 14px",
                  border: "1px solid rgba(255,255,255,0.1)",
                  fontSize: "10px",
                  letterSpacing: "2.4px",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.45)",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                  fontWeight: 300,
                  background: "transparent",
                  boxShadow: "none",
                }}
              >
                <span className="ll-agent-dot" />
                {a.label}
              </div>
            ))}
          </div>
        </nav>

        {/* Main — vertically centered between nav and stats bar */}
        <div
          style={{
            position: "relative",
            zIndex: 10,
            height: "100dvh",
            paddingTop: "64px",
            paddingBottom: "112px",
            display: "flex",
            alignItems: "center",
          }}
        >
          <div
            style={{
              maxWidth: "1400px",
              margin: "0 auto",
              width: "100%",
              padding: "0 64px",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "60px",
              alignItems: "center",
            }}
          >
            {/* ── LEFT — stat + quote + search ── */}
            <motion.div
              initial={{ opacity: 0, x: -24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.75, ease: "easeOut" }}
            >
              {/* Stat — single line typewriter */}
              <div
                style={{
                  fontFamily: "'DM Serif Display', Georgia, serif",
                  fontStyle: "normal",
                  fontSize: "clamp(64px, 8.5vw, 108px)",
                  lineHeight: 1,
                  whiteSpace: "nowrap",
                  marginBottom: "0",
                }}
              >
                <span style={{ color: "#6DC8A0" }}>
                  <TypeWriter text="49.6" startDelay={500} />
                </span>
                <span style={{ color: "rgba(255,255,255,0.88)", marginLeft: "0.2em" }}>
                  million
                </span>
              </div>

              <p
                style={{
                  fontSize: "10px",
                  letterSpacing: "2px",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.2)",
                  marginTop: "10px",
                  marginBottom: "32px",
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                  fontWeight: 300,
                }}
              >
                — Walk Free Global Slavery Index, 2023
              </p>

              {/* Rule */}
              <div
                style={{
                  width: "40px",
                  height: "1px",
                  background: "rgba(109,200,160,0.4)",
                  marginBottom: "28px",
                }}
              />

              {/* Quote */}
              <p
                style={{
                  fontFamily: "'DM Serif Display', Georgia, serif",
                  fontStyle: "italic",
                  fontSize: "clamp(22px, 2.5vw, 32px)",
                  color: "rgba(255,255,255,0.85)",
                  lineHeight: 1.35,
                  maxWidth: "460px",
                  marginBottom: "12px",
                }}
              >
                "Visibility should not determine protection."
              </p>

              {/* Subtext */}
              <p
                style={{
                  fontSize: "13px",
                  lineHeight: 1.8,
                  color: "rgba(255,255,255,0.4)",
                  maxWidth: "400px",
                  marginBottom: "40px",
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                  fontWeight: 300,
                }}
              >
                Enter a company or region. Five specialist agents pull news, watchlists,
                supplier disclosures and country-risk data into one cited report — in
                minutes, not weeks.
              </p>

              {/* Search */}
              <div style={{ maxWidth: "400px" }}>
                {/* Tab toggle */}
                <div
                  className="ll-glass"
                  style={{ display: "flex", gap: "3px", borderRadius: "10px", padding: "3px", marginBottom: "8px" }}
                >
                  {(["company", "region"] as InputMode[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => setMode(m)}
                      style={{
                        flex: 1,
                        padding: "7px 0",
                        borderRadius: "8px",
                        border: "none",
                        background: mode === m ? "rgba(255,255,255,0.11)" : "transparent",
                        color: mode === m ? "white" : "rgba(255,255,255,0.32)",
                        fontSize: "10px",
                        letterSpacing: "3px",
                        fontFamily: "'DM Sans', system-ui, sans-serif",
                        fontWeight: 300,
                        cursor: "pointer",
                        textTransform: "uppercase",
                        transition: "all 0.2s",
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
                    className="ll-input"
                    style={{ marginBottom: "8px" }}
                  />
                ) : (
                  <div style={{ position: "relative", marginBottom: "8px" }}>
                    <button
                      onClick={() => setShowRegionMenu((v) => !v)}
                      style={{
                        width: "100%",
                        background: "rgba(255,255,255,0.05)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: "12px",
                        padding: "12px 16px",
                        color: region ? "white" : "rgba(255,255,255,0.25)",
                        fontSize: "13px",
                        fontFamily: "'DM Sans', system-ui, sans-serif",
                        fontWeight: 300,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        cursor: "pointer",
                        boxSizing: "border-box",
                      }}
                    >
                      <span>{region || "Select a geographic region"}</span>
                      <ChevronDown
                        size={13}
                        style={{
                          color: "rgba(255,255,255,0.3)",
                          transform: showRegionMenu ? "rotate(180deg)" : "none",
                          transition: "transform 0.2s",
                        }}
                      />
                    </button>
                    {showRegionMenu && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="ll-glass"
                        style={{
                          position: "absolute",
                          top: "calc(100% + 4px)",
                          left: 0,
                          right: 0,
                          borderRadius: "12px",
                          overflow: "hidden",
                          zIndex: 30,
                        }}
                      >
                        {REGIONS.map((r) => (
                          <button
                            key={r}
                            className="ll-region-row"
                            onClick={() => { setRegion(r); setShowRegionMenu(false); }}
                            style={{
                              width: "100%",
                              textAlign: "left",
                              padding: "10px 16px",
                              fontSize: "12px",
                              color: "rgba(255,255,255,0.65)",
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              fontFamily: "'DM Sans', system-ui, sans-serif",
                              fontWeight: 300,
                              transition: "background 0.15s, color 0.15s",
                            }}
                          >
                            {r}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </div>
                )}

                <button
                  className="ll-analyse-btn"
                  onClick={handleSubmit}
                  disabled={!isValid || loading}
                  style={{
                    width: "100%",
                    padding: "14px 32px",
                    borderRadius: "10px",
                    border: "none",
                    background: isValid && !loading ? "#6DC8A0" : "rgba(255,255,255,0.07)",
                    color: isValid && !loading ? "#000" : "rgba(255,255,255,0.22)",
                    fontSize: "11px",
                    letterSpacing: "3px",
                    textTransform: "uppercase",
                    fontFamily: "'DM Sans', system-ui, sans-serif",
                    fontWeight: 500,
                    cursor: isValid && !loading ? "pointer" : "not-allowed",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    transition: "background 0.2s, color 0.2s",
                  }}
                >
                  {loading ? (
                    <>
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      >
                        <Loader2 size={13} />
                      </motion.div>
                      Launching Agent Swarm…
                    </>
                  ) : (
                    "ANALYSE"
                  )}
                </button>

                {error && (
                  <p style={{ color: "rgba(239,68,68,0.8)", fontSize: "11px", marginTop: "8px" }}>
                    {error}
                  </p>
                )}
              </div>
            </motion.div>

            {/* ── RIGHT — agent pills + glass terminal ── */}
            <motion.div
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.75, delay: 0.12, ease: "easeOut" }}
            >
              {/* Glass terminal card */}
              <div
                style={{
                  borderRadius: "28px",
                  backdropFilter: "none",
                  WebkitBackdropFilter: "none",
                  background: "transparent",
                  boxShadow: "none",
                  border: "1px solid rgba(255,255,255,0.14)",
                  overflow: "hidden",
                  minHeight: "548px",
                }}
              >
                {/* Terminal body */}
                <div
                  style={{
                    padding: "30px 30px 28px",
                    fontFamily: MONO,
                    fontSize: "12px",
                    lineHeight: 1.65,
                    background: "transparent",
                  }}
                >
                  {/* Main info */}
                  <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: "7px 20px" }}>
                    {REPORT_ROWS.flatMap(({ label, value }) => [
                      <span key={`${label}-l`} style={{ color: "rgba(255,255,255,0.34)" }}>{label}</span>,
                      <span key={`${label}-v`} style={{ color: "rgba(255,255,255,0.9)" }}>{value}</span>,
                    ])}
                  </div>

                  <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", margin: "14px 0" }} />

                  {/* Flags */}
                  <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: "7px 20px" }}>
                    {FLAG_ROWS.flatMap(({ label, colored, rest, color }) => [
                      <span key={`${label}-l`} style={{ color: "rgba(255,255,255,0.34)" }}>{label}</span>,
                      <span key={`${label}-v`} style={{ color: "rgba(255,255,255,0.88)" }}>
                        <span style={{ color }}>{colored}</span>{rest}
                      </span>,
                    ])}
                  </div>

                  <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", margin: "14px 0" }} />

                  {/* Output lines */}
                  <div style={{ display: "grid", gridTemplateColumns: "28px 1fr", gap: "7px 16px" }}>
                    {OUTPUT_ROWS.flatMap(({ num, text }) => [
                      <span key={`${num}-n`} style={{ color: "rgba(255,255,255,0.24)" }}>{num}</span>,
                      <span key={`${num}-t`} style={{ color: "#6DC8A0" }}>{text}</span>,
                    ])}
                  </div>

                  <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", margin: "14px 0" }} />

                  {/* Total time */}
                  <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: "7px 20px", alignItems: "center" }}>
                    <span style={{ color: "rgba(255,255,255,0.34)" }}>Total time</span>
                    <span style={{ color: "#6DC8A0", fontSize: "14px", fontWeight: 500 }}>
                      4 min 12 sec
                      <span style={{ animation: "blink 1s step-end infinite", marginLeft: "2px", fontWeight: 300 }}>|</span>
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>

        {/* ── Bottom stats bar ── */}
        <div
          style={{
            position: "absolute",
            bottom: 0, left: 0, right: 0,
            zIndex: 20,
            borderTop: "1px solid rgba(255,255,255,0.06)",
            background: "rgba(0,0,0,0.5)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)" }}>
            {STATS.map(({ num, label, green }, i) => (
              <div
                key={label}
                style={{
                  padding: "18px 48px",
                  borderRight: i < 2 ? "1px solid rgba(255,255,255,0.06)" : "none",
                }}
              >
                <div
                  style={{
                    fontFamily: "'DM Serif Display', Georgia, serif",
                    fontSize: "26px",
                    color: green ? "#6DC8A0" : "#fff",
                    lineHeight: 1,
                  }}
                >
                  {num}
                </div>
                <div
                  style={{
                    fontSize: "10px",
                    letterSpacing: "3px",
                    textTransform: "uppercase",
                    color: "rgba(255,255,255,0.28)",
                    marginTop: "5px",
                    fontFamily: "'DM Sans', system-ui, sans-serif",
                    fontWeight: 300,
                  }}
                >
                  {label}
                </div>
              </div>
            ))}
          </div>
          <div
            style={{
              textAlign: "center",
              paddingBottom: "10px",
              fontSize: "10px",
              letterSpacing: "3px",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.13)",
              fontFamily: "'DM Sans', system-ui, sans-serif",
              fontWeight: 300,
            }}
          >
            Built for the 49.6 million.
          </div>
        </div>
      </div>
    </>
  );
}
