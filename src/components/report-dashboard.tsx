"use client";

import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CircleSlash,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Radio,
  ShieldAlert,
} from "lucide-react";
import Link from "next/link";
import { motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import {
  ElevenLabsReportAgent,
  type DashboardSection,
  type ElevenLabsDashboardTools,
} from "@/components/elevenlabs-report-agent";
import { LaborLensLogo } from "@/components/laborlens-brand";
import { ModelIntelligencePanel } from "@/components/model-intelligence-panel";
import { ScoreScrambler } from "@/components/score-scrambler";
import { VideoBackground } from "@/components/video-background";
import { WorldGlobe, type WorldGlobeHandle } from "@/components/world-globe";
import type { Finding, InputType, Report, ReportResponse, SourceStatus } from "@/lib/report-types";

type ReportDashboardProps = {
  initialInputType: InputType;
  initialQuery: string;
  reportId?: string;
};

type Mode = "demo" | "supabase" | null;

const sourceStatusLabel = {
  ready: "Live",
  snapshot: "Live",
  blocked: "Blocked",
  pending: "Pending",
} satisfies Record<SourceStatus, string>;

function displayStatus(status: SourceStatus): Exclude<SourceStatus, "snapshot"> {
  return status === "snapshot" ? "ready" : status;
}

export function ReportDashboard({ initialInputType, initialQuery, reportId }: ReportDashboardProps) {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeFindingId, setActiveFindingId] = useState<string | null>(null);
  const summaryRef = useRef<HTMLElement | null>(null);
  const mapRef = useRef<HTMLElement | null>(null);
  const sourcesRef = useRef<HTMLElement | null>(null);
  const findingsRef = useRef<HTMLElement | null>(null);
  const actionRef = useRef<HTMLElement | null>(null);
  const globeRef = useRef<WorldGlobeHandle | null>(null);
  const pdfLinkRef = useRef<HTMLAnchorElement | null>(null);

  const handleFocusGeography = useCallback(
    (target: { latitude: number; longitude: number; pointId?: string }) => {
      globeRef.current?.focusLocation({
        latitude: target.latitude,
        longitude: target.longitude,
        zoom: 1.35,
      });
    },
    [],
  );

  useEffect(() => {
    let aborted = false;

    async function loadById(id: string) {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/reports/${encodeURIComponent(id)}`);
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
    return `/api/reports/${encodeURIComponent(report.id)}/complaint.pdf`;
  }, [report]);

  const modeLabel = mode === "demo" ? "Demo fixtures" : mode === "supabase" ? "Live report" : "Loading";

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
    <main className="laborlens-dashboard-page laborlens-shell">
      <VideoBackground />
      <div className="laborlens-dashboard-scrim" aria-hidden="true" />

      <header className="laborlens-dashboard-nav">
        <Link className="laborlens-dashboard-brand" href="/">
          <LaborLensLogo size={26} />
          <span>LABORLENS</span>
        </Link>
        <div className="laborlens-dashboard-nav-actions">
          <span className={`laborlens-status-pill laborlens-status-${mode === "demo" ? "snapshot" : "ready"}`}>
            <Radio aria-hidden="true" size={13} />
            {modeLabel}
          </span>
          {report ? (
            <ElevenLabsReportAgent
              report={report}
              mode={mode ?? "demo"}
              pdfHref={pdfHref}
              tools={voiceTools}
            />
          ) : null}
          <Link className="laborlens-nav-link" href="/">
            <ArrowLeft aria-hidden="true" size={14} />
            New analysis
          </Link>
        </div>
      </header>

      {isLoading && !report ? <DashboardLoading /> : null}
      {error ? <DashboardError message={error} /> : null}

      {report ? (
        <section className="laborlens-results-grid">
          <motion.aside
            initial={{ opacity: 0, x: -18 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.65, ease: "easeOut" }}
            className="laborlens-side-rail"
          >
            <section className="liquid-glass laborlens-panel laborlens-investigation-card">
              <p className="laborlens-overline">
                {report.inputType === "company" ? "Company report" : "Region report"}
              </p>
              <h1>{report.query}</h1>
              <p>{report.title}</p>
            </section>

            <section
              ref={sourcesRef}
              className="liquid-glass laborlens-panel"
              data-dashboard-section="sources"
              tabIndex={-1}
            >
              <SectionHeader icon={<ShieldAlert size={14} />} title="Source Status" />
              <div className="laborlens-source-stack">
                {report.sourceChecks.map((source) => {
                  const status = displayStatus(source.status);
                  return (
                    <div key={source.name} className={`laborlens-source-row laborlens-source-${status}`}>
                      <StatusIcon status={source.status} />
                      <div>
                        <strong>{source.name}</strong>
                        <p>{source.detail}</p>
                      </div>
                      <span className={`laborlens-status-pill laborlens-status-${status}`}>
                        {sourceStatusLabel[source.status]}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>

          </motion.aside>

          <motion.section
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, delay: 0.12, ease: "easeOut" }}
            className="liquid-glass laborlens-report-card"
          >
            <div className="laborlens-report-card-scroll">
              <section
                ref={summaryRef}
                className="laborlens-report-summary"
                data-dashboard-section="summary"
                tabIndex={-1}
              >
                <SectionHeader title="Executive Summary" />
                <p>{report.summary}</p>
              </section>

              <div className="laborlens-score-grid">
                <ScoreTile label="Overall risk" value={report.overallRisk} suffix="/100" tone="danger" />
                <ScoreTile label="Severity" value={report.severity} suffix="/5" tone="warning" />
                <ScoreTile label="Credibility" value={report.credibility} suffix="/5" tone="info" />
              </div>

              <section ref={findingsRef} data-dashboard-section="findings" tabIndex={-1}>
                <SectionHeader icon={<AlertTriangle size={14} />} title="Cited Findings" />
                <div className="laborlens-findings-list">
                  {report.findings.map((finding, index) => (
                    <FindingRow
                      key={finding.id}
                      finding={finding}
                      index={index}
                      isActive={finding.id === activeFindingId}
                    />
                  ))}
                </div>
              </section>

              <section
                ref={actionRef}
                className="laborlens-action-block"
                data-dashboard-section="action"
                tabIndex={-1}
              >
                <SectionHeader icon={<CheckCircle2 size={14} />} title="Recommended Action" />
                <p>{report.recommendedAction}</p>
              </section>

              <div className="laborlens-report-actions">
                <a ref={pdfLinkRef} className="liquid-glass laborlens-primary-action" href={pdfHref}>
                  <FileText aria-hidden="true" size={15} />
                  Generate Complaint PDF
                </a>
                <a className="laborlens-secondary-action" href={pdfHref}>
                  <Download aria-hidden="true" size={15} />
                  Download letter
                </a>
              </div>
            </div>
          </motion.section>

          <motion.aside
            ref={mapRef}
            initial={{ opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.65, delay: 0.22, ease: "easeOut" }}
            className="liquid-glass laborlens-map-card"
            data-dashboard-section="map"
            tabIndex={-1}
          >
            <div className="laborlens-map-head">
              <SectionHeader icon={<ShieldAlert size={14} />} title="Signal Map" />
              <p>{report.mapPoints.length} mapped source signal{report.mapPoints.length === 1 ? "" : "s"}</p>
            </div>
            <WorldGlobe ref={globeRef} points={report.mapPoints} />
          </motion.aside>

          <ModelIntelligencePanel report={report} onFocusGeography={handleFocusGeography} />
        </section>
      ) : null}
    </main>
  );
}

function DashboardLoading() {
  return (
    <div className="liquid-glass laborlens-dashboard-state">
      <Loader2 aria-hidden="true" className="spin-icon" size={24} />
      <div>
        <h1>Loading report</h1>
        <p>Fetching the persisted findings and source state.</p>
      </div>
    </div>
  );
}

function DashboardError({ message }: { message: string }) {
  return (
    <div className="liquid-glass laborlens-dashboard-state laborlens-dashboard-error" role="alert">
      <AlertTriangle aria-hidden="true" size={24} />
      <div>
        <h1>Report load failed</h1>
        <p>{message}</p>
      </div>
    </div>
  );
}

function SectionHeader({ icon, title }: { icon?: ReactNode; title: string }) {
  return (
    <div className="laborlens-section-header">
      {icon ? <span>{icon}</span> : null}
      <h2>{title}</h2>
    </div>
  );
}

function FindingRow({
  finding,
  index,
  isActive,
}: {
  finding: Finding;
  index: number;
  isActive: boolean;
}) {
  return (
    <motion.article
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.25 + index * 0.06 }}
      className={`laborlens-finding-row${isActive ? " laborlens-finding-row-active" : ""}`}
      data-finding-id={finding.id}
    >
      <span className="laborlens-finding-dot" style={{ background: riskColor(finding.severity) }} />
      <div className="laborlens-finding-main">
        <div className="laborlens-finding-head">
          <strong>{finding.signal}</strong>
          <span style={{ color: riskColor(finding.severity), background: `${riskColor(finding.severity)}20` }}>
            S{finding.severity} / C{finding.credibility}
          </span>
        </div>
        <p>{finding.evidence}</p>
        <div className="laborlens-finding-meta">
          <span>{finding.geography}</span>
          {finding.citations.map((citation) => (
            <a key={citation.url} href={citation.url} target="_blank" rel="noreferrer">
              {citation.label}
              <ExternalLink aria-hidden="true" size={12} />
            </a>
          ))}
        </div>
      </div>
    </motion.article>
  );
}

function ScoreTile({
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
    <div className={`laborlens-score-tile laborlens-score-${tone}`}>
      <span>{label}</span>
      <strong>
        <ScoreScrambler value={value} />
        <small>{suffix}</small>
      </strong>
    </div>
  );
}

function StatusIcon({ status }: { status: SourceStatus }) {
  if (status === "blocked") {
    return <CircleSlash aria-hidden="true" size={16} />;
  }
  if (status === "pending") {
    return <Loader2 aria-hidden="true" className="spin-icon" size={16} />;
  }
  return <CheckCircle2 aria-hidden="true" size={16} />;
}

function riskColor(score: number) {
  if (score >= 5) return "#ef4444";
  if (score >= 4) return "#f97316";
  if (score >= 3) return "#f59e0b";
  return "#22c55e";
}
