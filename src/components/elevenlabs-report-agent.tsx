"use client";

import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { Headphones, Mic, MicOff, PhoneOff, Radio } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { Report } from "@/lib/report-types";

type SignedUrlResponse =
  | {
      ok: true;
      signedUrl: string;
    }
  | {
      ok: false;
      code: string;
      error: string;
    };

type ElevenLabsReportAgentProps = {
  report: Report;
  mode: "demo" | "supabase" | "swarm";
};

export function ElevenLabsReportAgent(props: ElevenLabsReportAgentProps) {
  return (
    <ConversationProvider>
      <ElevenLabsReportAgentPanel {...props} />
    </ConversationProvider>
  );
}

function ElevenLabsReportAgentPanel({ report, mode }: ElevenLabsReportAgentProps) {
  const [error, setError] = useState<string | null>(null);
  const lastContextIdRef = useRef<string | null>(null);

  const context = useMemo(() => buildDashboardContext(report, mode), [report, mode]);
  const prompt = useMemo(() => buildVoicePrompt(report), [report]);
  const clientTools = useMemo(
    () => ({
      highlightFinding: ({ findingId }: { findingId?: string }) => {
        if (!findingId) return "findingId is required.";
        const row = document.querySelector<HTMLElement>(
          `[data-finding-id="${escapeSelectorValue(findingId)}"]`,
        );
        if (!row) return `Finding ${findingId} was not found in this dashboard report.`;

        row.scrollIntoView({ behavior: "smooth", block: "center" });
        row.classList.add("finding-row-highlight");
        window.setTimeout(() => row.classList.remove("finding-row-highlight"), 2400);
        return `Highlighted finding ${findingId}.`;
      },
      focusMapPoint: ({ pointId }: { pointId?: string }) => {
        if (!pointId) return "pointId is required.";
        const mapSection = document.querySelector<HTMLElement>('[data-dashboard-section="map"]');
        const mapPointButton = document.querySelector<HTMLButtonElement>(
          `[data-map-point-id="${escapeSelectorValue(pointId)}"]`,
        );
        if (!mapPointButton) return `Map point ${pointId} was not found in this dashboard report.`;

        mapSection?.scrollIntoView({ behavior: "smooth", block: "center" });
        mapPointButton.click();
        mapPointButton.focus({ preventScroll: true });
        return `Focused map point ${pointId}.`;
      },
      scrollToDashboardSection: ({ section }: { section?: string }) => {
        if (!section) return "section is required.";
        const normalized = section.toLowerCase();
        const dashboardSection = document.querySelector<HTMLElement>(
          `[data-dashboard-section="${escapeSelectorValue(normalized)}"]`,
        );
        if (!dashboardSection) {
          return `Dashboard section ${section} was not found. Valid sections are summary, map, sources, findings, and action.`;
        }

        dashboardSection.scrollIntoView({ behavior: "smooth", block: "start" });
        dashboardSection.classList.add("dashboard-section-highlight");
        window.setTimeout(() => dashboardSection.classList.remove("dashboard-section-highlight"), 1800);
        return `Scrolled to ${normalized}.`;
      },
      openComplaintLetter: () => {
        window.open(`/api/reports/${encodeURIComponent(report.id)}/complaint.pdf`, "_blank", "noopener,noreferrer");
        return "Opened the complaint letter PDF.";
      },
    }),
    [report.id],
  );

  const conversation = useConversation({
    clientTools,
    onConnect: () => setError(null),
    onDisconnect: () => {
      lastContextIdRef.current = null;
    },
    onError: (event) => {
      setError(formatVoiceError(event, "ElevenLabs voice session failed."));
    },
  });

  useEffect(() => {
    if (conversation.status !== "connected") return;
    if (lastContextIdRef.current === report.id) return;

    const nextContext = context;
    try {
      conversation.sendContextualUpdate(nextContext, { contextId: `report-${report.id}` });
      lastContextIdRef.current = report.id;
    } catch (sendError) {
      window.setTimeout(() => {
        setError(formatVoiceError(sendError, "Unable to send report context to ElevenLabs."));
      }, 0);
    }
  }, [context, conversation, report.id]);

  async function startVoiceAgent() {
    setError(null);

    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });

      const response = await fetch("/api/voice/signed-url", {
        method: "POST",
      });
      const payload = (await response.json()) as SignedUrlResponse;

      if (!payload.ok) {
        throw new Error(payload.error);
      }

      conversation.startSession({
        signedUrl: payload.signedUrl,
        connectionType: "websocket",
        overrides: {
          agent: {
            firstMessage: `I am connected to the ${report.title} dashboard report. Ask me about the risk score, evidence, sources, or next action.`,
            prompt: {
              prompt,
            },
            language: "en",
          },
        },
        dynamicVariables: {
          report_id: report.id,
          report_query: report.query,
          report_title: report.title,
          report_mode: mode,
        },
        clientTools,
      });
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "Unable to start the ElevenLabs voice agent.");
    }
  }

  function endVoiceAgent() {
    conversation.endSession();
    lastContextIdRef.current = null;
  }

  const isConnected = conversation.status === "connected";
  const isConnecting = conversation.status === "connecting";
  const statusLabel = isConnected ? (conversation.isSpeaking ? "Speaking" : "Listening") : voiceStatusLabel(conversation.status);

  return (
    <section className="panel voice-agent-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Voice agent</p>
          <h2>ElevenLabs analyst</h2>
        </div>
        <Headphones aria-hidden="true" size={20} />
      </div>

      <div className="voice-agent-status">
        <span className={`status-pill voice-status-${conversation.status}`}>
          <Radio aria-hidden="true" size={12} />
          {statusLabel}
        </span>
        {isConnected ? (
          <button className="icon-button" type="button" onClick={() => conversation.setMuted(!conversation.isMuted)}>
            {conversation.isMuted ? <MicOff aria-hidden="true" size={15} /> : <Mic aria-hidden="true" size={15} />}
            <span>{conversation.isMuted ? "Muted" : "Live mic"}</span>
          </button>
        ) : null}
      </div>

      <p className="voice-agent-copy">
        Connected to {report.findings.length} findings, {report.sourceChecks.length} source checks, and the current
        action recommendation.
      </p>

      {conversation.message ? <p className="voice-agent-message">{conversation.message}</p> : null}
      {error ? <p className="voice-agent-error" role="alert">{error}</p> : null}

      <div className="voice-agent-actions">
        {isConnected ? (
          <button className="secondary-button" type="button" onClick={endVoiceAgent}>
            <PhoneOff aria-hidden="true" size={16} />
            End
          </button>
        ) : (
          <button className="primary-button" type="button" onClick={startVoiceAgent} disabled={isConnecting}>
            <Mic aria-hidden="true" size={16} />
            {isConnecting ? "Connecting" : "Start voice"}
          </button>
        )}
      </div>
    </section>
  );
}

