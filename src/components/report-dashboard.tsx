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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { SearchForm } from "@/components/search-form";
import {
  ElevenLabsReportAgent,
  type DashboardSection,
  type ElevenLabsDashboardTools,
} from "@/components/elevenlabs-report-agent";
import { ScoreScrambler } from "@/components/score-scrambler";
import { WorldGlobe, type WorldGlobeHandle } from "@/components/world-globe";
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
  const [activeFindingId, setActiveFindingId] = useState<string | null>(null);
  const summaryRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<HTMLElement | null>(null);
  const sourcesRef = useRef<HTMLElement | null>(null);
  const findingsRef = useRef<HTMLElement | null>(null);
  const actionRef = useRef<HTMLElement | null>(null);
  const globeRef = useRef<WorldGlobeHandle | null>(null);
  const pdfLinkRef = useRef<HTMLAnchorElement | null>(null);

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

  const scrollElementIntoView = useCallback((element: HTMLElement) => {
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    element.focus({ preventScroll: true });
  }, []);

  const scrollToDashboardSection = useCallback(
    (section: DashboardSection) => {
      const sectionRefs: Record<DashboardSection, HTMLElement | null> = {
        summary: summaryRef.current,
        map: mapRef.current,
        sources: sourcesRef.current,
        findings: findingsRef.current,
        action: actionRef.current,
      };
      const element = sectionRefs[section];
      if (!element) {
        return `The ${section} section is not available yet.`;
      }
      scrollElementIntoView(element);
      return `Scrolled to the ${section} section.`;
    },
    [scrollElementIntoView],
  );

  const highlightFinding = useCallback(
    (findingId: string) => {
      if (!report) {
        return "No report is loaded yet.";
      }
      const finding = report.findings.find((candidate) => candidate.id === findingId);
      if (!finding) {
        return `Finding ${findingId} was not found in this report.`;
      }
      setActiveFindingId(finding.id);
      window.requestAnimationFrame(() => {
        const row = document.querySelector<HTMLElement>(`[data-finding-id="${CSS.escape(finding.id)}"]`);
        if (row) {
          scrollElementIntoView(row);
        }
      });
      return `Highlighted ${finding.signal}: severity ${finding.severity}/5, credibility ${finding.credibility}/5.`;
    },
    [report, scrollElementIntoView],
  );

  const focusMapPoint = useCallback(
    (pointId: string) => {
      if (!report) {
        return "No report is loaded yet.";
      }
      const point = report.mapPoints.find((candidate) => candidate.id === pointId);
      if (!point) {
        return `Map point ${pointId} was not found in this report.`;
      }
      scrollToDashboardSection("map");
      const focused = globeRef.current?.focusPoint(point.id) ?? false;
      return focused
        ? `Focused ${point.label} on the signal map.`
        : `The map is still loading, but ${point.label} is the requested point.`;
    },
    [report, scrollToDashboardSection],
  );

  const openComplaintLetter = useCallback(() => {
    if (!report || pdfHref === "#") {
      return "No complaint letter is available yet.";
    }
    const opened = window.open(pdfHref, "_blank", "noopener,noreferrer");
    if (!opened) {
      pdfLinkRef.current?.click();
      return "Opening the complaint letter using the dashboard link.";
    }
    return "Opening the complaint letter PDF.";
  }, [pdfHref, report]);

  const voiceTools = useMemo<ElevenLabsDashboardTools>(
    () => ({
      highlightFinding,
      focusMapPoint,
      scrollToDashboardSection,
      openComplaintLetter,
    }),
    [focusMapPoint, highlightFinding, openComplaintLetter, scrollToDashboardSection],
  );

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
              <div
                ref={summaryRef}
                className="report-header panel"
                data-dashboard-section="summary"
                tabIndex={-1}
              >
                <div>
                  <p className="eyebrow">
                    {report.inputType === "company" ? "Company report" : "Region report"}
                  </p>
                  <h2>{report.title}</h2>
                  <p>{report.summary}</p>
                </div>
                <div className="report-header-actions">
                  <a ref={pdfLinkRef} className="secondary-button" href={pdfHref}>
                    <Download aria-hidden="true" size={16} />
                    Complaint PDF
                  </a>
                  <ElevenLabsReportAgent report={report} mode={mode ?? "demo"} pdfHref={pdfHref} tools={voiceTools} />
                </div>
              </div>

              <div className="score-grid">
                <ScoreBlock label="Overall risk" value={report.overallRisk} suffix="/100" tone="danger" />
                <ScoreBlock label="Severity" value={report.severity} suffix="/5" tone="warning" />
                <ScoreBlock label="Credibility" value={report.credibility} suffix="/5" tone="info" />
              </div>

              <div className="dashboard-content-grid">
                <section ref={mapRef} className="panel map-panel" data-dashboard-section="map" tabIndex={-1}>
                  <div className="panel-heading">
                    <div>
                      <p className="eyebrow">Geography</p>
                      <h2>Signal map</h2>
                    </div>
                    <ShieldAlert aria-hidden="true" size={20} />
                  </div>
                  <WorldGlobe ref={globeRef} points={report.mapPoints} />
                </section>

                <section ref={sourcesRef} className="panel source-panel" data-dashboard-section="sources" tabIndex={-1}>
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

              <section ref={findingsRef} className="panel findings-panel" data-dashboard-section="findings" tabIndex={-1}>
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
                        <tr
                          key={finding.id}
                          className={finding.id === activeFindingId ? "finding-row-active" : undefined}
                          data-finding-id={finding.id}
                          tabIndex={-1}
                        >
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

              <section ref={actionRef} className="panel action-panel" data-dashboard-section="action" tabIndex={-1}>
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
