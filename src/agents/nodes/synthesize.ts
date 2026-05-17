import { z } from "zod";

import { createChatModel } from "@/agents/llm";
import { buildFeatureBundle } from "@/agents/ml/feature-bundle";
import {
  MlBridgeError,
  localScoring,
  predictWithMl,
  type MlBridgeReason,
  type MlPrediction,
} from "@/agents/ml/predict-bridge";
import { NARRATIVE_SYSTEM_PROMPT } from "@/agents/prompts";
import type { OrchestratorState, OrchestratorUpdate } from "@/agents/state";
import type { AgentResult, SynthesisOutput } from "@/agents/types";

const narrativeSchema = z.object({
  title: z.string().min(5),
  summary: z.string().min(20),
  recommendedAction: z.string().min(20),
  mlInsight: z
    .string()
    .min(20)
    .describe(
      "One plain-language sentence summarising the ML country-prediction for a non-technical reader. Avoid jargon (no 'prevalence', 'conformal interval', '/1k'). Reference the primary country, an approximate workers-per-1,000 estimate, and how it compares to the ~2/1,000 global typical. Example: 'The model estimates roughly 6 workers in every 1,000 face forced-labor conditions in China, where most of Shein's manufacturing sits — about 3x the global typical.'",
    ),
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

function fallbackNarrative(
  state: OrchestratorState,
  mlPrediction: MlPrediction | null,
): {
  title: string;
  summary: string;
  recommendedAction: string;
  mlInsight: string;
} {
  const findingCount = Object.values(state.agents).reduce(
    (n, a) => n + (a?.findings.length ?? 0),
    0,
  );
  const mlInsight = mlPrediction
    ? `The model estimates roughly ${mlPrediction.geographic_overall.predicted_prevalence_per_1k.toFixed(1)} workers in every 1,000 are at risk of forced-labor conditions in ${mlPrediction.country_name}, compared with about 2 in 1,000 globally.`
    : "The model could not produce a country-level estimate for this query.";
  return {
    title: `${state.query}: preliminary exploitation-risk briefing`,
    summary:
      findingCount > 0
        ? `Narrative fallback: ${findingCount} agent findings were collected; the LLM call did not return valid prose.`
        : "The agent swarm did not collect enough evidence to produce a narrative.",
    recommendedAction:
      "Re-run the investigation after confirming source availability and API access.",
    mlInsight,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function signCount(value: number): number {
  return value > 0 ? 1 : 0;
}

type AgentAdjustments = {
  severityFromAgents: number;
  credibilityFromAgents: number;
  cap: number;
  signalCount: number;
};

function computeAdjustments(bundle: ReturnType<typeof buildFeatureBundle>): AgentAdjustments {
  // Capped boost from agent signals on top of ML severity/credibility.
  //
  // Severity: weighted sum of every credible labor-risk signal. A
  // company that isn't literally on the UFLPA list but has many court
  // cases AND heavy news coverage AND ILO complaints should still see
  // a lift — that's the Shein case.
  //   UFLPA direct        : +0.6  (paired with hard floor in computeWatchlistFloor)
  //   OFAC direct         : +0.3
  //   Court cases (log)   : 0.35 * log10(1+N)
  //   "Several courts"    : +0.2 once court count ≥ 3
  //   News articles (log) : 0.15 * log10(1+N)
  //   ILO complaints (log): 0.2 * log10(1+N)
  const severityRaw =
    0.6 * signCount(bundle.watchlist.uflpaMatches.length) +
    0.3 * signCount(bundle.watchlist.ofacMatches.length) +
    0.35 * Math.log10(1 + bundle.legal.courtCaseCount) +
    (bundle.legal.courtCaseCount >= 3 ? 0.2 : 0) +
    0.15 * Math.log10(1 + Math.min(bundle.news.articleCount, 100)) +
    0.2 * Math.log10(1 + bundle.legal.iloComplaintCount);
  // Credibility: how many corroborating sources back the case up.
  const credibilityRaw =
    0.4 *
    Math.log10(
      1 +
        bundle.legal.courtCaseCount +
        bundle.legal.iloComplaintCount +
        Math.min(bundle.news.articleCount, 50),
    );

  // Corroborated-signal cap: a single weak signal stays capped at ±1
  // so noisy reports can't ratchet themselves to extremes. But when
  // multiple independent signals corroborate (UFLPA + court cases +
  // news, etc.) the cap lifts to ±2 so a Shein-style case isn't
  // pinned at the same ceiling as a one-mention Patagonia run.
  const corroboratingSignals =
    signCount(bundle.watchlist.uflpaMatches.length) +
    signCount(bundle.watchlist.ofacMatches.length) +
    (bundle.legal.courtCaseCount >= 2 ? 1 : 0) +
    (bundle.news.articleCount >= 20 ? 1 : 0);
  const cap = corroboratingSignals >= 2 ? 2 : 1;

  return {
    severityFromAgents: clamp(severityRaw, -cap, cap),
    credibilityFromAgents: clamp(credibilityRaw, -cap, cap),
    cap,
    signalCount: corroboratingSignals,
  };
}

type WatchlistFloor = {
  severityFloor: number;
  overallFloor: number;
  reason: "uflpa_match" | "ofac_match" | null;
};

function computeWatchlistFloor(bundle: ReturnType<typeof buildFeatureBundle>): WatchlistFloor {
  // A UFLPA entity-list hit is a near-decisive signal: floor severity
  // at 4 and overall_risk at 75. OFAC hits are still meaningful but
  // less specific to labor exploitation — floor severity at 3.
  if (bundle.watchlist.uflpaMatches.length > 0) {
    return { severityFloor: 4, overallFloor: 75, reason: "uflpa_match" };
  }
  if (bundle.watchlist.ofacMatches.length > 0) {
    return { severityFloor: 3, overallFloor: 0, reason: "ofac_match" };
  }
  return { severityFloor: 0, overallFloor: 0, reason: null };
}

async function getScores(
  state: OrchestratorState,
  bundle: ReturnType<typeof buildFeatureBundle>,
): Promise<{
  scores: ReturnType<typeof localScoring>;
  mlPrediction: MlPrediction | null;
  mlReason: MlBridgeReason | null;
}> {
  // panelCountries is the canonical multi-country basket built by the
  // enrich-countries node — supersedes the older single-country
  // `state.countries[0] / bundle.supplier.countriesCovered[0]` fallback.
  const panelCountries = state.panelCountries ?? [];
  const weights = state.countryWeights ?? {};

  if (panelCountries.length === 0) {
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
      mlReason: "ML_NO_COUNTRY",
    };
  }

  try {
    const prediction = await predictWithMl({ countries: panelCountries, weights });
    const adj = computeAdjustments(bundle);
    const floor = computeWatchlistFloor(bundle);

    // Use supply-chain (worst-link severity, weighted prevalence) when
    // multiple countries are in play; otherwise primary scores.
    const useSupply = panelCountries.length > 1 && prediction.supplyChain;
    const supply = prediction.supplyChain;
    const baseSeverity = useSupply && supply ? supply.scores.severity : prediction.scores.severity;
    const baseCredibility =
      useSupply && supply ? supply.scores.credibility : prediction.scores.credibility;
    const baseOverallRisk =
      useSupply && supply ? supply.scores.overall_risk : prediction.scores.overall_risk;
    const baseRationale =
      useSupply && supply ? supply.scores.rationale : prediction.scores.rationale;

    // Layered lift: agent-blend severity, then watchlist-floor override.
    const blendedSeverityPre = clamp(
      Math.round(baseSeverity + adj.severityFromAgents),
      1,
      5,
    );
    const blendedSeverity = Math.max(blendedSeverityPre, floor.severityFloor);
    const blendedCredibility = clamp(
      Math.round(baseCredibility + adj.credibilityFromAgents),
      1,
      5,
    );
    // Re-derive overall risk after the severity/credibility lift. The
    // multipliers (sev×12, cred×4) match the Python `overall_risk`
    // formula so a +1 severity lift contributes the same +12 it would
    // if the ML had produced that severity directly. Without this, the
    // agent boost decays sub-proportionally and reports that should
    // land in the 80s land in the 60s.
    const floorBonus = floor.reason === "uflpa_match" ? 10 : 0;
    const blendedOverallPre = clamp(
      Math.round(
        baseOverallRisk +
          (blendedSeverity - baseSeverity) * 12 +
          (blendedCredibility - baseCredibility) * 4 +
          floorBonus,
      ),
      0,
      100,
    );
    const blendedOverall = Math.max(blendedOverallPre, floor.overallFloor);

    const adjustmentRationaleParts: string[] = [];
    if (adj.severityFromAgents !== 0 || adj.credibilityFromAgents !== 0) {
      adjustmentRationaleParts.push(
        `Agent findings (watchlist, courts, news) adjusted ML scores by ±${adj.cap}. ${adj.signalCount} corroborating signals${adj.cap === 2 ? " — boost cap raised to ±2." : "."}`,
      );
    }
    if (floor.reason === "uflpa_match") {
      adjustmentRationaleParts.push(
        "UFLPA Entity-List exposure pinned severity at 4+ and overall risk at 75+.",
      );
    } else if (floor.reason === "ofac_match") {
      adjustmentRationaleParts.push("OFAC sanctions exposure pinned severity at 3+.");
    }
    const rationale =
      adjustmentRationaleParts.length > 0
        ? adjustmentRationaleParts.join(" ")
        : "Agent signals did not change the ML-derived scores for this report.";

    const adjustments = {
      severityFromMl: baseSeverity,
      severityFromAgents: adj.severityFromAgents,
      credibilityFromMl: baseCredibility,
      credibilityFromAgents: adj.credibilityFromAgents,
      floorReason: floor.reason,
      rationale,
    };

    return {
      scores: {
        severity: blendedSeverity,
        credibility: blendedCredibility,
        overallRisk: blendedOverall,
        rationale: baseRationale,
      },
      mlPrediction: { ...prediction, adjustments },
      mlReason: null,
    };
  } catch (err) {
    const reason: MlBridgeReason =
      err instanceof MlBridgeError ? err.reason : "ML_CLI_ERROR";
    const detail = err instanceof MlBridgeError ? err.detail ?? err.message : (err as Error).message;
    console.warn(`[ml] predictWithMl failed (${reason}): ${detail}`);

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
      mlReason: reason,
    };
  }
}

export async function synthesizeNode(state: OrchestratorState): Promise<OrchestratorUpdate> {
  const bundle = buildFeatureBundle(state);
  const persona = state.onboarding.reporterPersona ?? "NGO";
  const outputGoal = state.onboarding.outputGoal ?? "complaint";

  const { scores, mlPrediction, mlReason } = await getScores(state, bundle);

  const evidence = describeFindings(state);
  const model = createChatModel("synthesis").withStructuredOutput(narrativeSchema, {
    name: "narrative_output",
  });

  // Build a compact ML context block for the narrative LLM. The model
  // already passed us a per-country payload — share the headline
  // numbers so it can produce a plain-language `mlInsight` instead of
  // us hand-templating one in TS.
  const primaryCountry = mlPrediction?.country_name ?? null;
  const primaryPrev = mlPrediction?.geographic_overall.predicted_prevalence_per_1k ?? null;
  const primaryDrivers = mlPrediction?.top_drivers?.slice(0, 2).map((d) => d.label) ?? [];
  const byCountrySummary = mlPrediction?.byCountry
    ? Object.values(mlPrediction.byCountry)
        .map(
          (c) =>
            `${c.country} (${c.country_name}): ${c.geographic_overall.predicted_prevalence_per_1k.toFixed(2)}/1k, severity ${c.scores.severity}/5${c.observed_prevalence_per_1k != null ? `, observed ${c.observed_prevalence_per_1k.toFixed(2)}` : ""}`,
        )
        .join("\n")
    : null;
  const mlContext = mlPrediction
    ? `ML prediction context (use this to write the mlInsight field in PLAIN LANGUAGE — no jargon):
- Primary country: ${primaryCountry ?? "unknown"}
- Predicted forced-labor rate in primary country: ~${primaryPrev?.toFixed(1) ?? "?"} workers per 1,000 (global typical is ≈2 per 1,000)
- Top drivers behind this estimate: ${primaryDrivers.join(", ") || "n/a"}
- Per-country breakdown:
${byCountrySummary ?? "(single-country)"}`
    : `ML prediction unavailable for this report (reason: ${mlReason ?? "unknown"}). Generate a brief mlInsight explaining that the model could not produce a country-level estimate.`;

  let narrative: {
    title: string;
    summary: string;
    recommendedAction: string;
    mlInsight: string;
  };
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

${mlContext}

Agent findings:
${evidence || "(none)"}`,
      },
    ]);
  } catch {
    narrative = fallbackNarrative(state, mlPrediction);
  }

  const synthesis: SynthesisOutput = {
    title: narrative.title,
    summary: narrative.summary,
    recommendedAction: narrative.recommendedAction,
    severity: scores.severity,
    credibility: scores.credibility,
    overallRisk: scores.overallRisk,
  };

  // Stash mlReason on the prediction so the dashboard's empty-state
  // can render the right message. When mlPrediction is null, the
  // state-level mlPredictionReason carries the code.
  return {
    featureBundle: bundle,
    synthesis,
    mlPrediction,
    mlPredictionReason: mlReason,
    mlInsight: narrative.mlInsight,
  };
}
