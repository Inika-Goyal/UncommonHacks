import { randomUUID } from "node:crypto";

import type { Citation, MapPoint } from "@/lib/report-types";

import type { OrchestratorState, OrchestratorUpdate } from "@/agents/state";
import { lookupGsi, type GsiCountry } from "@/agents/tools/global-slavery-index";
import { runAgentNode, extractFindingsWithLlm } from "@/agents/nodes/_helpers";

const accessedAt = () => new Date().toISOString().slice(0, 10);

const COUNTRY_CENTROIDS: Record<string, { lat: number; lng: number }> = {
  PRK: { lat: 40.34, lng: 127.51 },
  ERI: { lat: 15.18, lng: 39.78 },
  MRT: { lat: 21.0, lng: -10.94 },
  SAU: { lat: 23.89, lng: 45.08 },
  TUR: { lat: 38.96, lng: 35.24 },
  TJK: { lat: 38.86, lng: 71.28 },
  ARE: { lat: 23.42, lng: 53.85 },
  RUS: { lat: 61.52, lng: 105.32 },
  AFG: { lat: 33.94, lng: 67.71 },
  KWT: { lat: 29.31, lng: 47.48 },
  CHN: { lat: 35.86, lng: 104.2 },
  IND: { lat: 20.59, lng: 78.96 },
  BGD: { lat: 23.68, lng: 90.36 },
  KHM: { lat: 12.57, lng: 104.99 },
  MMR: { lat: 21.92, lng: 95.96 },
  PAK: { lat: 30.38, lng: 69.35 },
  IDN: { lat: -0.79, lng: 113.92 },
  PHL: { lat: 12.88, lng: 121.77 },
  VNM: { lat: 14.06, lng: 108.28 },
  THA: { lat: 15.87, lng: 100.99 },
  NGA: { lat: 9.08, lng: 8.68 },
  ETH: { lat: 9.15, lng: 40.49 },
  BRA: { lat: -14.24, lng: -51.93 },
  MEX: { lat: 23.63, lng: -102.55 },
  USA: { lat: 39.83, lng: -98.58 },
  GBR: { lat: 55.38, lng: -3.44 },
  IRN: { lat: 32.43, lng: 53.69 },
  SDN: { lat: 12.86, lng: 30.22 },
  SSD: { lat: 6.88, lng: 31.31 },
  YEM: { lat: 15.55, lng: 48.52 },
};

function severityFromPrevalence(prevalence: number): number {
  if (prevalence >= 20) return 5;
  if (prevalence >= 10) return 4;
  if (prevalence >= 5) return 3;
  if (prevalence >= 2) return 2;
  return 1;
}

function riskFromSeverity(severity: number): "high" | "medium" | "low" {
  if (severity >= 4) return "high";
  if (severity >= 3) return "medium";
  return "low";
}

function gsiCauses(entry: GsiCountry): string[] {
  const causes: string[] = [];
  if (entry.governmentResponseScore < 30) {
    causes.push(`Weak government response (${entry.governmentResponseScore}/100)`);
  }
  if (entry.vulnerabilityScore >= 60) {
    causes.push(`High population vulnerability (${entry.vulnerabilityScore}/100)`);
  }
  causes.push(
    `${entry.prevalencePer1000.toFixed(1)} per 1000 prevalence (~${entry.estimatedVictims.toLocaleString()} victims)`,
  );
  return causes;
}

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

      const mapPoints: MapPoint[] = scores.flatMap<MapPoint>((entry) => {
        const centroid = COUNTRY_CENTROIDS[entry.iso3];
        if (!centroid) return [];
        const severity = severityFromPrevalence(entry.prevalencePer1000);
        return [
          {
            id: randomUUID(),
            label: `${entry.country} (GSI rank ${entry.rank})`,
            latitude: centroid.lat,
            longitude: centroid.lng,
            risk: riskFromSeverity(severity),
            exploitType: "forced_labor",
            severity,
            stage: "origin",
            order: 0,
            causes: gsiCauses(entry),
            sources: [
              {
                label: `Global Slavery Index — ${entry.country}`,
                url: "https://www.walkfree.org/global-slavery-index/",
              },
            ],
          },
        ];
      });

      return {
        status: lookup.source === "live" ? "ready" as const : "snapshot" as const,
        detail: scores.length > 0
          ? `${scores.length} countries scored; weighted prevalence ${weightedScore?.toFixed(2) ?? "n/a"}/1000.`
          : "No countries resolved from the query or onboarding input.",
        findings: decoratedFindings,
        mapPoints,
        rawFeatures,
      };
    },
  });

  return { agents: { risk_index: result }, mapPoints: result.mapPoints };
}
