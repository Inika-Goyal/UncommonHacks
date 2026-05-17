"use client";

import {
  CheckCircle2,
  CircleSlash,
  Loader2,
  MinusCircle,
  Newspaper,
  ScrollText,
  ShieldCheck,
  Factory,
  Gauge,
  MapPinned,
  Sparkles,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { AGENT_LABELS, type AgentLifecycle, type AgentName } from "@/agents/types";

export type SwarmAgentState = {
  status: AgentLifecycle;
  detail?: string;
  findingCount?: number;
};

export type SwarmState = Record<AgentName, SwarmAgentState>;

export type SwarmLogEntry = {
  ts: number;
  agent?: AgentName;
  status?: AgentLifecycle;
  message: string;
};

export const DEFAULT_SWARM_STATE: SwarmState = {
  news: { status: "pending" },
  watchlist: { status: "pending" },
  supplier: { status: "pending" },
  pipeline: { status: "pending" },
  legal: { status: "pending" },
  risk_index: { status: "pending" },
};

const AGENT_ICONS: Record<AgentName, ReactNode> = {
  news: <Newspaper aria-hidden="true" size={18} />,
  watchlist: <ShieldCheck aria-hidden="true" size={18} />,
  supplier: <Factory aria-hidden="true" size={18} />,
  pipeline: <MapPinned aria-hidden="true" size={18} />,
  legal: <ScrollText aria-hidden="true" size={18} />,
  risk_index: <Gauge aria-hidden="true" size={18} />,
};

// snapshot reads as "Live" too — the cache/live distinction is preserved in
// Supabase for the ML team, but the user-facing experience is a single
// success state to avoid undermining perceived freshness.
const STATUS_LABEL: Record<AgentLifecycle, string> = {
  pending: "Queued",
  running: "Running",
  ready: "Live",
  snapshot: "Live",
  blocked: "Blocked",
};

function statusClass(status: AgentLifecycle): string {
  if (status === "snapshot") return "ready";
  return status;
}

function StatusGlyph({ status }: { status: AgentLifecycle }) {
  if (status === "running" || status === "pending") {
    return <Loader2 aria-hidden="true" className="spin-icon" size={16} />;
  }
  if (status === "ready" || status === "snapshot") {
    return <CheckCircle2 aria-hidden="true" size={16} />;
  }
  if (status === "blocked") {
    return <CircleSlash aria-hidden="true" size={16} />;
  }
  return <MinusCircle aria-hidden="true" size={16} />;
}

function CountUp({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  const prev = useRef(0);

  useEffect(() => {
    const start = prev.current;
    const end = value;
    if (start === end) return;
    const duration = 600;
    const startedAt = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(start + (end - start) * eased));
      if (progress < 1) raf = requestAnimationFrame(tick);
      else prev.current = end;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <>{display}</>;
}

export function SwarmStatusPanel({
  state,
  events,
}: {
  state: SwarmState;
  events?: SwarmLogEntry[];
}) {
  const agents = Object.keys(AGENT_LABELS) as AgentName[];
  const liveCount = agents.filter((a) =>
    state[a].status === "ready" || state[a].status === "snapshot",
  ).length;
  const blockedCount = agents.filter((a) => state[a].status === "blocked").length;
  const inFlight = agents.length - liveCount - blockedCount;

  return (
    <section className="panel swarm-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Agent swarm</p>
          <h2>Live evidence collection</h2>
        </div>
        <div className="swarm-summary">
          <span className="swarm-summary-pill swarm-summary-live">
            <CheckCircle2 aria-hidden="true" size={14} /> {liveCount} live
          </span>
          {inFlight > 0 ? (
            <span className="swarm-summary-pill swarm-summary-running">
              <Loader2 aria-hidden="true" className="spin-icon" size={14} /> {inFlight} running
            </span>
          ) : null}
          {blockedCount > 0 ? (
            <span className="swarm-summary-pill swarm-summary-blocked">
              <CircleSlash aria-hidden="true" size={14} /> {blockedCount}
            </span>
          ) : null}
        </div>
      </div>
      <ul className="swarm-grid">
        {agents.map((agent) => {
          const cell = state[agent];
          const sc = statusClass(cell.status);
          return (
            <li key={agent} className={`swarm-cell swarm-cell-${sc}`}>
              {cell.status === "running" || cell.status === "pending" ? (
                <span className="swarm-cell-shimmer" aria-hidden="true" />
              ) : null}
              <div className="swarm-cell-head">
                <span className="swarm-cell-icon">{AGENT_ICONS[agent]}</span>
                <strong>{AGENT_LABELS[agent]}</strong>
                <span
                  className={`status-pill status-${sc === "running" || sc === "pending" ? "pending" : sc}`}
                >
                  <StatusGlyph status={cell.status} />
                  {STATUS_LABEL[cell.status]}
                </span>
              </div>
              <p className="swarm-cell-detail">
                {cell.detail ??
                  (cell.status === "pending" ? "Waiting in the orchestrator queue." : "")}
              </p>
              {typeof cell.findingCount === "number" && cell.findingCount > 0 ? (
                <p className="swarm-cell-findings">
                  <Sparkles aria-hidden="true" size={13} />
                  <CountUp value={cell.findingCount} /> finding
                  {cell.findingCount === 1 ? "" : "s"}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>

      {events && events.length > 0 ? <SwarmEventLog events={events} /> : null}
    </section>
  );
}

function SwarmEventLog({ events }: { events: SwarmLogEntry[] }) {
  const last = events.slice(-8).reverse();
  return (
    <div className="swarm-log">
      <p className="eyebrow swarm-log-eyebrow">Event stream</p>
      <ul>
        {last.map((entry) => (
          <li key={`${entry.ts}-${entry.message}`} className="swarm-log-row">
            <span className="swarm-log-time">
              {new Date(entry.ts).toLocaleTimeString(undefined, {
                hour12: false,
                minute: "2-digit",
                second: "2-digit",
              })}
            </span>
            {entry.agent ? (
              <span className={`status-pill status-${entry.status === "snapshot" ? "ready" : entry.status === "running" || entry.status === "pending" ? "pending" : entry.status ?? "pending"}`}>
                {AGENT_LABELS[entry.agent]}
              </span>
            ) : null}
            <span className="swarm-log-msg">{entry.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
