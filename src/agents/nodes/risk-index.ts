import { randomUUID } from "node:crypto";

import type { Citation, Finding } from "@/lib/report-types";

import type { OrchestratorState, OrchestratorUpdate } from "@/agents/state";
import { lookupGsi, type GsiCountry } from "@/agents/tools/global-slavery-index";
import { runAgentNode } from "@/agents/nodes/_helpers";

const accessedAt = () => new Date().toISOString().slice(0, 10);

const GSI_CITATION = (): Citation => ({
  label: "Global Slavery Index 2023 country data",
  source: "Walk Free Foundation",
  url: "https://www.walkfree.org/global-slavery-index/",
  accessedAt: accessedAt(),
});

function severityFromScore(entry: GsiCountry): number {
  if (entry.prevalencePer1000 >= 10 || entry.vulnerabilityScore >= 75) return 5;
  if (entry.prevalencePer1000 >= 7 || entry.vulnerabilityScore >= 60) return 4;
  if (entry.prevalencePer1000 >= 4 || entry.vulnerabilityScore >= 45) return 3;
  return 2;
}

function buildRiskIndexFindings(scores: GsiCountry[]): Finding[] {
  return [...scores]
    .sort((a, b) => b.prevalencePer1000 - a.prevalencePer1000)
    .slice(0, 3)
    .map((entry) => ({
      id: randomUUID(),
      signal: `${entry.country} country-level forced-labor prevalence signal`,
      severity: severityFromScore(entry),
      credibility: 5,
      geography: entry.country,
      evidence: `Walk Free's 2023 Global Slavery Index ranks ${entry.country} at ${entry.rank}, with estimated modern-slavery prevalence of ${entry.prevalencePer1000.toFixed(1)} per 1,000 people and ${entry.estimatedVictims.toLocaleString()} estimated victims. The country has a vulnerability score of ${entry.vulnerabilityScore} and government response score of ${entry.governmentResponseScore}.`,
      citations: [GSI_CITATION()],
    }));
}

export async function riskIndexNode(state: OrchestratorState): Promise<OrchestratorUpdate> {
  const result = await runAgentNode({
    agent: "risk_index",
    reportId: state.reportId,
    runner: async () => {
      const lookup = await lookupGsi(state.countries);

      if (lookup.source === "miss") {
        throw lookup.error instanceof Error ? lookup.error : new Error("GSI lookup failed.");
      }

      const { scores, weightedScore } = lookup.payload;
      const findings = buildRiskIndexFindings(scores);

      const rawFeatures = {
        countryScores: scores.map((entry) => ({
          country: entry.country,
          gsiScore: entry.prevalencePer1000,
          gsiRank: entry.rank,
        })),
        weightedScore,
      };

      return {
        status: lookup.source === "live" ? "ready" as const : "snapshot" as const,
        detail: scores.length > 0
          ? `${scores.length} countries scored; weighted prevalence ${weightedScore?.toFixed(2) ?? "n/a"}/1000.`
          : "No countries resolved from the query or onboarding input.",
        findings,
        mapPoints: [],
        rawFeatures,
      };
    },
  });

  return { agents: { risk_index: result }, mapPoints: result.mapPoints };
}
