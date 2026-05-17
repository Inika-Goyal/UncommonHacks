import type { Citation } from "@/lib/report-types";

import type { OrchestratorState, OrchestratorUpdate } from "@/agents/state";
import { lookupGsi, type GsiCountry } from "@/agents/tools/global-slavery-index";
import { runAgentNode, extractFindingsWithLlm } from "@/agents/nodes/_helpers";

const accessedAt = () => new Date().toISOString().slice(0, 10);

function formatScores(scores: GsiCountry[]): string {
  if (scores.length === 0) return "No country scores resolved for the requested geographies.";
  return scores
    .map(
      (entry, idx) =>
        `${idx + 1}. ${entry.country} (rank ${entry.rank}): prevalence=${entry.prevalencePer1000.toFixed(1)}/1000, est. victims=${entry.estimatedVictims.toLocaleString()}, gov response=${entry.governmentResponseScore}, vulnerability=${entry.vulnerabilityScore}`,
    )
    .join("\n");
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
      const evidence = `Walk Free Global Slavery Index country scores (selected): \n${formatScores(scores)}\n\nWeighted average prevalence per 1000: ${weightedScore?.toFixed(2) ?? "n/a"}`;

      const findings = scores.length > 0
        ? await extractFindingsWithLlm({
            agent: "risk_index",
            evidence,
            instructions: `Subject: ${state.query}. Convert the country-level scores into findings about the relative forced-labor risk of operating or sourcing in these geographies. Citations should use Walk Free / Global Slavery Index. Accessed date: ${accessedAt()}.`,
          })
        : [];

      const decoratedFindings = findings.map((finding) => ({
        ...finding,
        citations: finding.citations.length > 0
          ? finding.citations
          : ([
              {
                label: "Global Slavery Index 2023 country data",
                source: "Walk Free Foundation",
                url: "https://www.walkfree.org/global-slavery-index/",
                accessedAt: accessedAt(),
              },
            ] satisfies Citation[]),
      }));

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
        findings: decoratedFindings,
        mapPoints: [],
        rawFeatures,
      };
    },
  });

  return { agents: { risk_index: result }, mapPoints: result.mapPoints };
}
