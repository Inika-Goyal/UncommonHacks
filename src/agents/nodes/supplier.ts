import { randomUUID } from "node:crypto";

import type { Citation, MapPoint } from "@/lib/report-types";

import type { OrchestratorState, OrchestratorUpdate } from "@/agents/state";
import { lookupOpenSupplyHub, type OshFacility } from "@/agents/tools/open-supply-hub";
import { lookupSupplierRegistry, type RegistryFacility } from "@/agents/tools/supplier-registry";
import { runAgentNode, extractFindingsWithLlm } from "@/agents/nodes/_helpers";

type ResolvedFacility = {
  name: string;
  address: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  sectors: string[];
  citationUrl: string;
};

const accessedAt = () => new Date().toISOString().slice(0, 10);

function fromOsh(f: OshFacility): ResolvedFacility {
  return {
    name: f.name,
    address: f.address,
    country: f.country,
    latitude: f.latitude,
    longitude: f.longitude,
    sectors: f.sectors,
    citationUrl: "https://opensupplyhub.org/facilities",
  };
}

function fromRegistry(f: RegistryFacility): ResolvedFacility {
  return {
    name: f.name,
    address: f.address,
    country: f.country,
    latitude: f.latitude,
    longitude: f.longitude,
    sectors: f.sectors,
    citationUrl: f.source,
  };
}

function formatFacilities(facilities: ResolvedFacility[]): string {
  if (facilities.length === 0) return "No supplier records returned.";
  return facilities
    .slice(0, 20)
    .map(
      (f, idx) =>
        `${idx + 1}. ${f.name} | ${f.address} | ${f.country} | sectors=${f.sectors.join(", ") || "n/a"} | ${f.citationUrl}`,
    )
    .join("\n");
}

function pickHighRiskCountries(state: OrchestratorState): Set<string> {
  return new Set(state.countries.map((country) => country.toLowerCase()));
}

function facilityRisk(facility: ResolvedFacility, highRisk: Set<string>): "high" | "medium" | "low" {
  if (highRisk.has(facility.country.toLowerCase())) return "high";
  if (facility.sectors.some((s) =>
    /apparel|garment|textile|mining|electronics|seafood|agriculture|footwear/i.test(s),
  )) {
    return "medium";
  }
  return "low";
}

export async function supplierNode(state: OrchestratorState): Promise<OrchestratorUpdate> {
  const result = await runAgentNode({
    agent: "supplier",
    reportId: state.reportId,
    runner: async () => {
      let resolved: ResolvedFacility[] = [];
      let dataSource: "live" | "registry" = "registry";

      // Try OSH live first when a token is configured.
      if (process.env.OPEN_SUPPLY_HUB_TOKEN) {
        const lookup = await lookupOpenSupplyHub(state.query, state.countries);
        if (lookup.source !== "miss") {
          resolved = lookup.payload.facilities.map(fromOsh);
          dataSource = "live";
        }
      }

      // Fallback / default: curated public-domain registry.
      if (resolved.length === 0) {
        resolved = lookupSupplierRegistry(state.query).map(fromRegistry);
        dataSource = "registry";
      }

      if (resolved.length === 0) {
        // Genuinely no supplier data for this query. Still mark as ready since
        // the underlying source is available — there just aren't matches.
        return {
          status: "ready" as const,
          detail: `No supplier records found for "${state.query}". Consider adding the company to the registry or configuring OPEN_SUPPLY_HUB_TOKEN.`,
          findings: [],
          mapPoints: [],
          rawFeatures: { facilityCount: 0, countriesCovered: [], sectors: [] },
        };
      }

      const evidence = formatFacilities(resolved);

      const findings = await extractFindingsWithLlm({
        agent: "supplier",
        evidence,
        instructions: `Subject: ${state.query}. Identify supplier-transparency or concentration findings. Each citation MUST use the URL from one of the records above. Accessed date: ${accessedAt()}.`,
      });

      const decoratedFindings = findings.map((finding) => ({
        ...finding,
        citations:
          finding.citations.length > 0
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
      const mapPoints: MapPoint[] = resolved
        .filter((f) => typeof f.latitude === "number" && typeof f.longitude === "number")
        .slice(0, 5)
        .map((f) => ({
          id: randomUUID(),
          label: f.name || `${f.country} facility`,
          latitude: f.latitude as number,
          longitude: f.longitude as number,
          risk: facilityRisk(f, highRisk),
        }));

      const countriesCovered = Array.from(new Set(resolved.map((f) => f.country).filter(Boolean)));
      const sectors = Array.from(new Set(resolved.flatMap((f) => f.sectors).filter(Boolean)));

      const rawFeatures = {
        facilityCount: resolved.length,
        countriesCovered,
        sectors,
      };

      return {
        status: dataSource === "live" ? ("ready" as const) : ("snapshot" as const),
        detail: `${resolved.length} facilities across ${countriesCovered.length} countries.`,
        findings: decoratedFindings,
        mapPoints,
        rawFeatures,
      };
    },
  });

  return { agents: { supplier: result }, mapPoints: result.mapPoints };
}
