import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { Finding, MapPoint, SourceStatus, InputType, ReportStatus } from "@/lib/report-types";

import type { AgentName, AgentResult, FeatureBundle, SynthesisOutput } from "@/agents/types";
import { AGENT_LABELS } from "@/agents/types";

export type ReportShellInput = {
  inputType: InputType;
  query: string;
  onboarding: {
    industry?: string;
    countries: string[];
    timeWindowMonths: number;
    reporterPersona: string;
    outputGoal: string;
  };
};

export async function createReportShell(input: ReportShellInput): Promise<string> {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("reports")
    .insert({
      input_type: input.inputType,
      query: input.query,
      title: `Investigation: ${input.query}`,
      summary: "Synthesis pending. The agent swarm is gathering evidence.",
      overall_risk: 0,
      severity: 1,
      credibility: 1,
      recommended_action: "Awaiting synthesis.",
      source_note: "Live agent swarm run.",
      status: "running",
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !data) {
    throw new Error(`Failed to create report shell: ${error?.message ?? "no row returned"}`);
  }

  const reportId = data.id;

  await supabase.from("onboarding_answers").insert({
    report_id: reportId,
    industry: input.onboarding.industry ?? null,
    countries: input.onboarding.countries,
    time_window_months: input.onboarding.timeWindowMonths,
    reporter_persona: input.onboarding.reporterPersona,
    output_goal: input.onboarding.outputGoal,
  });

  const initialAgents: AgentName[] = ["news", "watchlist", "supplier", "legal", "risk_index"];
  await supabase.from("source_status").insert(
    initialAgents.map((agent) => ({
      report_id: reportId,
      name: AGENT_LABELS[agent],
      status: "pending" as SourceStatus,
      detail: "Queued.",
    })),
  );

  return reportId;
}

export async function upsertSourceStatus(
  reportId: string,
  agent: AgentName,
  status: SourceStatus,
  detail: string,
): Promise<void> {
  const supabase = createSupabaseServerClient();
  await supabase
    .from("source_status")
    .upsert(
      { report_id: reportId, name: AGENT_LABELS[agent], status, detail },
      { onConflict: "report_id,name" },
    );
}

export async function insertFindings(
  reportId: string,
  findings: Finding[],
): Promise<void> {
  if (findings.length === 0) return;
  const supabase = createSupabaseServerClient();

  for (const finding of findings) {
    const { data: insertedFinding, error: findingError } = await supabase
      .from("findings")
      .insert({
        report_id: reportId,
        signal: finding.signal,
        severity: finding.severity,
        credibility: finding.credibility,
        geography: finding.geography,
        evidence: finding.evidence,
      })
      .select("id")
      .single<{ id: string }>();

    if (findingError || !insertedFinding) continue;

    if (finding.citations.length > 0) {
      await supabase.from("citations").insert(
        finding.citations.map((citation) => ({
          finding_id: insertedFinding.id,
          label: citation.label,
          source: citation.source,
          url: citation.url,
          accessed_at: citation.accessedAt,
        })),
      );
    }
  }
}

export async function insertMapPoints(reportId: string, points: MapPoint[]): Promise<void> {
  if (points.length === 0) return;
  const supabase = createSupabaseServerClient();
  await supabase.from("map_points").insert(
    points.map((point) => ({
      report_id: reportId,
      label: point.label,
      latitude: point.latitude,
      longitude: point.longitude,
      risk: point.risk,
      exploit_type: point.exploitType ?? null,
      severity: point.severity ?? null,
      stage: point.stage ?? null,
      order: point.order ?? null,
      causes: point.causes ?? null,
      sources: point.sources ?? null,
    })),
  );
}

export async function patchReport(
  reportId: string,
  patch: {
    title?: string;
    summary?: string;
    recommendedAction?: string;
    severity?: number;
    credibility?: number;
    overallRisk?: number;
    status?: ReportStatus;
    sourceNote?: string;
  },
): Promise<void> {
  const supabase = createSupabaseServerClient();
  const payload: Record<string, unknown> = {};
  if (patch.title !== undefined) payload.title = patch.title;
  if (patch.summary !== undefined) payload.summary = patch.summary;
  if (patch.recommendedAction !== undefined) payload.recommended_action = patch.recommendedAction;
  if (patch.severity !== undefined) payload.severity = patch.severity;
  if (patch.credibility !== undefined) payload.credibility = patch.credibility;
  if (patch.overallRisk !== undefined) payload.overall_risk = patch.overallRisk;
  if (patch.status !== undefined) payload.status = patch.status;
  if (patch.sourceNote !== undefined) payload.source_note = patch.sourceNote;

  if (Object.keys(payload).length === 0) return;
  await supabase.from("reports").update(payload).eq("id", reportId);
}

export async function insertFeatureBundle(reportId: string, bundle: FeatureBundle): Promise<void> {
  const supabase = createSupabaseServerClient();
  await supabase.from("feature_bundles").insert({
    report_id: reportId,
    version: bundle.version,
    bundle,
  });
}

export async function finalizeReportFromSynthesis(
  reportId: string,
  synthesis: SynthesisOutput,
  agentResults: Partial<Record<AgentName, AgentResult>>,
): Promise<void> {
  const agentNames = Object.values(agentResults).map((result) => result?.status).filter(Boolean);
  const liveCount = agentNames.filter((s) => s === "ready").length;
  const note =
    liveCount > 0
      ? `Synthesized from ${liveCount} live sources and ${agentNames.length - liveCount} snapshot/cached sources.`
      : "Synthesized from cached/snapshot sources only.";

  await patchReport(reportId, {
    title: synthesis.title,
    summary: synthesis.summary,
    recommendedAction: synthesis.recommendedAction,
    severity: synthesis.severity,
    credibility: synthesis.credibility,
    overallRisk: synthesis.overallRisk,
    status: "ready",
    sourceNote: note,
  });
}
