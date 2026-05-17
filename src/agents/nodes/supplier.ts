import { randomUUID } from "node:crypto";

import type { Citation, ExploitCategory, MapPoint, MapPointStage } from "@/lib/report-types";

import type { OrchestratorState, OrchestratorUpdate } from "@/agents/state";
import { lookupWikidata, type WikidataLookup } from "@/agents/tools/wikidata";
import { lookupSupplierRegistry, type RegistryFacility } from "@/agents/tools/supplier-registry";
import { runAgentNode, extractFindingsWithLlm } from "@/agents/nodes/_helpers";

type ResolvedFacility = {
  name: string;
  address: string;
  country: string;
  countryCode?: string;
  latitude: number | null;
  longitude: number | null;
  sectors: string[];
  citationLabel: string;
  citationUrl: string;
  origin: "wikidata" | "registry";
};

const accessedAt = () => new Date().toISOString().slice(0, 10);

function fromRegistry(f: RegistryFacility): ResolvedFacility {
  return {
    name: f.name,
    address: f.address,
    country: f.country,
    countryCode: f.countryCode,
    latitude: f.latitude,
    longitude: f.longitude,
    sectors: f.sectors,
    citationLabel: f.name,
    citationUrl: f.source,
    origin: "registry",
  };
}

function fromWikidata(query: string, lookup: WikidataLookup): ResolvedFacility[] {
  if (!lookup.entityId) return [];
  const entityUrl = lookup.entityUrl ?? `https://www.wikidata.org/wiki/${lookup.entityId}`;
  const industries = lookup.industries.length > 0 ? lookup.industries : [];
  const records: ResolvedFacility[] = [];

  if (lookup.headquarters || lookup.homeCountry) {
    records.push({
      name: `${lookup.label ?? query} headquarters`,
      address: lookup.headquarters ?? "",
      country: lookup.homeCountry ?? lookup.headquarters ?? "",
      countryCode: lookup.homeCountryCode,
      latitude: null,
      longitude: null,
      sectors: industries,
      citationLabel: `Wikidata: ${lookup.label ?? query}`,
      citationUrl: entityUrl,
      origin: "wikidata",
    });
  }

  for (const sub of lookup.subsidiaries) {
    records.push({
      name: sub.name,
      address: sub.country ?? "",
      country: sub.country ?? "",
      countryCode: sub.countryCode,
      latitude: sub.latitude ?? null,
      longitude: sub.longitude ?? null,
      sectors: industries,
      citationLabel: `Wikidata subsidiary: ${sub.name}`,
      citationUrl: entityUrl,
      origin: "wikidata",
    });
  }

  return records;
}

