"use client";

import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CircleSlash,
  Download,
  ExternalLink,
  FileText,
  Info,
  Loader2,
  Radio,
  ShieldAlert,
} from "lucide-react";
import Link from "next/link";
import { motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { ElevenLabsReportAgent } from "@/components/elevenlabs-report-agent";
import { LuminaLogo } from "@/components/lumina-brand";
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
  const globeRef = useRef<WorldGlobeHandle | null>(null);

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

  const modeLabel = mode === "demo" ? "Demo fixtures" : mode === "supabase" ? "Live report" : "Loading";

  return (
    <main className="lumina-dashboard-page lumina-shell">
      <VideoBackground />
      <div className="lumina-dashboard-scrim" aria-hidden="true" />

      <header className="lumina-dashboard-nav">
        <Link className="lumina-dashboard-brand" href="/">
          <LuminaLogo size={26} />
          <span>LUMINA</span>
        </Link>
        <div className="lumina-dashboard-nav-actions">
          <span className={`lumina-status-pill lumina-status-${mode === "demo" ? "snapshot" : "ready"}`}>
            <Radio aria-hidden="true" size={13} />
            {modeLabel}
          </span>
          <Link className="lumina-nav-link" href="/">
            <ArrowLeft aria-hidden="true" size={14} />
            New analysis
          </Link>
        </div>
      </header>

      {isLoading && !report ? <DashboardLoading /> : null}
      {error ? <DashboardError message={error} /> : null}

      {report ? (
        <section className="lumina-results-grid">
          <motion.aside
            initial={{ opacity: 0, x: -18 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.65, ease: "easeOut" }}
            className="lumina-side-rail"
          >
            <section className="liquid-glass lumina-panel lumina-investigation-card">
              <p className="lumina-overline">
                {report.inputType === "company" ? "Company report" : "Region report"}
              </p>
              <h1>{report.query}</h1>
              <p>{report.title}</p>
            </section>

            <section className="liquid-glass lumina-panel" data-dashboard-section="sources">
              <SectionHeader icon={<ShieldAlert size={14} />} title="Source Status" />
              <div className="lumina-source-stack">
                {report.sourceChecks.map((source) => {
                  const status = displayStatus(source.status);
                  return (
                    <div key={source.name} className={`lumina-source-row lumina-source-${status}`}>
                      <StatusIcon status={source.status} />
                      <div>
                        <strong>{source.name}</strong>
                        <p>{source.detail}</p>
                      </div>
                      <span className={`lumina-status-pill lumina-status-${status}`}>
                        {sourceStatusLabel[source.status]}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>

            <ElevenLabsReportAgent report={report} mode={mode ?? "demo"} />
          </motion.aside>

          <motion.section
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, delay: 0.12, ease: "easeOut" }}
            className="liquid-glass lumina-report-card"
          >
            <section className="lumina-report-summary" data-dashboard-section="summary">
              <SectionHeader icon={<Info size={14} />} title="Executive Summary" />
              <h2>{report.title}</h2>
              <p>{report.summary}</p>
            </section>

            <div className="lumina-score-grid">
              <ScoreTile label="Overall risk" value={report.overallRisk} suffix="/100" tone="danger" />
              <ScoreTile label="Severity" value={report.severity} suffix="/5" tone="warning" />
              <ScoreTile label="Credibility" value={report.credibility} suffix="/5" tone="info" />
            </div>

            <section data-dashboard-section="findings">
              <SectionHeader icon={<AlertTriangle size={14} />} title="Cited Findings" />
              <div className="lumina-findings-list">
                {report.findings.map((finding, index) => (
                  <FindingRow key={finding.id} finding={finding} index={index} />
                ))}
              </div>
            </section>

            <section className="lumina-action-block" data-dashboard-section="action">
              <SectionHeader icon={<CheckCircle2 size={14} />} title="Recommended Action" />
              <p>{report.recommendedAction}</p>
              <span>{report.sourceNote}</span>
            </section>

            <div className="lumina-report-actions">
              <a className="liquid-glass lumina-primary-action" href={pdfHref}>
                <FileText aria-hidden="true" size={15} />
                Generate Complaint PDF
              </a>
              <a className="lumina-secondary-action" href={pdfHref}>
                <Download aria-hidden="true" size={15} />
                Download letter
              </a>
            </div>
          </motion.section>

          <motion.aside
            initial={{ opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.65, delay: 0.22, ease: "easeOut" }}
            className="liquid-glass lumina-map-card"
            data-dashboard-section="map"
          >
            <div className="lumina-map-head">
              <SectionHeader icon={<ShieldAlert size={14} />} title="Signal Map" />
              <p>{report.mapPoints.length} mapped source signal{report.mapPoints.length === 1 ? "" : "s"}</p>
            </div>
            <WorldGlobe ref={globeRef} points={report.mapPoints} />
          </motion.aside>
        </section>
      ) : null}

      {report ? (
        <ModelIntelligencePanel report={report} onFocusGeography={handleFocusGeography} />
      ) : null}
    </main>
  );
}

function DashboardLoading() {
  return (
    <div className="liquid-glass lumina-dashboard-state">
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
    <div className="liquid-glass lumina-dashboard-state lumina-dashboard-error" role="alert">
      <AlertTriangle aria-hidden="true" size={24} />
      <div>
        <h1>Report load failed</h1>
        <p>{message}</p>
      </div>
    </div>
  );
}

function SectionHeader({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="lumina-section-header">
      <span>{icon}</span>
      <h2>{title}</h2>
    </div>
  );
}

function FindingRow({ finding, index }: { finding: Finding; index: number }) {
  return (
    <motion.article
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.25 + index * 0.06 }}
      className="lumina-finding-row"
      data-finding-id={finding.id}
    >
      <span className="lumina-finding-dot" style={{ background: riskColor(finding.severity) }} />
      <div className="lumina-finding-main">
        <div className="lumina-finding-head">
          <strong>{finding.signal}</strong>
          <span style={{ color: riskColor(finding.severity), background: `${riskColor(finding.severity)}20` }}>
            S{finding.severity} / C{finding.credibility}
          </span>
        </div>
        <p>{finding.evidence}</p>
        <div className="lumina-finding-meta">
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
    <div className={`lumina-score-tile lumina-score-${tone}`}>
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
