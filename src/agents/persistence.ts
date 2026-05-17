import { createSupabaseServerClient } from "@/lib/supabase-server";
import type {
  Finding,
  InputType,
  MapArc,
  MapPoint,
  MapPointStage,
  MlPrediction,
  MlPredictionReason,
  ReportStatus,
  SourceStatus,
} from "@/lib/report-types";

import type { AgentName, AgentResult, FeatureBundle, SynthesisOutput } from "@/agents/types";
import { emitReportUpdate } from "@/agents/events";
import { AGENT_LABELS } from "@/agents/types";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return uuidPattern.test(value);
}

function isMissingMapArcsSchemaError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "PGRST205" ||
    error.code === "42P01" ||
    /map_arcs|schema cache|relation .* does not exist/i.test(error.message ?? "")
  );
}

function isMapPointStageConstraintError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "23514" && /map_points_stage_check|stage/i.test(error.message ?? "");
}

function legacyStage(stage: MapPointStage | undefined): MapPointStage | undefined {
  if (stage === "raw_material") return "origin";
  if (stage === "component_or_processing") return "labor";
  if (stage === "assembly") return "factory";
  if (stage === "consumer_market") return "consumer";
  return stage;
}

export function buildDefaultMapArcs(points: readonly MapPoint[]): MapArc[] {
  if (points.length < 2) return [];

  const ordered = [...points].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const grouped = new Map<number, MapPoint[]>();
  ordered.forEach((point, index) => {
    const key = point.order ?? index;
    grouped.set(key, [...(grouped.get(key) ?? []), point]);
  });

  const arcs: MapArc[] = [];
  const seen = new Set<string>();
  const orderKeys = [...grouped.keys()].sort((a, b) => a - b);
  for (let index = 0; index < orderKeys.length - 1; index += 1) {
    const fromGroup = grouped.get(orderKeys[index]) ?? [];
    const toGroup = grouped.get(orderKeys[index + 1]) ?? [];
    for (const from of fromGroup) {
      for (const to of toGroup) {
        const key = `${from.id}->${to.id}`;
        if (from.id === to.id || seen.has(key)) continue;
        seen.add(key);
        arcs.push({
          id: `${from.id}-${to.id}`,
          fromPointId: from.id,
          toPointId: to.id,
        });
      }
    }
  }

  return arcs;
}

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

  const initialAgents: AgentName[] = [
    "news",
    "watchlist",
    "supplier",
    "web_research",
    "pipeline",
    "legal",
    "risk_index",
  ];
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
  const rows = points.map((point) => ({
    ...(isUuid(point.id) ? { id: point.id } : {}),
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
  }));

  const { error } = await supabase.from("map_points").insert(rows);
  if (!error) {
    for (const point of points) {
      emitReportUpdate(reportId, { type: "mappoint", point });
    }
    return;
  }

  if (isMapPointStageConstraintError(error)) {
    const retryRows = rows.map((row, index) => ({
      ...row,
      stage: legacyStage(points[index]?.stage) ?? null,
    }));
    const { error: retryError } = await supabase.from("map_points").insert(retryRows);
    if (!retryError) {
      for (const point of points) {
        emitReportUpdate(reportId, { type: "mappoint", point });
      }
      return;
    }
    throw new Error(`Failed to store map points after legacy stage retry: ${retryError.message}`);
  }

  throw new Error(`Failed to store map points: ${error.message}`);
}

export async function replaceMapArcs(
  reportId: string,
  points: MapPoint[],
  explicitArcs: MapArc[] = [],
): Promise<{ stored: boolean; detail?: string }> {
  const supabase = createSupabaseServerClient();
  const { error: deleteError } = await supabase.from("map_arcs").delete().eq("report_id", reportId);
  if (deleteError) {
    if (isMissingMapArcsSchemaError(deleteError)) {
      return {
        stored: false,
        detail: "Map arcs were composed in memory but not persisted because public.map_arcs is missing from the live Supabase schema cache.",
      };
    }
    throw new Error(`Failed to clear map arcs: ${deleteError.message}`);
  }

  const pointIds = new Set(points.map((point) => point.id));
  const candidateArcs = explicitArcs.length > 0 ? explicitArcs : buildDefaultMapArcs(points);
  const arcs = candidateArcs
    .filter((arc) => pointIds.has(arc.fromPointId) && pointIds.has(arc.toPointId))
    .filter((arc) => isUuid(arc.fromPointId) && isUuid(arc.toPointId));
  if (arcs.length === 0) return { stored: true };

  const seen = new Set<string>();
  const { error: insertError } = await supabase.from("map_arcs").insert(
    arcs
      .filter((arc) => {
        const key = `${arc.fromPointId}->${arc.toPointId}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((arc) => ({
        report_id: reportId,
        from_point_id: arc.fromPointId,
        to_point_id: arc.toPointId,
        label: arc.label ?? null,
      })),
  );
  if (insertError) {
    if (isMissingMapArcsSchemaError(insertError)) {
      return {
        stored: false,
        detail: "Map arcs were composed in memory but not persisted because public.map_arcs is missing from the live Supabase schema cache.",
      };
    }
    throw new Error(`Failed to store map arcs: ${insertError.message}`);
  }
  return { stored: true };
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
    mlPrediction?: MlPrediction | null;
    mlPredictionReason?: MlPredictionReason | null;
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
  if (patch.mlPrediction !== undefined) payload.ml_prediction = patch.mlPrediction;
  if (patch.mlPredictionReason !== undefined) payload.ml_prediction_reason = patch.mlPredictionReason;

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
  mlPrediction?: MlPrediction | null,
  mlPredictionReason?: MlPredictionReason | null,
  sourceNoteSuffix?: string,
): Promise<void> {
  const agentNames = Object.values(agentResults).map((result) => result?.status).filter(Boolean);
  const liveCount = agentNames.filter((s) => s === "ready").length;
  const baseNote =
    liveCount > 0
      ? `Synthesized from ${liveCount} live sources and ${agentNames.length - liveCount} snapshot/cached sources.`
      : "Synthesized from cached/snapshot sources only.";
  const note = sourceNoteSuffix ? `${baseNote} ${sourceNoteSuffix}` : baseNote;

  await patchReport(reportId, {
    title: synthesis.title,
    summary: synthesis.summary,
    recommendedAction: synthesis.recommendedAction,
    severity: synthesis.severity,
    credibility: synthesis.credibility,
    overallRisk: synthesis.overallRisk,
    status: "ready",
    sourceNote: note,
    mlPrediction: mlPrediction ?? null,
    mlPredictionReason: mlPredictionReason ?? null,
  });
}
