import { createSupabaseServerClient } from "@/lib/supabase-server";

import { getCompiledGraph } from "@/agents/orchestrator";
import { AGENT_LABELS, type AgentName, type OrchestratorInput, type StateUpdate } from "@/agents/types";

type Subscriber = (update: StateUpdate) => void;

const subscribers = new Map<string, Set<Subscriber>>();
const completed = new Set<string>();

function emit(reportId: string, update: StateUpdate): void {
  const set = subscribers.get(reportId);
  if (!set) return;
  for (const fn of set) {
    try {
      fn(update);
    } catch {
      // subscriber errors must never break the swarm
    }
  }
}

const LABEL_TO_AGENT: Record<string, AgentName> = Object.fromEntries(
  (Object.entries(AGENT_LABELS) as [AgentName, string][]).map(([name, label]) => [label, name]),
);

async function replayState(reportId: string, fn: Subscriber): Promise<void> {
  try {
    const supabase = createSupabaseServerClient();

    const [{ data: statusRows }, { data: reportRow }, { data: findingsRows }] = await Promise.all([
      supabase.from("source_status").select("name,status,detail").eq("report_id", reportId),
      supabase
        .from("reports")
        .select("status,severity,credibility,overall_risk")
        .eq("id", reportId)
        .maybeSingle(),
      supabase.from("findings").select("id").eq("report_id", reportId),
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
  let set = subscribers.get(reportId);
  if (!set) {
    set = new Set();
    subscribers.set(reportId, set);
  }
  set.add(fn);

  // Replay current state so late subscribers don't miss already-completed agents.
  void replayState(reportId, fn);

  // If the swarm has already emitted 'done', the replay above will surface it.
  return () => {
    set?.delete(fn);
    if (set && set.size === 0) {
      subscribers.delete(reportId);
    }
  };
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
    emit(input.reportId, { type: "error", message });
  } finally {
    completed.add(input.reportId);
    emit(input.reportId, { type: "done", reportId: input.reportId });
  }
}

function handleNodeUpdate(reportId: string, node: string, update: Record<string, unknown>): void {
  const agentsUpdate = (update.agents as Record<string, { agent: string; status: string; detail: string; findings: unknown[] }>) ?? null;
  if (agentsUpdate) {
    for (const [name, result] of Object.entries(agentsUpdate)) {
      if (!result) continue;
      emit(reportId, {
        type: "agent",
        name: name as AgentName,
        status: result.status as "ready" | "snapshot" | "blocked",
        detail: result.detail,
        findingCount: Array.isArray(result.findings) ? result.findings.length : 0,
      });
    }
  }

  const synthesis = update.synthesis as { severity: number; credibility: number; overallRisk: number } | undefined;
  if (synthesis) {
    emit(reportId, {
      type: "synthesis",
      severity: synthesis.severity,
      credibility: synthesis.credibility,
      overallRisk: synthesis.overallRisk,
    });
  }

  if (node === "ingest") {
    for (const name of ["news", "watchlist", "supplier", "web_research", "legal", "risk_index"] as const) {
      emit(reportId, { type: "agent", name, status: "running" });
    }
  }
}
