"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Building2,
  FileText,
  Globe2,
  Loader2,
  MapPinned,
  Search,
  ShieldAlert,
} from "lucide-react";

import type { InputType } from "@/lib/report-types";

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

const EXAMPLES = {
  company: "Shein",
  region: "Cambodia garment sector",
} satisfies Record<InputType, string>;

export default function LandingPage() {
  const router = useRouter();
  const [inputType, setInputType] = useState<InputType>("company");
  const [query, setQuery] = useState(EXAMPLES.company);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function selectInputType(nextType: InputType) {
    setInputType(nextType);
    setQuery(EXAMPLES[nextType]);
    setSubmitError(null);
  }

  async function submitInvestigation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanQuery = query.trim();
    if (!cleanQuery || isSubmitting) return;

    setSubmitError(null);

    if (DEMO_MODE) {
      router.push(`/dashboard?mode=${inputType}&query=${encodeURIComponent(cleanQuery)}`);
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inputType,
          query: cleanQuery,
          industry: "Apparel",
          countries: [],
          timeWindowMonths: 12,
          reporterPersona: "NGO",
          outputGoal: "complaint",
        }),
      });
      const payload = (await response.json()) as
        | { ok: true; reportId: string }
        | { ok: false; error: string };

      if (!payload.ok) {
        setSubmitError(payload.error);
        return;
      }

      router.push(`/dashboard?id=${payload.reportId}`);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Failed to start investigation.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="evidence-page">
      <HeroVideo />

      <header className="evidence-nav">
        <Link className="evidence-brand" href="/" aria-label="UnExploited home">
          <EvidenceMark size={28} />
          <span>UnExploited</span>
        </Link>
        <Link className="evidence-nav-link" href="/dashboard?mode=company&query=Shein">
          Open dashboard
          <ArrowRight aria-hidden="true" size={15} />
        </Link>
      </header>

      <section className="evidence-hero" aria-labelledby="landing-title">
        <div className="evidence-title-block">
          <p className="evidence-kicker">Dark documentary intelligence</p>
          <h1 id="landing-title">Evidence-backed exploitation reports</h1>
          <p>
            Turn public fragments into cited labor-risk briefs, source posture, geographic
            signals, and complaint-ready drafts.
          </p>
        </div>

        <div className="evidence-halo-stage">
          <div className="evidence-orbit evidence-orbit-outer" aria-hidden="true" />
          <div className="evidence-orbit evidence-orbit-middle" aria-hidden="true" />
          <div className="evidence-orbit evidence-orbit-tilt" aria-hidden="true" />
          <EvidenceFragment className="evidence-fragment-left" />
          <ReportFragment className="evidence-fragment-right" />

          <form className="evidence-search glass-shell" onSubmit={submitInvestigation}>
            <div className="evidence-lockup" aria-hidden="true">
              <EvidenceMark size={30} />
              <span>UnExploited</span>
            </div>

            <div className="evidence-tabs" aria-label="Investigation target type">
              <button
                className={inputType === "company" ? "evidence-tab evidence-tab-active" : "evidence-tab"}
                type="button"
                onClick={() => selectInputType("company")}
              >
                <Building2 aria-hidden="true" size={15} />
                Company
              </button>
              <button
                className={inputType === "region" ? "evidence-tab evidence-tab-active" : "evidence-tab"}
                type="button"
                onClick={() => selectInputType("region")}
              >
                <MapPinned aria-hidden="true" size={15} />
                Region
              </button>
            </div>

            <label className="evidence-field" htmlFor="landing-query">
              <span>Investigation target</span>
              <div className="evidence-input-shell">
                <Search aria-hidden="true" size={17} />
                <input
                  id="landing-query"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={inputType === "company" ? "Shein, Nike, H&M" : "Cambodia garment sector"}
                />
              </div>
            </label>

            <button className="evidence-submit glass-shell" type="submit" disabled={!query.trim() || isSubmitting}>
              {isSubmitting ? <Loader2 aria-hidden="true" className="spin-icon" size={15} /> : <Search aria-hidden="true" size={15} />}
              {isSubmitting ? "Starting investigation" : "Analyse target"}
            </button>

            {submitError ? <p className="evidence-error">{submitError}</p> : null}
            <p className="evidence-note">Public data sources only. Not legal advice.</p>
          </form>
        </div>

        <div className="evidence-flow" aria-label="Core workflow">
          <span>
            <ShieldAlert aria-hidden="true" size={17} />
            Score exploitation risk
          </span>
          <span>
            <Globe2 aria-hidden="true" size={17} />
            Map source signals
          </span>
          <span>
            <FileText aria-hidden="true" size={17} />
            Generate complaint PDF
          </span>
        </div>

        <div className="evidence-demo">
          <p>Demo paths</p>
          <div>
            <Link className="glass-shell" href="/dashboard?mode=company&query=Shein">
              Shein company brief
            </Link>
            <Link className="glass-shell" href="/dashboard?mode=region&query=Cambodia%20garment%20sector">
              Cambodia region brief
            </Link>
          </div>
        </div>
      </section>

      <footer className="evidence-footer">
        <span>Source-backed triage for labor-rights investigations.</span>
        <span>Uses public sources and labeled demo fixtures.</span>
      </footer>
    </main>
  );
}

function HeroVideo() {
  return (
    <div className="evidence-video" aria-hidden="true">
      <video src="/media/unexploited-investigation-hero.mp4" autoPlay muted loop playsInline />
      <div className="evidence-video-grade" />
      <div className="evidence-grain" />
      <div className="evidence-scanline evidence-scanline-one" />
      <div className="evidence-scanline evidence-scanline-two" />
    </div>
  );
}

function EvidenceFragment({ className }: { className: string }) {
  return (
    <aside className={`evidence-fragment paper-fragment ${className}`} aria-hidden="true">
      <p>Source fragment</p>
      <div className="paper-line paper-line-short" />
      <div className="paper-line" />
      <div className="paper-copy">
        Worker testimony references <span /> and recruitment-fee pressure.
      </div>
      <dl>
        <div>
          <dt>Geography</dt>
          <dd>Southeast Asia</dd>
        </div>
        <div>
          <dt>Citation</dt>
          <dd>Attached</dd>
        </div>
      </dl>
    </aside>
  );
}

function ReportFragment({ className }: { className: string }) {
  return (
    <aside className={`evidence-fragment report-fragment glass-shell ${className}`} aria-hidden="true">
      <p>Report output</p>
      <h2>Complaint draft generated from cited findings</h2>
      <div className="source-row-mini">
        <span>UFLPA</span>
        <strong>Snapshot</strong>
      </div>
      <div className="source-row-mini">
        <span>Open Supply Hub</span>
        <strong>Ready</strong>
      </div>
      <div className="source-row-mini">
        <span>ILO NORMLEX</span>
        <strong>Queued</strong>
      </div>
    </aside>
  );
}

function EvidenceMark({ size = 28 }: { size?: number }) {
  return (
    <svg className="evidence-mark" width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="16" r="15" stroke="currentColor" strokeOpacity="0.52" strokeWidth="1.2" />
      <circle cx="16" cy="16" r="6" fill="currentColor" fillOpacity="0.08" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1" />
      <path d="M23 16h6M19.5 22.1l3 5.2M12.5 22.1l-3 5.2M9 16H3M12.5 9.9l-3-5.2M19.5 9.9l3-5.2" stroke="currentColor" strokeOpacity="0.42" strokeWidth="1" />
      <circle cx="16" cy="16" r="2" fill="currentColor" />
    </svg>
  );
}