function dedupe(records: ResolvedFacility[]): ResolvedFacility[] {
  const seen = new Set<string>();
  const out: ResolvedFacility[] = [];
  for (const r of records) {
    const key = `${r.name.toLowerCase()}|${r.country.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

function formatFacilities(facilities: ResolvedFacility[]): string {
  if (facilities.length === 0) return "No supplier or corporate-footprint records returned.";
  return facilities
    .slice(0, 20)
    .map(
      (f, idx) =>
        `${idx + 1}. ${f.name} | ${f.address || "—"} | ${f.country || "—"} | sectors=${
          f.sectors.join(", ") || "n/a"
        } | source=${f.origin} | ${f.citationUrl}`,
    )
    .join("\n");
}

function pickHighRiskCountries(state: OrchestratorState): Set<string> {
  return new Set(state.countries.map((country) => country.toLowerCase()));
}

function facilityRisk(
  facility: ResolvedFacility,
  highRisk: Set<string>,
): "high" | "medium" | "low" {
  if (highRisk.has(facility.country.toLowerCase())) return "high";
  if (
    facility.sectors.some((s) =>
      /apparel|garment|textile|mining|electronics|seafood|agriculture|footwear|retail|manufactur/i.test(
        s,
      ),
    )
  ) {
    return "medium";
  }
  return "low";
}

function facilitySeverity(risk: "high" | "medium" | "low"): number {
  if (risk === "high") return 4;
  if (risk === "medium") return 3;
  return 2;
}

const LABOR_RISK_SECTORS =
  /apparel|garment|textile|mining|electronics|seafood|agriculture|footwear|construction|manufactur/i;
const CHILD_LABOR_SECTORS = /agriculture|mining|seafood|cocoa|coffee|tobacco|brick/i;
const HIGH_PROFIT_SECTORS = /retail|wholesale|brand|fashion|electronics|distribution/i;

function facilityExploitType(facility: ResolvedFacility): ExploitCategory {
  const blob = facility.sectors.join(" ").toLowerCase();
  if (CHILD_LABOR_SECTORS.test(blob)) return "child_labor";
  if (LABOR_RISK_SECTORS.test(blob)) return "forced_labor";
  if (HIGH_PROFIT_SECTORS.test(blob)) return "illegal_profits";
  return "forced_labor";
}

function facilityStage(facility: ResolvedFacility): MapPointStage {
  const name = facility.name.toLowerCase();
  if (name.includes("headquarters")) return "consumer";
  if (facility.origin === "wikidata" && facility.sectors.length === 0) return "distribution";
  if (LABOR_RISK_SECTORS.test(facility.sectors.join(" "))) return "factory";
  return "labor";
}

const STAGE_ORDER: Record<MapPointStage, number> = {
  origin: 0,
  labor: 1,
  factory: 2,
  transit: 3,
  distribution: 4,
  consumer: 5,
};

function facilityCauses(
  facility: ResolvedFacility,
  highRisk: Set<string>,
): string[] {
  const causes: string[] = [];
  if (highRisk.has(facility.country.toLowerCase())) {
    causes.push(`${facility.country} listed in user-defined high-risk geography`);
  }
  if (facility.sectors.some((s) => /apparel|garment|textile|footwear/i.test(s))) {
    causes.push("Apparel/textile sector — known forced-overtime and wage-theft exposure");
  }
  if (facility.sectors.some((s) => /mining|seafood|agriculture/i.test(s))) {
    causes.push("Primary-extraction sector — elevated child- and bonded-labor risk");
  }
  if (facility.origin === "wikidata" && facility.sectors.length === 0) {
    causes.push("Corporate-footprint entity surfaced via Wikidata — verify operational tier");
  }
  if (causes.length === 0) {
    causes.push("Listed in curated supplier registry — review for tier-2/3 subcontracting");
  }
  return causes;
}

export async function supplierNode(state: OrchestratorState): Promise<OrchestratorUpdate> {
  const result = await runAgentNode({
    agent: "supplier",
    reportId: state.reportId,
    runner: async () => {
      const [wikidataResult, registryFacilities] = await Promise.all([
        lookupWikidata(state.query),
        Promise.resolve(lookupSupplierRegistry(state.query)),
      ]);

      const fromWiki =
        wikidataResult.source !== "miss" ? fromWikidata(state.query, wikidataResult.payload) : [];
      const fromReg = registryFacilities.map(fromRegistry);

      const merged = dedupe([...fromWiki, ...fromReg]);

      if (merged.length === 0) {
        return {
          status: "ready" as const,
          detail: `No corporate-footprint or supplier records found for "${state.query}". Wikidata returned no business entity by that name.`,
          findings: [],
          mapPoints: [],
          rawFeatures: { facilityCount: 0, countriesCovered: [], sectors: [] },
        };
      }

      const evidence = formatFacilities(merged);

      const findings = await extractFindingsWithLlm({
        agent: "supplier",
        evidence,
        instructions: `Subject: ${state.query}. Identify supplier-transparency, geographic-concentration, or corporate-footprint findings about labor risk. Each citation MUST use the URL from one of the records above (Wikidata or the registry source). Accessed date: ${accessedAt()}.`,
      });

      const decoratedFindings = findings.map((finding) => ({
        ...finding,
        citations:
          finding.citations.length > 0
            ? finding.citations
            : ([
                {
                  label: `Wikidata entity: ${state.query}`,
                  source: "Wikidata",
                  url: merged[0]?.citationUrl ?? "https://www.wikidata.org/",
                  accessedAt: accessedAt(),
                },
              ] satisfies Citation[]),
      }));

      const highRisk = pickHighRiskCountries(state);
      const mapPoints: MapPoint[] = merged
        .filter((f) => typeof f.latitude === "number" && typeof f.longitude === "number")
        .slice(0, 6)
        .map((f) => {
          const risk = facilityRisk(f, highRisk);
          const stage = facilityStage(f);
          return {
            id: randomUUID(),
            label: f.name || `${f.country} facility`,
            latitude: f.latitude as number,
            longitude: f.longitude as number,
            risk,
            exploitType: facilityExploitType(f),
            severity: facilitySeverity(risk),
            stage,
            order: STAGE_ORDER[stage],
            causes: facilityCauses(f, highRisk),
            sources: [
              {
                label: f.citationLabel || `${f.origin === "wikidata" ? "Wikidata" : "Registry"} record`,
                url: f.citationUrl,
              },
            ],
          };
        })
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

      const countriesCovered = Array.from(new Set(merged.map((f) => f.country).filter(Boolean)));
      const sectors = Array.from(new Set(merged.flatMap((f) => f.sectors).filter(Boolean)));

      const wikidataLive = wikidataResult.source === "live";
      const status = wikidataLive ? ("ready" as const) : ("snapshot" as const);

      const wikiCount = fromWiki.length;
      const regCount = fromReg.length;
      const detailBits = [`${merged.length} records`];
      if (wikiCount > 0) detailBits.push(`${wikiCount} via Wikidata`);
      if (regCount > 0) detailBits.push(`${regCount} via curated registry`);
      detailBits.push(`${countriesCovered.length} countries`);

      const rawFeatures = {
        facilityCount: merged.length,
        countriesCovered,
        sectors,
      };

      return {
        status,
        detail: detailBits.join(", ") + ".",
        findings: decoratedFindings,
        mapPoints,
        rawFeatures,
      };
    },
  });

  return { agents: { supplier: result }, mapPoints: result.mapPoints };
}
