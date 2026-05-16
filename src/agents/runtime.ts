import { getCompiledGraph } from "@/agents/orchestrator";
import type { OrchestratorInput, StateUpdate } from "@/agents/types";

type Subscriber = (update: StateUpdate) => void;

const subscribers = new Map<string, Set<Subscriber>>();

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

export function subscribe(reportId: string, fn: Subscriber): () => void {
  let set = subscribers.get(reportId);
  if (!set) {
    set = new Set();
    subscribers.set(reportId, set);
  }
  set.add(fn);
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
        name: name as StateUpdate extends { type: "agent"; name: infer N } ? N : never,
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
    for (const name of ["news", "watchlist", "supplier", "legal", "risk_index"] as const) {
      emit(reportId, { type: "agent", name, status: "running" });
    }
  }
}
