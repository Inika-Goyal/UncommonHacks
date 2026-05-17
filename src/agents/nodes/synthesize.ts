import { z } from "zod";

import { createChatModel } from "@/agents/llm";
import { buildFeatureBundle } from "@/agents/ml/feature-bundle";
import { localScoring, predictWithMl, type MlPrediction } from "@/agents/ml/predict-bridge";
import { NARRATIVE_SYSTEM_PROMPT } from "@/agents/prompts";
import type { OrchestratorState, OrchestratorUpdate } from "@/agents/state";
import type { AgentResult, SynthesisOutput } from "@/agents/types";

// The LLM is now restricted to narrative + nothing else. Numbers come
// from the ML predict CLI (geographic + cluster models); citations come
// from the source catalog returned by that CLI.
const narrativeSchema = z.object({
  title: z.string().min(5),
  summary: z.string().min(20),
  recommendedAction: z.string().min(20),
});

function describeFindings(state: OrchestratorState): string {
  const lines: string[] = [];
  for (const agent of Object.values(state.agents) as AgentResult[]) {
    if (!agent) continue;
    lines.push(
      `Agent: ${agent.agent} | status: ${agent.status} | findings: ${agent.findings.length}`,
    );
    for (const finding of agent.findings) {
      lines.push(
        `  - [${finding.severity}/${finding.credibility}] ${finding.signal} (${finding.geography}) — ${finding.evidence.slice(0, 240)}`,
      );
    }
  }
  return lines.join("\n");
}

function fallbackNarrative(state: OrchestratorState): {
  title: string;
  summary: string;
  recommendedAction: string;
} {
  const findingCount = Object.values(state.agents).reduce(
    (n, a) => n + (a?.findings.length ?? 0),
    0,
  );
  return {
    title: `${state.query}: preliminary exploitation-risk briefing`,
    summary:
      findingCount > 0
        ? `Narrative fallback: ${findingCount} agent findings were collected; the LLM call did not return valid prose.`
        : "The agent swarm did not collect enough evidence to produce a narrative.",
    recommendedAction:
      "Re-run the investigation after confirming source availability and API access.",
  };
}

async function getScores(
  state: OrchestratorState,
  bundle: ReturnType<typeof buildFeatureBundle>,
): Promise<{ scores: ReturnType<typeof localScoring>; mlPrediction: MlPrediction | null }> {
  // Try the Python ML CLI only when we can map the query to a country code
  // and an actual training year. Otherwise fall back to the deterministic
  // scorer so the demo never blocks on Python.
  const primaryCountry = state.countries[0];
  const targetYear = new Date().getFullYear() - 1; // year-t-1 features used to predict year-t

  if (primaryCountry) {
    try {
      const prediction = await predictWithMl({ country: primaryCountry, year: targetYear });
      return {
        scores: {
          severity: prediction.scores.severity,
          credibility: prediction.scores.credibility,
          overallRisk: prediction.scores.overall_risk,
          rationale: prediction.scores.rationale,
        },
        mlPrediction: prediction,
      };
    } catch {
      // fall through to local scoring
    }
  }

  const findingCount = Object.values(state.agents).reduce(
    (n, a) => n + (a?.findings.length ?? 0),
    0,
  );
  return {
    scores: localScoring({
      watchlistMatches: bundle.watchlist.matchCount,
      courtCases: bundle.legal.courtCaseCount,
      newsArticles: bundle.news.articleCount,
      gsiWeighted: bundle.riskIndex.weightedScore,
      findingCount,
    }),
    mlPrediction: null,
  };
}

export async function synthesizeNode(state: OrchestratorState): Promise<OrchestratorUpdate> {
  const bundle = buildFeatureBundle(state);
  const persona = state.onboarding.reporterPersona ?? "NGO";
  const outputGoal = state.onboarding.outputGoal ?? "complaint";

  // 1. Numeric scores come from the ML CLI (or deterministic fallback).
  const { scores, mlPrediction } = await getScores(state, bundle);

  // 2. The LLM only writes narrative — no severity/credibility/risk.
  const evidence = describeFindings(state);
  const model = createChatModel("synthesis").withStructuredOutput(narrativeSchema, {
    name: "narrative_output",
  });

  let narrative: { title: string; summary: string; recommendedAction: string };
  try {
    narrative = await model.invoke([
      { role: "system", content: NARRATIVE_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Subject: ${state.query} (${state.inputType})
Countries in scope: ${state.countries.join(", ") || "—"}
Industry: ${state.onboarding.industry ?? "unspecified"}
Reporter persona: ${persona}
Output goal: ${outputGoal}

ML-derived scores (do NOT contradict these — narrate them):
- severity: ${scores.severity}/5
- credibility: ${scores.credibility}/5
- overallRisk: ${scores.overallRisk}/100

Agent findings:
${evidence || "(none)"}`,
      },
    ]);
  } catch {
    narrative = fallbackNarrative(state);
  }

  const synthesis: SynthesisOutput = {
    ...narrative,
    severity: scores.severity,
    credibility: scores.credibility,
    overallRisk: scores.overallRisk,
  };

  return {
    featureBundle: bundle,
    synthesis,
    // Persist ML prediction + sources alongside the bundle so the UI
    // can render the "Sources" section without re-querying Python.
    ...(mlPrediction ? { mlPrediction } : {}),
  } as OrchestratorUpdate;
}
