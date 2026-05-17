import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { ExploitCategory, MapPoint, MapPointStage } from "@/lib/report-types";

import { addReportSubscriber, emitReportUpdate, type Subscriber } from "@/agents/events";
import { getCompiledGraph } from "@/agents/orchestrator";
import { AGENT_LABELS, type AgentName, type OrchestratorInput } from "@/agents/types";

const completed = new Set<string>();

const LABEL_TO_AGENT: Record<string, AgentName> = Object.fromEntries(
  (Object.entries(AGENT_LABELS) as [AgentName, string][]).map(([name, label]) => [label, name]),
);

type PersistedMapPointRow = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  risk: "high" | "medium" | "low";
  exploit_type: string | null;
  severity: number | null;
  stage: string | null;
  order: number | null;
  causes: string[] | null;
  sources: MapPoint["sources"] | null;
};

function isMapPoint(value: unknown): value is MapPoint {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<MapPoint>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.label === "string" &&
    typeof candidate.latitude === "number" &&
    typeof candidate.longitude === "number" &&
    (candidate.risk === "high" || candidate.risk === "medium" || candidate.risk === "low")
  );
}

function mapPersistedPoint(row: PersistedMapPointRow): MapPoint {
  return {
    id: row.id,
    label: row.label,
    latitude: row.latitude,
    longitude: row.longitude,
    risk: row.risk,
    exploitType: (row.exploit_type as ExploitCategory | null) ?? undefined,
    severity: row.severity ?? undefined,
    stage: (row.stage as MapPointStage | null) ?? undefined,
    order: row.order ?? undefined,
    causes: row.causes ?? undefined,
    sources: row.sources ?? undefined,
  };
}

async function replayState(reportId: string, fn: Subscriber): Promise<void> {
  try {
    const supabase = createSupabaseServerClient();

    const [{ data: statusRows }, { data: reportRow }, { data: findingsRows }, { data: mapRows }] = await Promise.all([
      supabase.from("source_status").select("name,status,detail").eq("report_id", reportId),
      supabase
        .from("reports")
        .select("status,severity,credibility,overall_risk")
        .eq("id", reportId)
        .maybeSingle(),
      supabase.from("findings").select("id").eq("report_id", reportId),
      supabase
        .from("map_points")
        .select("id,label,latitude,longitude,risk,exploit_type,severity,stage,order,causes,sources")
        .eq("report_id", reportId)
        .order("order", { ascending: true }),
    ]);

    const findingsByAgent = new Map<AgentName, number>();
    if (findingsRows) {
      // Without a join, we can't attribute findings to an agent.
      // The dashboard's per-agent counter is best-effort during replay.
    }

    if (statusRows) {
      for (const row of statusRows as { name: string; status: string; detail: string }[]) {
        const agent = LABEL_TO_AGENT[row.name];
        if (!agent) continue;
        fn({
          type: "agent",
          name: agent,
          status: row.status as "pending" | "running" | "ready" | "snapshot" | "blocked",
          detail: row.detail,
          findingCount: findingsByAgent.get(agent),
        });
      }
    }

    if (mapRows) {
      for (const row of mapRows as PersistedMapPointRow[]) {
        fn({ type: "mappoint", point: mapPersistedPoint(row) });
      }
    }

    if (reportRow) {
      const report = reportRow as {
        status: string;
        severity: number;
        credibility: number;
        overall_risk: number;
      };
      if (report.status === "ready" || report.status === "failed") {
        fn({
          type: "synthesis",
          severity: report.severity,
          credibility: report.credibility,
          overallRisk: report.overall_risk,
        });
        fn({ type: "done", reportId });
      }
    }
  } catch {
    // Replay is best-effort; live updates still work even if replay fails.
  }
}

export function subscribe(reportId: string, fn: Subscriber): () => void {
  const unsubscribe = addReportSubscriber(reportId, fn);

  // Replay current state so late subscribers don't miss already-completed agents.
  void replayState(reportId, fn);

  // If the swarm has already emitted 'done', the replay above will surface it.
  return unsubscribe;
}

export async function runSwarm(input: OrchestratorInput): Promise<void> {
  const graph = getCompiledGraph();

  const initialState = {
    reportId: input.reportId,
    inputType: input.inputType,
    query: input.query,
    onboarding: input.onboarding,
  };

  try {
    const stream = await graph.stream(initialState, { streamMode: "updates" });

    for await (const chunk of stream) {
      for (const [nodeName, nodeUpdate] of Object.entries(chunk)) {
        handleNodeUpdate(input.reportId, nodeName, nodeUpdate as Record<string, unknown>);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emitReportUpdate(input.reportId, { type: "error", message });
  } finally {
    completed.add(input.reportId);
    emitReportUpdate(input.reportId, { type: "done", reportId: input.reportId });
  }
}

function handleNodeUpdate(reportId: string, node: string, update: Record<string, unknown>): void {
  const emittedPointIds = new Set<string>();
  const emitMapPoint = (point: MapPoint) => {
    if (emittedPointIds.has(point.id)) return;
    emittedPointIds.add(point.id);
    emitReportUpdate(reportId, { type: "mappoint", point });
  };

  const agentsUpdate =
    (update.agents as Record<
      string,
      {
        agent: string;
        status: string;
        detail: string;
        findings: unknown[];
        mapPoints?: unknown[];
      }
    >) ?? null;
  if (agentsUpdate) {
    for (const [name, result] of Object.entries(agentsUpdate)) {
      if (!result) continue;
      emitReportUpdate(reportId, {
        type: "agent",
        name: name as AgentName,
        status: result.status as "ready" | "snapshot" | "blocked",
        detail: result.detail,
        findingCount: Array.isArray(result.findings) ? result.findings.length : 0,
      });
      if (Array.isArray(result.mapPoints)) {
        result.mapPoints.filter(isMapPoint).forEach(emitMapPoint);
      }
    }
  }

  if (Array.isArray(update.mapPoints)) {
    update.mapPoints.filter(isMapPoint).forEach(emitMapPoint);
  }

  const synthesis = update.synthesis as { severity: number; credibility: number; overallRisk: number } | undefined;
  if (synthesis) {
    emitReportUpdate(reportId, {
      type: "synthesis",
      severity: synthesis.severity,
      credibility: synthesis.credibility,
      overallRisk: synthesis.overallRisk,
    });
  }

  if (node === "ingest") {
    for (const name of ["news", "watchlist", "supplier", "web_research", "legal", "risk_index"] as const) {
      emitReportUpdate(reportId, { type: "agent", name, status: "running" });
    }
  }
}
