import type { OrchestratorState, OrchestratorUpdate } from "@/agents/state";
import { finalizeReportFromSynthesis, insertFeatureBundle, patchReport } from "@/agents/persistence";

export async function persistNode(state: OrchestratorState): Promise<OrchestratorUpdate> {
  if (state.featureBundle) {
    await insertFeatureBundle(state.reportId, state.featureBundle);
  }

  if (state.synthesis) {
    await finalizeReportFromSynthesis(state.reportId, state.synthesis, state.agents);
  } else {
    await patchReport(state.reportId, {
      status: "failed",
      sourceNote: "Synthesis stage produced no output.",
    });
  }

  return {};
}
