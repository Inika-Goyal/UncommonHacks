import { randomUUID } from "node:crypto";

import type { Citation, MapPoint } from "@/lib/report-types";

import type { OrchestratorState, OrchestratorUpdate } from "@/agents/state";
import { lookupOpenSupplyHub, type OshFacility } from "@/agents/tools/open-supply-hub";
import { runAgentNode, extractFindingsWithLlm } from "@/agents/nodes/_helpers";

const accessedAt = () => new Date().toISOString().slice(0, 10);

function formatFacilities(facilities: OshFacility[]): string {
  if (facilities.length === 0) return "No facilities returned by Open Supply Hub.";
  return facilities
    .slice(0, 20)
    .map(
      (facility, idx) =>
        `${idx + 1}. ${facility.name} | ${facility.address} | ${facility.country} | sectors=${facility.sectors.join(", ") || "n/a"}`,
    )
    .join("\n");
}

function pickHighRiskCountries(state: OrchestratorState): Set<string> {
  return new Set(state.countries.map((country) => country.toLowerCase()));
}

function facilityRisk(facility: OshFacility, highRisk: Set<string>): "high" | "medium" | "low" {
  if (highRisk.has(facility.country.toLowerCase())) return "high";
  if (facility.sectors.some((s) => /apparel|garment|textile|mining|electronics|seafood|agriculture/i.test(s))) {
    return "medium";
  }
  return "low";
}

export async function supplierNode(state: OrchestratorState): Promise<OrchestratorUpdate> {
  const result = await runAgentNode({
    agent: "supplier",
    reportId: state.reportId,
    runner: async () => {
      const lookup = await lookupOpenSupplyHub(state.query, state.countries);

      if (lookup.source === "miss") {
        const message = lookup.error instanceof Error ? lookup.error.message : "Open Supply Hub lookup failed.";
        return {
          status: "blocked" as const,
          detail: process.env.OPEN_SUPPLY_HUB_TOKEN
            ? `OSH error: ${message.slice(0, 150)}`
            : "Open Supply Hub requires OPEN_SUPPLY_HUB_TOKEN. Add the env var to enable live supplier data.",
          findings: [],
          mapPoints: [],
          rawFeatures: {
            facilityCount: 0,
            countriesCovered: [],
            sectors: [],
          },
        };
      }

      const { facilities, total, authenticated } = lookup.payload;
      const evidence = formatFacilities(facilities);

      const findings = await extractFindingsWithLlm({
        agent: "supplier",
        evidence,
        instructions: `Subject: ${state.query}. Identify supplier-transparency findings. Each citation must use https://opensupplyhub.org/ as the source. Accessed date: ${accessedAt()}.`,
      });

      const decoratedFindings = findings.map((finding) => ({
        ...finding,
        citations: finding.citations.length > 0
          ? finding.citations
          : ([
              {
                label: `Open Supply Hub facility search: ${state.query}`,
                source: "Open Supply Hub",
                url: `https://opensupplyhub.org/facilities?q=${encodeURIComponent(state.query)}`,
                accessedAt: accessedAt(),
              },
            ] satisfies Citation[]),
      }));

      const highRisk = pickHighRiskCountries(state);
      const mapPoints: MapPoint[] = facilities
        .filter((f) => typeof f.latitude === "number" && typeof f.longitude === "number")
        .slice(0, 5)
        .map((f) => ({
          id: randomUUID(),
          label: f.name || `${f.country} facility`,
          latitude: f.latitude as number,
          longitude: f.longitude as number,
          risk: facilityRisk(f, highRisk),
        }));

      const countriesCovered = Array.from(new Set(facilities.map((f) => f.country).filter(Boolean)));
      const sectors = Array.from(new Set(facilities.flatMap((f) => f.sectors).filter(Boolean)));

      const rawFeatures = {
        facilityCount: total,
        countriesCovered,
        sectors,
      };

      return {
        status: lookup.source === "live" ? "ready" as const : "snapshot" as const,
        detail: `${facilities.length} facilities returned${authenticated ? "" : " (unauthenticated request)"}.`,
        findings: decoratedFindings,
        mapPoints,
        rawFeatures,
      };
    },
  });

  return { agents: { supplier: result }, mapPoints: result.mapPoints };
}
