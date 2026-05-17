import type { OrchestratorState, OrchestratorUpdate } from "@/agents/state";
import {
  finalizeReportFromSynthesis,
  insertFeatureBundle,
  patchReport,
  replaceMapArcs,
} from "@/agents/persistence";

export async function persistNode(state: OrchestratorState): Promise<OrchestratorUpdate> {
  if (state.featureBundle) {
    await insertFeatureBundle(state.reportId, state.featureBundle);
  }

  const mapArcPersistence = await replaceMapArcs(state.reportId, state.mapPoints, state.mapArcs);

  if (state.synthesis) {
    await finalizeReportFromSynthesis(
      state.reportId,
      state.synthesis,
      state.agents,
      state.mlPrediction,
      state.mlPredictionReason,
      mapArcPersistence.detail,
    );
  } else {
    await patchReport(state.reportId, {
      status: "failed",
      sourceNote: "Synthesis stage produced no output.",
    });
  }

  return {};
}
