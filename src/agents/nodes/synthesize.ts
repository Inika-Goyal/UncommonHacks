import { z } from "zod";

import { createChatModel } from "@/agents/llm";
import { buildFeatureBundle } from "@/agents/ml/feature-bundle";
import { localScoring, predictWithMl, type MlPrediction } from "@/agents/ml/predict-bridge";
import { NARRATIVE_SYSTEM_PROMPT } from "@/agents/prompts";
import type { OrchestratorState, OrchestratorUpdate } from "@/agents/state";
import { lookupGsi } from "@/agents/tools/global-slavery-index";
import type { AgentResult, SynthesisOutput } from "@/agents/types";

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

async function resolveIso3(primaryCountry: string | undefined): Promise<string | null> {
  if (!primaryCountry) return null;
  try {
    const gsi = await lookupGsi([primaryCountry]);
    if (gsi.source === "miss") return null;
    return gsi.payload.scores[0]?.iso3 ?? null;
  } catch {
    return null;
  }
}

async function getScores(
  state: OrchestratorState,
  bundle: ReturnType<typeof buildFeatureBundle>,
): Promise<{ scores: ReturnType<typeof localScoring>; mlPrediction: MlPrediction | null }> {
  const iso3 = await resolveIso3(state.countries[0]);

  if (iso3) {
    try {
      const prediction = await predictWithMl({ country: iso3 });
      return {
        scores: {
          severity: prediction.scores.severity,
          credibility: prediction.scores.credibility,
          overallRisk: prediction.scores.overall_risk,
          rationale: prediction.scores.rationale,
        },
        mlPrediction: prediction,
      };
    } catch (err) {
      console.warn(
        `[ml] predictWithMl(${iso3}) failed, falling back to localScoring:`,
        (err as Error).message,
      );
    }
  } else if (state.countries[0]) {
    console.warn(
      `[ml] could not resolve "${state.countries[0]}" to an ISO3 code in the GSI lookup — using localScoring`,
    );
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

  const { scores, mlPrediction } = await getScores(state, bundle);

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
    mlPrediction,
  };
}