function formatVoiceError(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}

function escapeSelectorValue(value: string) {
  if (typeof CSS !== "undefined" && "escape" in CSS) {
    return CSS.escape(value);
  }

  return value.replace(/["\\]/g, "\\$&");
}

function voiceStatusLabel(status: string) {
  switch (status) {
    case "connecting":
      return "Connecting";
    case "connected":
      return "Connected";
    default:
      return "Ready";
  }
}

function buildVoicePrompt(report: Report) {
  return `You are the UnExploited dashboard voice analyst for a labor exploitation risk report.

Rules:
- Answer from the dashboard report context only.
- Use the supplied scores, findings, citations, source statuses, map points, and recommendation.
- Say when a fact is unavailable or a source is blocked instead of guessing.
- Keep spoken answers concise, practical, and source-aware.
- If asked what to do next, start from the report recommendation.

Current report: ${report.title}
Input: ${report.inputType} / ${report.query}`;
}

function buildDashboardContext(report: Report, mode: ElevenLabsReportAgentProps["mode"]) {
  return JSON.stringify(
    {
      instruction:
        "Use this dashboard report as the authoritative context for the next user question. Do not answer from outside knowledge unless the user explicitly asks for general background.",
      mode,
      report: {
        id: report.id,
        inputType: report.inputType,
        query: report.query,
        title: report.title,
        summary: report.summary,
        scores: {
          overallRisk: report.overallRisk,
          severity: report.severity,
          credibility: report.credibility,
        },
        recommendedAction: report.recommendedAction,
        sourceNote: report.sourceNote,
        createdAt: report.createdAt,
      },
      sourceChecks: report.sourceChecks,
      findings: report.findings.map((finding) => ({
        signal: finding.signal,
        severity: finding.severity,
        credibility: finding.credibility,
        geography: finding.geography,
        evidence: finding.evidence,
        citations: finding.citations.map((citation) => ({
          label: citation.label,
          url: citation.url,
          accessedAt: citation.accessedAt,
        })),
      })),
      mapPoints: report.mapPoints,
    },
    null,
    2,
  );
}
