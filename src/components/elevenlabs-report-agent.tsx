"use client";

import { ConversationProvider, useConversation, useConversationClientTool } from "@elevenlabs/react";
import {
  Command,
  FileText,
  ListChecks,
  MapPin,
  MessageSquare,
  Mic,
  MicOff,
  Navigation,
  PhoneOff,
  Radio,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

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

type CommandAction = {
  id: string;
  label: string;
  detail: string;
  icon: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
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
  const [isOpen, setIsOpen] = useState(false);
  const [contextReadyId, setContextReadyId] = useState<string | null>(null);
  const shellRef = useRef<HTMLElement | null>(null);
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

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && key === "k") {
        event.preventDefault();
        setIsOpen((current) => !current);
        return;
      }
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    function onPointerDown(event: PointerEvent) {
      if (!shellRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [isOpen]);

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

  const sectionActions = useMemo<CommandAction[]>(
    () => [
      {
        id: "summary",
        label: "Executive summary",
        detail: "Jump to the report narrative and scores.",
        icon: <MessageSquare aria-hidden="true" size={15} />,
        onSelect: () => {
          tools.scrollToDashboardSection("summary");
          setIsOpen(false);
        },
      },
      {
        id: "findings",
        label: "Cited findings",
        detail: "Review the evidence rows ElevenLabs can highlight.",
        icon: <ListChecks aria-hidden="true" size={15} />,
        onSelect: () => {
          tools.scrollToDashboardSection("findings");
          setIsOpen(false);
        },
      },
      {
        id: "map",
        label: "Signal map",
        detail: "Move to the geographic risk surface.",
        icon: <MapPin aria-hidden="true" size={15} />,
        onSelect: () => {
          tools.scrollToDashboardSection("map");
          setIsOpen(false);
        },
      },
      {
        id: "sources",
        label: "Source status",
        detail: "Check which live sources are ready or blocked.",
        icon: <Radio aria-hidden="true" size={15} />,
        onSelect: () => {
          tools.scrollToDashboardSection("sources");
          setIsOpen(false);
        },
      },
      {
        id: "action",
        label: "Recommended action",
        detail: "Jump to the next compliance step.",
        icon: <Navigation aria-hidden="true" size={15} />,
        onSelect: () => {
          tools.scrollToDashboardSection("action");
          setIsOpen(false);
        },
      },
      {
        id: "letter",
        label: "Open complaint PDF",
        detail: "Open the generated complaint letter route.",
        icon: <FileText aria-hidden="true" size={15} />,
        onSelect: () => {
          tools.openComplaintLetter();
          setIsOpen(false);
        },
      },
    ],
    [tools],
  );

  return (
    <section ref={shellRef} className="voice-command-shell" aria-label="ElevenLabs report analyst">
      <button
        className={`voice-command-trigger${isOpen ? " voice-command-trigger-open" : ""}`}
        type="button"
        aria-expanded={isOpen}
        aria-controls="voice-command-menu"
        onClick={() => setIsOpen((current) => !current)}
      >
        {isConnected ? <Radio aria-hidden="true" size={14} /> : <Command aria-hidden="true" size={14} />}
        <span>Analyst</span>
        <kbd>Cmd K</kbd>
      </button>

      {isOpen ? (
        <div id="voice-command-menu" className="voice-command-menu" role="dialog" aria-label="Report analyst actions">
          <div className="voice-command-head">
            <div>
              <p>ElevenLabs analyst</p>
              <h2>Ask, jump, or draft from this report</h2>
            </div>
            <button className="voice-command-close" type="button" onClick={() => setIsOpen(false)} aria-label="Close analyst menu">
              <X aria-hidden="true" size={16} />
            </button>
          </div>

          <div className="voice-command-status">
            <span className={`status-pill voice-status-${conversation.status}`}>
              <Radio aria-hidden="true" size={12} />
              {statusLabel}
            </span>
            <span>
              {report.findings.length} findings / {report.sourceChecks.length} source checks / {report.mapPoints.length} map signals
            </span>
          </div>

          <div className="voice-command-controls">
            {isConnected ? (
              <>
                <button className="voice-control-button" type="button" onClick={() => conversation.setMuted(!conversation.isMuted)}>
                  {conversation.isMuted ? <MicOff aria-hidden="true" size={15} /> : <Mic aria-hidden="true" size={15} />}
                  <span>{conversation.isMuted ? "Unmute" : "Mute mic"}</span>
                </button>
                <button className="voice-control-button voice-control-danger" type="button" onClick={endVoiceAgent}>
                  <PhoneOff aria-hidden="true" size={15} />
                  <span>End session</span>
                </button>
              </>
            ) : (
              <button
                className="voice-control-button voice-control-primary"
                type="button"
                onClick={() => void startVoiceAgent()}
                disabled={isConnecting}
                aria-busy={isConnecting}
              >
                <Mic aria-hidden="true" size={15} />
                <span>{isConnecting ? statusLabel : "Start live analyst"}</span>
              </button>
            )}
          </div>

          <div className="voice-command-group">
            <div className="voice-command-group-title">
              <Sparkles aria-hidden="true" size={13} />
              Suggested asks
            </div>
            <div className="voice-command-action-grid">
              {suggestedPrompts.map((suggestedPrompt) => (
                <button
                  key={suggestedPrompt.label}
                  className="voice-command-action"
                  type="button"
                  onClick={() => submitSuggestedPrompt(suggestedPrompt)}
                  disabled={isConnecting}
                >
                  <Sparkles aria-hidden="true" size={15} />
                  <span>
                    <strong>{suggestedPrompt.label}</strong>
                    <small>{promptPreview(suggestedPrompt.text)}</small>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="voice-command-group">
            <div className="voice-command-group-title">
              <Navigation aria-hidden="true" size={13} />
              Dashboard actions
            </div>
            <div className="voice-command-action-grid">
              {sectionActions.map((action) => (
                <button
                  key={action.id}
                  className="voice-command-action"
                  type="button"
                  onClick={action.onSelect}
                  disabled={action.disabled}
                >
                  {action.icon}
                  <span>
                    <strong>{action.label}</strong>
                    <small>{action.detail}</small>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {conversation.message ? <p className="voice-agent-message">{conversation.message}</p> : null}
          {error ? <p className="voice-agent-error" role="alert">{error}</p> : null}
        </div>
      ) : null}
    </section>
  );
}

function promptPreview(value: string) {
  return value.length > 86 ? `${value.slice(0, 83)}...` : value;
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
