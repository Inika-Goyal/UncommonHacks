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
import {
  DEFAULT_SWARM_STATE,
  SwarmStatusPanel,
  type SwarmLogEntry,
  type SwarmState,
} from "@/components/swarm-status-panel";
import { ElevenLabsReportAgent } from "@/components/elevenlabs-report-agent";
import { AGENT_LABELS } from "@/agents/types";
import { WorldGlobe } from "@/components/world-globe";
import type { AgentName, StateUpdate } from "@/agents/types";
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

type Mode = "demo" | "supabase" | "swarm" | null;

export function ReportDashboard({ initialInputType, initialQuery, reportId }: ReportDashboardProps) {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [swarm, setSwarm] = useState<SwarmState>(DEFAULT_SWARM_STATE);
  const [swarmEvents, setSwarmEvents] = useState<SwarmLogEntry[]>([]);
  const [swarmDone, setSwarmDone] = useState(false);
  const [overallProgress, setOverallProgress] = useState<{
    severity?: number;
    credibility?: number;
    overallRisk?: number;
  }>({});

  useEffect(() => {
    let aborted = false;

    async function loadById(id: string) {
      setIsLoading(true);
      setError(null);
      setMode("swarm");
      setSwarm(DEFAULT_SWARM_STATE);
      setSwarmEvents([]);
      setSwarmDone(false);

      const eventSource = new EventSource(`/api/reports/stream?id=${encodeURIComponent(id)}`);
      eventSource.onmessage = (event) => {
        if (aborted) return;
        try {
          const payload = JSON.parse(event.data) as StateUpdate;
          if (payload.type === "agent") {
            setSwarm((prev) => ({
              ...prev,
              [payload.name as AgentName]: {
                status: payload.status,
                detail: payload.detail,
                findingCount: payload.findingCount,
              },
            }));
            if (payload.status !== "pending") {
              const verb =
                payload.status === "running"
                  ? "started"
                  : payload.status === "ready" || payload.status === "snapshot"
                    ? "completed"
                    : "blocked";
              setSwarmEvents((prev) => [
                ...prev,
                {
                  ts: Date.now(),
                  agent: payload.name as AgentName,
                  status: payload.status,
                  message: `${AGENT_LABELS[payload.name as AgentName]} ${verb}${
                    payload.detail ? ` — ${payload.detail}` : ""
                  }`,
                },
              ]);
            }
          } else if (payload.type === "synthesis") {
            setOverallProgress({
              severity: payload.severity,
              credibility: payload.credibility,
              overallRisk: payload.overallRisk,
            });
            setSwarmEvents((prev) => [
              ...prev,
              {
                ts: Date.now(),
                message: `Synthesis: severity ${payload.severity}/5, credibility ${payload.credibility}/5, risk ${payload.overallRisk}/100`,
              },
            ]);
          } else if (payload.type === "done") {
            eventSource.close();
            setSwarmDone(true);
            void fetchFinalReport(id);
          } else if (payload.type === "error") {
            setError(payload.message);
          }
        } catch {
          // ignore malformed events
        }
      };
      eventSource.onerror = () => {
        // EventSource will auto-retry; if we already saw 'done', leave it closed.
      };

      return () => {
        aborted = true;
        eventSource.close();
      };
    }

    async function fetchFinalReport(id: string) {
      try {
        const response = await fetch(`/api/reports/${id}`);
        if (!response.ok) {
          setError(`Final report fetch failed: HTTP ${response.status}`);
          setIsLoading(false);
          return;
        }
        const payload = (await response.json()) as ReportResponse;
        if (aborted) return;
        if (!payload.ok) {
          setError(payload.error);
          return;
        }
        setReport(payload.report);
        setMode(payload.mode);
      } catch (err) {
        if (!aborted) setError(err instanceof Error ? err.message : "Failed to load final report.");
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
    if (!report) {
      return "#";
    }
    return `/api/reports/${report.id}/complaint.pdf`;
  }, [report]);

  const modeLabel = useMemo(() => {
    switch (mode) {
      case "demo":
        return "Demo fixtures";
      case "supabase":
        return "Supabase";
      case "swarm":
        return swarmDone ? "Live · ready" : "Live · running";
      default:
        return "Loading";
    }
  }, [mode, swarmDone]);

  return (
    <main className="dashboard-page">
      <header className="app-topbar">
        <Link className="brand-mark" href="/">
          <span className="brand-symbol">E</span>
          UnExploited
        </Link>
        <div className="topbar-status">
          <span className={mode === "demo" ? "status-pill status-snapshot" : "status-pill"}>{modeLabel}</span>
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
          {reportId ? <SwarmStatusPanel state={swarm} events={swarmEvents} /> : null}

          {isLoading && !report ? <DashboardLoading swarm={mode === "swarm"} /> : null}
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
                <ScoreBlock
                  label="Overall risk"
                  value={`${overallProgress.overallRisk ?? report.overallRisk}/100`}
                  tone="danger"
                />
                <ScoreBlock
                  label="Severity"
                  value={`${overallProgress.severity ?? report.severity}/5`}
                  tone="warning"
                />
                <ScoreBlock
                  label="Credibility"
                  value={`${overallProgress.credibility ?? report.credibility}/5`}
                  tone="info"
                />
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

function DashboardLoading({ swarm }: { swarm: boolean }) {
  return (
    <div className="panel loading-panel">
      <Loader2 aria-hidden="true" className="spin-icon" size={24} />
      <div>
        <h2>{swarm ? "Swarm in flight" : "Generating report"}</h2>
        <p>
          {swarm
            ? "Five specialist agents are pulling evidence in parallel; the report finalizes when synthesis completes."
            : "Pulling the explicit MVP data path."}
        </p>
      </div>
    </div>
  );
}

function DashboardError({ message }: { message: string }) {
  return (
    <div className="panel error-panel" role="alert">
      <AlertTriangle aria-hidden="true" size={24} />
      <div>
        <h2>Report generation failed</h2>
        <p>{message}</p>
      </div>
    </div>
  );
}

function ScoreBlock({ label, value, tone }: { label: string; value: string; tone: "danger" | "warning" | "info" }) {
  return (
    <div className={`score-block score-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
