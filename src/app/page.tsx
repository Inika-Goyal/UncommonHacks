import { ArrowRight, FileText, Globe2, ShieldAlert } from "lucide-react";
import Link from "next/link";

import { SearchForm } from "@/components/search-form";

export default function Home() {
  return (
    <main className="landing-page">
      <header className="landing-nav">
        <Link className="brand-mark" href="/">
          <span className="brand-symbol">E</span>
          UnExploited
        </Link>
        <Link className="text-link" href="/dashboard?mode=company&query=Shein">
          Open dashboard
          <ArrowRight aria-hidden="true" size={15} />
        </Link>
      </header>

      <section className="landing-hero">
        <div className="hero-copy">
          <p className="eyebrow">Hackathon MVP</p>
          <h1>Evidence-backed exploitation reports in one pass.</h1>
          <p>
            Enter a company or region, inspect cited risk signals, map geographic exposure, and draft a formal
            complaint letter from the same report.
          </p>
        </div>
        <SearchForm />
      </section>

      <section className="landing-strip" aria-label="MVP flow">
        <div>
          <ShieldAlert aria-hidden="true" size={22} />
          <span>Score exploitation risk</span>
        </div>
        <div>
          <Globe2 aria-hidden="true" size={22} />
          <span>Map source signals</span>
        </div>
        <div>
          <FileText aria-hidden="true" size={22} />
          <span>Generate complaint PDF</span>
        </div>
      </section>

      <section className="sample-section">
        <div>
          <p className="eyebrow">Demo paths</p>
          <h2>Use the two spec-approved arcs.</h2>
        </div>
        <div className="sample-actions">
          <Link className="secondary-button" href="/dashboard?mode=company&query=Shein">
            Shein company brief
          </Link>
          <Link className="secondary-button" href="/dashboard?mode=region&query=Cambodia%20garment%20sector">
            Cambodia region brief
          </Link>
        </div>
      </section>
    </main>
  );
}
