"use client";

import {
  ArrowRight,
  CheckCircle2,
  CircleSlash,
  Loader2,
  Factory,
  Gauge,
  Newspaper,
  ScrollText,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { ScoreScrambler } from "@/components/score-scrambler";
import { AGENT_LABELS, type AgentLifecycle, type AgentName, type StateUpdate } from "@/agents/types";
import {
  DEFAULT_SWARM_STATE,
  type SwarmLogEntry,
  type SwarmState,
} from "@/components/swarm-status-panel";

const SwarmConstellation = dynamic(
  () => import("@/components/swarm-constellation").then((m) => m.SwarmConstellationClient),
  { ssr: false, loading: () => <div className="launch-constellation launch-constellation-placeholder" /> },
);

const AGENT_ICONS: Record<AgentName, ReactNode> = {
  news: <Newspaper aria-hidden="true" size={16} />,
  watchlist: <ShieldCheck aria-hidden="true" size={16} />,
  supplier: <Factory aria-hidden="true" size={16} />,
  legal: <ScrollText aria-hidden="true" size={16} />,
  risk_index: <Gauge aria-hidden="true" size={16} />,
};

const STATUS_LABEL: Record<AgentLifecycle, string> = {
  pending: "Queued",
  running: "Running",
  ready: "Live",
  snapshot: "Live",
  blocked: "Blocked",
};

const AUTO_REDIRECT_MS = 14_000;

type Props = {
  reportId: string;
};

export function SwarmLaunch({ reportId }: Props) {
  const router = useRouter();
  const [swarm, setSwarm] = useState<SwarmState>(DEFAULT_SWARM_STATE);
  const [events, setEvents] = useState<SwarmLogEntry[]>([]);
  const [synthesis, setSynthesis] = useState<{ severity: number; credibility: number; overallRisk: number } | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secondsToRedirect, setSecondsToRedirect] = useState<number | null>(null);
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const eventSource = new EventSource(`/api/reports/stream?id=${encodeURIComponent(reportId)}`);

    eventSource.onmessage = (event) => {
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
            setEvents((prev) => [
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
          setSynthesis({
            severity: payload.severity,
            credibility: payload.credibility,
            overallRisk: payload.overallRisk,
          });
          setEvents((prev) => [
            ...prev,
            {
              ts: Date.now(),
              message: `Synthesis: severity ${payload.severity}/5, credibility ${payload.credibility}/5, risk ${payload.overallRisk}/100`,
            },
          ]);
        } else if (payload.type === "done") {
          eventSource.close();
          setDone(true);
        } else if (payload.type === "error") {
          setError(payload.message);
        }
      } catch {
        // ignore malformed events
      }
    };

    return () => {
      eventSource.close();
    };
  }, [reportId]);

  // Auto-redirect to the dashboard a few seconds after the swarm finishes so
  // the user has time to read the scores before transitioning.
  useEffect(() => {
    if (!done) return;
    setSecondsToRedirect(Math.ceil(AUTO_REDIRECT_MS / 1000));
    countdownInterval.current = setInterval(() => {
      setSecondsToRedirect((s) => (s !== null && s > 0 ? s - 1 : s));
    }, 1000);
    redirectTimer.current = setTimeout(() => {
      router.push(`/dashboard?id=${reportId}`);
    }, AUTO_REDIRECT_MS);
    return () => {
      if (redirectTimer.current) clearTimeout(redirectTimer.current);
      if (countdownInterval.current) clearInterval(countdownInterval.current);
    };
  }, [done, reportId, router]);

  const completedCount = useMemo(
    () =>
      (Object.keys(AGENT_LABELS) as AgentName[]).filter((a) =>
        ["ready", "snapshot", "blocked"].includes(swarm[a].status),
      ).length,
    [swarm],
  );
  const totalAgents = Object.keys(AGENT_LABELS).length;
  const progress = Math.min(1, completedCount / totalAgents);

  const recentEvents = events.slice(-6).reverse();

  return (
    <main className="launch-page">
      <div className="launch-backdrop" aria-hidden="true">
        <div className="launch-aurora launch-aurora-1" />
        <div className="launch-aurora launch-aurora-2" />
        <div className="launch-aurora launch-aurora-3" />
        <div className="launch-noise" />
      </div>

      <header className="launch-header">
        <Link className="launch-brand" href="/">
          <span className="launch-brand-symbol">E</span>
          UnExploited
        </Link>
        <span className="launch-status">
          {done ? "Synthesis complete" : `${completedCount} / ${totalAgents} agents reporting`}
        </span>
      </header>

      <section className="launch-stage">
        <div className="launch-titlebar">
          <p className="launch-eyebrow">Live agent run</p>
          <h1 className="launch-title">
            {done ? "Synthesis complete" : "Investigating in real time"}
          </h1>
          <p className="launch-subtitle">
            Five specialist agents are running in parallel against public sources. The orchestrator
            fans out, each agent extracts cited findings, and synthesis produces the scored
            briefing.
          </p>
        </div>

        <div className="launch-constellation">
          <SwarmConstellation
            state={swarm}
            synthesisActive={synthesis !== null}
            done={done}
          />
        </div>

        <div className="launch-progress" aria-hidden="true">
          <span className="launch-progress-bar" style={{ width: `${progress * 100}%` }} />
        </div>

        <ul className="launch-agents">
          {(Object.keys(AGENT_LABELS) as AgentName[]).map((name) => {
            const cell = swarm[name];
            const sc = cell.status === "snapshot" ? "ready" : cell.status;
            return (
              <li key={name} className={`launch-agent launch-agent-${sc}`}>
                <span className="launch-agent-icon">{AGENT_ICONS[name]}</span>
                <div className="launch-agent-body">
                  <strong>{AGENT_LABELS[name]}</strong>
                  <span className="launch-agent-detail">
                    {cell.detail ?? (cell.status === "pending" ? "Queued" : "")}
                  </span>
                </div>
                <span className={`launch-agent-status launch-agent-status-${sc === "running" || sc === "pending" ? "running" : sc}`}>
                  {(cell.status === "running" || cell.status === "pending") && (
                    <Loader2 className="spin-icon" size={12} aria-hidden="true" />
                  )}
                  {(cell.status === "ready" || cell.status === "snapshot") && (
                    <CheckCircle2 size={12} aria-hidden="true" />
                  )}
                  {cell.status === "blocked" && <CircleSlash size={12} aria-hidden="true" />}
                  {STATUS_LABEL[cell.status]}
                </span>
              </li>
            );
          })}
        </ul>

        {synthesis ? (
          <div className={`launch-scores ${done ? "launch-scores-done" : ""}`}>
            <ScoreTile label="Overall risk" value={synthesis.overallRisk} suffix="/100" tone="danger" />
            <ScoreTile label="Severity" value={synthesis.severity} suffix="/5" tone="warning" />
            <ScoreTile label="Credibility" value={synthesis.credibility} suffix="/5" tone="info" />
          </div>
        ) : null}

        <div className="launch-log" aria-live="polite">
          {recentEvents.length === 0 ? (
            <span className="launch-log-idle">Awaiting first event from the orchestrator…</span>
          ) : (
            recentEvents.map((e) => (
              <span key={`${e.ts}-${e.message}`} className="launch-log-row">
                <span className="launch-log-time">
                  {new Date(e.ts).toLocaleTimeString(undefined, {
                    hour12: false,
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </span>
                {e.agent ? (
                  <span className="launch-log-agent">{AGENT_LABELS[e.agent]}</span>
                ) : null}
                <span className="launch-log-msg">{e.message}</span>
              </span>
            ))
          )}
        </div>

        {done ? (
          <div className="launch-cta">
            <Link className="launch-cta-button" href={`/dashboard?id=${reportId}`}>
              Open report
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
            {secondsToRedirect !== null && secondsToRedirect > 0 ? (
              <span className="launch-cta-hint">
                Opening automatically in {secondsToRedirect}s
              </span>
            ) : null}
          </div>
        ) : null}

        {error ? <div className="launch-error">{error}</div> : null}
      </section>
    </main>
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
    <div className={`launch-score launch-score-${tone}`}>
      <span className="launch-score-label">{label}</span>
      <span className="launch-score-value">
        <ScoreScrambler value={value} />
        <span className="launch-score-suffix">{suffix}</span>
      </span>
    </div>
  );
}
