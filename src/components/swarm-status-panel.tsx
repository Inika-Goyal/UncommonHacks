"use client";

import { CheckCircle2, CircleSlash, Loader2, MinusCircle, Newspaper, ScrollText, ShieldCheck, Factory, Gauge } from "lucide-react";
import type { ReactNode } from "react";

import { AGENT_LABELS, type AgentLifecycle, type AgentName } from "@/agents/types";

export type SwarmAgentState = {
  status: AgentLifecycle;
  detail?: string;
  findingCount?: number;
};

export type SwarmState = Record<AgentName, SwarmAgentState>;

export const DEFAULT_SWARM_STATE: SwarmState = {
  news: { status: "pending" },
  watchlist: { status: "pending" },
  supplier: { status: "pending" },
  legal: { status: "pending" },
  risk_index: { status: "pending" },
};

const AGENT_ICONS: Record<AgentName, ReactNode> = {
  news: <Newspaper aria-hidden="true" size={18} />,
  watchlist: <ShieldCheck aria-hidden="true" size={18} />,
  supplier: <Factory aria-hidden="true" size={18} />,
  legal: <ScrollText aria-hidden="true" size={18} />,
  risk_index: <Gauge aria-hidden="true" size={18} />,
};

const STATUS_LABEL: Record<AgentLifecycle, string> = {
  pending: "Queued",
  running: "Running",
  ready: "Live",
  snapshot: "Cached",
  blocked: "Blocked",
};

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

export function SwarmStatusPanel({ state }: { state: SwarmState }) {
  const agents = (Object.keys(AGENT_LABELS) as AgentName[]);

  return (
    <section className="panel swarm-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Agent swarm</p>
          <h2>Live evidence collection</h2>
        </div>
        <Gauge aria-hidden="true" size={20} />
      </div>
      <ul className="swarm-grid">
        {agents.map((agent) => {
          const cell = state[agent];
          return (
            <li key={agent} className={`swarm-cell swarm-cell-${cell.status}`}>
              <div className="swarm-cell-head">
                <span className="swarm-cell-icon">{AGENT_ICONS[agent]}</span>
                <strong>{AGENT_LABELS[agent]}</strong>
                <span className={`status-pill status-${cell.status === "running" || cell.status === "pending" ? "pending" : cell.status}`}>
                  <StatusGlyph status={cell.status} />
                  {STATUS_LABEL[cell.status]}
                </span>
              </div>
              <p className="swarm-cell-detail">
                {cell.detail ?? (cell.status === "pending" ? "Waiting in the orchestrator queue." : "")}
                {typeof cell.findingCount === "number" && cell.findingCount > 0
                  ? ` ${cell.findingCount} finding${cell.findingCount === 1 ? "" : "s"}.`
                  : ""}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
