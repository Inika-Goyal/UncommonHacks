"use client";

import { ConversationProvider, useConversation, useConversationClientTool } from "@elevenlabs/react";
import { Mic, MicOff, PhoneOff, Radio, Sparkles } from "lucide-react";
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

export type DashboardSection = "summary" | "map" | "sources" | "findings" | "action";

export type ElevenLabsDashboardTools = {
  highlightFinding: (findingId: string) => string;
  focusMapPoint: (pointId: string) => string;
  scrollToDashboardSection: (section: DashboardSection) => string;
  openComplaintLetter: () => string;
};

type ElevenLabsClientTools = {
  highlightFinding: (params: { findingId?: string }) => string;
  focusMapPoint: (params: { pointId?: string }) => string;
  scrollToDashboardSection: (params: { section?: DashboardSection }) => string;
  openComplaintLetter: () => string;
};

type SuggestedPrompt = {
  label: string;
  text: string;
};

type ElevenLabsReportAgentProps = {
  report: Report;
  mode: "demo" | "supabase" | "swarm";
  pdfHref: string;
  tools: ElevenLabsDashboardTools;
};

export function ElevenLabsReportAgent(props: ElevenLabsReportAgentProps) {
  return (
    <ConversationProvider>
      <ElevenLabsReportAgentPanel {...props} />
    </ConversationProvider>
  );
}

