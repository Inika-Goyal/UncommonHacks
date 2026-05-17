"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  ShieldAlert,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { SearchForm } from "@/components/search-form";
import { ElevenLabsReportAgent } from "@/components/elevenlabs-report-agent";
import { ScoreScrambler } from "@/components/score-scrambler";
import { WorldGlobe } from "@/components/world-globe";
import type { InputType, Report, ReportResponse, SourceStatus } from "@/lib/report-types";

type ReportDashboardProps = {
  initialInputType: InputType;
  initialQuery: string;
  reportId?: string;
};

const sourceStatusLabel = {
  ready: "Live",
  snapshot: "Live",
  blocked: "Blocked",
  pending: "Pending",
} satisfies Record<SourceStatus, string>;

function displayStatus(status: SourceStatus): SourceStatus {
  return status === "snapshot" ? "ready" : status;
}

type Mode = "demo" | "supabase" | null;

export function ReportDashboard({ initialInputType, initialQuery, reportId }: ReportDashboardProps) {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let aborted = false;

    async function loadById(id: string) {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/reports/${id}`);
        const payload = (await response.json()) as ReportResponse;
        if (aborted) return;
        if (!payload.ok) {
          setError(payload.error);
          return;
        }
        setReport(payload.report);
        setMode(payload.mode);
      } catch (err) {
        if (aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load report.");
      } finally {
        if (!aborted) setIsLoading(false);
      }
    }

    async function loadDemo() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/reports", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ inputType: initialInputType, query: initialQuery }),
        });
        const payload = (await response.json()) as ReportResponse;
        if (aborted) return;
        if (!payload.ok) {
          setReport(null);
          setMode(null);
          setError(payload.error);
          return;
        }
        setReport(payload.report);
        setMode(payload.mode);
      } catch (requestError) {
        if (aborted) return;
        setReport(null);
        setMode(null);
        setError(requestError instanceof Error ? requestError.message : "Report generation failed.");
      } finally {
        if (!aborted) setIsLoading(false);
      }
    }

    if (reportId) {
      void loadById(reportId);
    } else {
      void loadDemo();
    }

    return () => {
      aborted = true;
    };
  }, [reportId, initialInputType, initialQuery]);

  const pdfHref = useMemo(() => {
    if (!report) return "#";
    return `/api/reports/${report.id}/complaint.pdf`;
  }, [report]);

  const modeLabel =
    mode === "demo" ? "Demo fixtures" : mode === "supabase" ? "Live · ready" : "Loading";

  return (
    <main className="dashboard-page">
      <header className="app-topbar">
        <Link className="brand-mark" href="/">
          <span className="brand-symbol">E</span>
          UnExploited
        </Link>
        <div className="topbar-status">
          <span className={mode === "demo" ? "status-pill status-snapshot" : "status-pill"}>
            {modeLabel}
          </span>
        </div>
      </header>

      <section className="dashboard-grid">
        <aside className="control-panel">
          <div>
            <p className="eyebrow">Investigation</p>
            <h1>Report workspace</h1>
            <p className="muted-copy">
              Company and region modes share the same report contract, so later sources can plug into one flow.
            </p>
          </div>
          <SearchForm compact initialInputType={initialInputType} initialQuery={initialQuery} />
          {report ? <ElevenLabsReportAgent report={report} mode={mode ?? "demo"} /> : null}
          <div className="panel benchmark-panel">
            <p className="eyebrow">Benchmark</p>
            <h2>Demo comparison target needed</h2>
            <p>
              Pick one real NGO report, such as Verite, WRC, or FLA, then place it here beside the generated
              report during the final video.
            </p>
          </div>
        </aside>

        <section className="report-panel">
          {isLoading && !report ? <DashboardLoading /> : null}
          {error ? <DashboardError message={error} /> : null}

          {report ? (
            <>
              <div className="report-header panel">
                <div>
                  <p className="eyebrow">
                    {report.inputType === "company" ? "Company report" : "Region report"}
                  </p>
                  <h2>{report.title}</h2>
                  <p>{report.summary}</p>
                </div>
                <a className="secondary-button" href={pdfHref}>
                  <Download aria-hidden="true" size={16} />
                  Complaint PDF
                </a>
              </div>

              <div className="score-grid">
                <ScoreBlock label="Overall risk" value={report.overallRisk} suffix="/100" tone="danger" />
                <ScoreBlock label="Severity" value={report.severity} suffix="/5" tone="warning" />
                <ScoreBlock label="Credibility" value={report.credibility} suffix="/5" tone="info" />
              </div>

              <div className="dashboard-content-grid">
                <section className="panel map-panel">
                  <div className="panel-heading">
                    <div>
                      <p className="eyebrow">Geography</p>
                      <h2>Signal map</h2>
                    </div>
                    <ShieldAlert aria-hidden="true" size={20} />
                  </div>
                  <WorldGlobe points={report.mapPoints} />
                </section>

                <section className="panel source-panel">
                  <div className="panel-heading">
                    <div>
                      <p className="eyebrow">Sources</p>
                      <h2>Access status</h2>
                    </div>
                    <CheckCircle2 aria-hidden="true" size={20} />
                  </div>
                  <div className="source-list">
                    {report.sourceChecks.map((source) => (
                      <div key={source.name} className="source-row">
                        <div>
                          <strong>{source.name}</strong>
                          <p>{source.detail}</p>
                        </div>
                        <span className={`status-pill status-${displayStatus(source.status)}`}>
                          {sourceStatusLabel[source.status]}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              <section className="panel findings-panel">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">Evidence</p>
                    <h2>Cited findings</h2>
                  </div>
                  <FileText aria-hidden="true" size={20} />
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Signal</th>
                        <th>Geography</th>
                        <th>Score</th>
                        <th>Evidence</th>
                        <th>Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.findings.map((finding) => (
                        <tr key={finding.id}>
                          <td>{finding.signal}</td>
                          <td>{finding.geography}</td>
                          <td>
                            S{finding.severity} / C{finding.credibility}
                          </td>
                          <td>{finding.evidence}</td>
                          <td>
                            {finding.citations.map((citation) => (
                              <a key={citation.url} href={citation.url} target="_blank" rel="noreferrer">
                                {citation.label}
                                <ExternalLink aria-hidden="true" size={13} />
                              </a>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="panel action-panel">
                <div>
                  <p className="eyebrow">Recommended action</p>
                  <h2>{report.recommendedAction}</h2>
                  <p>{report.sourceNote}</p>
                </div>
                <a className="primary-button" href={pdfHref}>
                  <Download aria-hidden="true" size={16} />
                  Generate letter
                </a>
              </section>
            </>
          ) : null}
        </section>
      </section>
    </main>
  );
}

function DashboardLoading() {
  return (
    <div className="panel loading-panel">
      <Loader2 aria-hidden="true" className="spin-icon" size={24} />
      <div>
        <h2>Loading report</h2>
        <p>Fetching the persisted findings from Supabase.</p>
      </div>
    </div>
  );
}

function DashboardError({ message }: { message: string }) {
  return (
    <div className="panel error-panel" role="alert">
      <AlertTriangle aria-hidden="true" size={24} />
      <div>
        <h2>Report load failed</h2>
        <p>{message}</p>
      </div>
    </div>
  );
}

function ScoreBlock({
  label,
  value,
  suffix,
  tone,
}: {
  label: string;
  value: number;
  suffix: string;
  tone: "danger" | "warning" | "info";
}) {
  return (
    <div className={`score-block score-${tone}`}>
      <span>{label}</span>
      <strong>
        <ScoreScrambler value={value} />
        {suffix}
      </strong>
    </div>
  );
}