function ElevenLabsReportAgentPanel({ report, mode, pdfHref, tools }: ElevenLabsReportAgentProps) {
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [contextReadyId, setContextReadyId] = useState<string | null>(null);
  const lastContextIdRef = useRef<string | null>(null);
  const pendingPromptRef = useRef<string | null>(null);
  const userEndedRef = useRef(false);

  const context = useMemo(() => buildDashboardContext(report, mode, pdfHref), [report, mode, pdfHref]);
  const suggestedPrompts = useMemo(() => buildSuggestedPrompts(report), [report]);

  const conversation = useConversation({
    onConnect: () => {
      userEndedRef.current = false;
      setIsStarting(false);
      setError(null);
    },
    onDisconnect: (details) => {
      setIsStarting(false);
      lastContextIdRef.current = null;
      pendingPromptRef.current = null;
      setContextReadyId(null);
      if (!userEndedRef.current && details?.reason === "error") {
        setError(formatVoiceError(details.message, "ElevenLabs voice session disconnected."));
      }
    },
    onError: (event) => {
      setIsStarting(false);
      setError(formatVoiceError(event, "ElevenLabs voice session failed."));
    },
    onStatusChange: () => setIsStarting(false),
  });

  useConversationClientTool<ElevenLabsClientTools>("highlightFinding", (params: { findingId?: string }) => {
    if (!params.findingId) {
      return "No findingId was provided. Ask for a finding ID from the report context.";
    }
    return tools.highlightFinding(params.findingId);
  });

  useConversationClientTool<ElevenLabsClientTools>("focusMapPoint", (params: { pointId?: string }) => {
    if (!params.pointId) {
      return "No pointId was provided. Ask for a map point ID from the report context.";
    }
    return tools.focusMapPoint(params.pointId);
  });

  useConversationClientTool<ElevenLabsClientTools>("scrollToDashboardSection", (params: { section?: DashboardSection }) => {
    const section = params.section;
    if (!isDashboardSection(section)) {
      return "Unknown dashboard section. Use summary, map, sources, findings, or action.";
    }
    return tools.scrollToDashboardSection(section);
  });

  useConversationClientTool<ElevenLabsClientTools>("openComplaintLetter", () => tools.openComplaintLetter());

  useEffect(() => {
    if (conversation.status !== "connected") return;
    if (lastContextIdRef.current === report.id) return;

    try {
      conversation.sendContextualUpdate(context, { contextId: `report-${report.id}` });
      lastContextIdRef.current = report.id;
      setContextReadyId(report.id);
    } catch (sendError) {
      window.setTimeout(() => {
        setError(formatVoiceError(sendError, "Unable to send report context to ElevenLabs."));
      }, 0);
    }
  }, [context, conversation, report.id]);

  useEffect(() => {
    if (conversation.status !== "connected") return;
    if (contextReadyId !== report.id) return;
    if (!pendingPromptRef.current) return;

    const pendingPrompt = pendingPromptRef.current;
    pendingPromptRef.current = null;
    conversation.sendUserMessage(pendingPrompt);
  }, [contextReadyId, conversation, report.id]);

  async function startVoiceAgent(queuedPrompt?: string) {
    setError(null);
    setIsStarting(true);
    userEndedRef.current = false;
    pendingPromptRef.current = queuedPrompt ?? null;

    try {
      const response = await fetch("/api/voice/signed-url", {
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as SignedUrlResponse | null;

      if (!payload?.ok) {
        throw new Error(
          payload?.error ??
            `Unable to prepare the ElevenLabs voice session. The signed URL endpoint returned HTTP ${response.status}.`,
        );
      }

      conversation.startSession({
        signedUrl: payload.signedUrl,
        connectionType: "websocket",
        dynamicVariables: {
          report_id: report.id,
          report_query: report.query,
          report_title: report.title,
          report_mode: mode,
        },
      });
    } catch (startError) {
      setIsStarting(false);
      pendingPromptRef.current = null;
      setError(startError instanceof Error ? startError.message : "Unable to start the ElevenLabs voice agent.");
    }
  }

  function endVoiceAgent() {
    userEndedRef.current = true;
    conversation.endSession();
    lastContextIdRef.current = null;
    setContextReadyId(null);
  }

  function submitSuggestedPrompt(promptToSend: SuggestedPrompt) {
    setError(null);
    if (isConnected) {
      conversation.sendUserMessage(promptToSend.text);
      return;
    }
    if (isConnecting) {
      pendingPromptRef.current = promptToSend.text;
      return;
    }
    void startVoiceAgent(promptToSend.text);
  }

  const isConnected = conversation.status === "connected";
  const isConnecting = isStarting || conversation.status === "connecting";
  const statusLabel = isConnected
    ? conversation.isSpeaking
      ? "Speaking"
      : "Listening"
    : isStarting
      ? "Preparing"
      : voiceStatusLabel(conversation.status);

  return (
    <section className="voice-agent-panel voice-agent-inline" aria-label="ElevenLabs report analyst">
      <div className="voice-agent-actions">
        {isConnected ? (
          <>
            <span className={`status-pill voice-status-${conversation.status}`}>
              <Radio aria-hidden="true" size={12} />
              {statusLabel}
            </span>
            <button className="icon-button" type="button" onClick={() => conversation.setMuted(!conversation.isMuted)}>
              {conversation.isMuted ? <MicOff aria-hidden="true" size={15} /> : <Mic aria-hidden="true" size={15} />}
              <span>{conversation.isMuted ? "Muted" : "Live mic"}</span>
            </button>
            <button className="secondary-button" type="button" onClick={endVoiceAgent}>
              <PhoneOff aria-hidden="true" size={16} />
              End
            </button>
          </>
        ) : (
          <button
            className="primary-button"
            type="button"
            onClick={() => void startVoiceAgent()}
            disabled={isConnecting}
            aria-busy={isConnecting}
          >
            <Mic aria-hidden="true" size={16} />
            {isConnecting ? statusLabel : "Discuss this report"}
          </button>
        )}
      </div>

      <p className="voice-agent-copy">
        Connected to {report.findings.length} findings, {report.sourceChecks.length} source checks, map signals, and
        the current action recommendation.
      </p>

      <div className="voice-agent-prompts" aria-label="Suggested voice prompts">
        {suggestedPrompts.map((suggestedPrompt) => (
          <button
            key={suggestedPrompt.label}
            className="voice-prompt-chip"
            type="button"
            onClick={() => submitSuggestedPrompt(suggestedPrompt)}
            disabled={isConnecting}
            aria-label={`${suggestedPrompt.label}: ${suggestedPrompt.text}`}
          >
            <Sparkles aria-hidden="true" size={13} />
            {suggestedPrompt.label}
          </button>
        ))}
      </div>

      {conversation.message ? <p className="voice-agent-message">{conversation.message}</p> : null}
      {error ? <p className="voice-agent-error" role="alert">{error}</p> : null}
    </section>
  );
}

function formatVoiceError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : fallback;
  if (/permission denied|notallowed|permission dismissed|microphone/i.test(message)) {
    return "Microphone permission was denied. Allow microphone access for this browser and try again.";
  }
  return message;
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

function isDashboardSection(value: unknown): value is DashboardSection {
  return value === "summary" || value === "map" || value === "sources" || value === "findings" || value === "action";
}

function buildDashboardContext(report: Report, mode: ElevenLabsReportAgentProps["mode"], pdfHref: string) {
  return JSON.stringify(
    {
      instruction:
        "Use this dashboard report as the authoritative context for the next user question. Do not answer from outside knowledge unless the user explicitly asks for general background.",
      mode,
      dashboardSections: ["summary", "map", "sources", "findings", "action"],
      availableClientTools: [
        {
          name: "highlightFinding",
          params: { findingId: "string" },
          purpose: "Scroll to and highlight a cited finding row.",
        },
        {
          name: "focusMapPoint",
          params: { pointId: "string" },
          purpose: "Focus the globe and selected map legend on a risk point.",
        },
        {
          name: "scrollToDashboardSection",
          params: { section: "summary | map | sources | findings | action" },
          purpose: "Move the dashboard viewport to a named section.",
        },
        {
          name: "openComplaintLetter",
          params: {},
          purpose: "Open the existing complaint/compliance PDF route.",
        },
      ],
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
        complaintPdfHref: pdfHref,
      },
      sourceChecks: report.sourceChecks,
      findings: report.findings.map((finding) => ({
        id: finding.id,
        signal: finding.signal,
        severity: finding.severity,
        credibility: finding.credibility,
        geography: finding.geography,
        evidence: finding.evidence,
        citations: finding.citations.map((citation) => ({
          label: citation.label,
          source: citation.source,
          url: citation.url,
          accessedAt: citation.accessedAt,
        })),
      })),
      mapPoints: report.mapPoints.map((point) => ({
        id: point.id,
        label: point.label,
        latitude: point.latitude,
        longitude: point.longitude,
        risk: point.risk,
      })),
    },
    null,
    2,
  );
}

function buildSuggestedPrompts(report: Report): SuggestedPrompt[] {
  const strongestFinding = [...report.findings].sort(
    (a, b) => b.severity - a.severity || b.credibility - a.credibility,
  )[0];
  const weakestSource =
    report.sourceChecks.find((source) => source.status === "blocked") ??
    report.sourceChecks.find((source) => source.status === "pending") ??
    report.sourceChecks[0];
  const firstMapPoint = report.mapPoints[0];

  const prompts: SuggestedPrompt[] = [];

  if (strongestFinding) {
    prompts.push({
      label: "Strongest finding",
      text: `Walk me through the strongest finding, ${strongestFinding.signal}. Call highlightFinding with findingId ${strongestFinding.id} before explaining why it matters.`,
    });
  }

  if (weakestSource) {
    prompts.push({
      label: "Weakest source",
      text: `Which source is weakest or least ready for this report? Start with ${weakestSource.name} if it is the right candidate, and explain how its status affects confidence.`,
    });
  }

  prompts.push({
    label: "Letter strategy",
    text: "What should go into the complaint or compliance letter? If opening the letter would help, call openComplaintLetter.",
  });

  if (firstMapPoint) {
    prompts.push({
      label: "Map signals",
      text: `Explain the mapped geography, starting with ${firstMapPoint.label}. Call focusMapPoint with pointId ${firstMapPoint.id} before explaining the map signal.`,
    });
  }

  return prompts;
}
