import { randomUUID } from "node:crypto";

import type { Citation, ExploitCategory, MapPoint, MapPointStage } from "@/lib/report-types";

import type { OrchestratorState, OrchestratorUpdate } from "@/agents/state";
import { lookupWikidata, type WikidataLookup } from "@/agents/tools/wikidata";
import {
  lookupNikeManufacturingMap,
  type NikeManufacturingFacility,
} from "@/agents/tools/nike-manufacturing-map";
import { runAgentNode, extractFindingsWithLlm } from "@/agents/nodes/_helpers";

// Supplier-agent records can come from live corporate-footprint lookup or a
// source-backed facility disclosure source. The map should plot factory/facility
// coordinates discovered by this research step, not broad country centroids.
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
  workers?: number;
  factoryTier?: string;
  origin: "wikidata" | "nike_manufacturing_map";
};

const accessedAt = () => new Date().toISOString().slice(0, 10);

function fromNikeManufacturingMap(facility: NikeManufacturingFacility): ResolvedFacility {
  return {
    name: facility.name,
    address: facility.address,
    country: facility.country,
    countryCode: facility.countryCode,
    latitude: facility.latitude,
    longitude: facility.longitude,
    sectors: facility.sectors,
    citationLabel: facility.name,
    citationUrl: facility.source,
    workers: facility.workers,
    factoryTier: facility.factoryTier,
    origin: "nike_manufacturing_map",
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
        } | workers=${f.workers ?? "n/a"} | source=${f.origin} | ${f.citationUrl}`,
    )
    .join("\n");
}

function normalizeCountry(value: string): string {
  return value.toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
}

function countriesFromState(state: OrchestratorState): Set<string> {
  const countries = new Set(state.countries.map(normalizeCountry).filter(Boolean));
  for (const result of Object.values(state.agents)) {
    for (const finding of result?.findings ?? []) {
      const geography = normalizeCountry(finding.geography);
      for (const token of geography.split(/\band\b|,|\/|;|\bwith\b/)) {
        const clean = normalizeCountry(token);
        if (clean) countries.add(clean);
      }
    }
  }
  return countries;
}

function countryMatches(facility: ResolvedFacility, countries: Set<string>): boolean {
  if (countries.size === 0) return false;
  const country = normalizeCountry(facility.country);
  return Array.from(countries).some((candidate) => country === candidate || candidate.endsWith(` ${country}`));
}

function rankFacilities(
  facilities: ResolvedFacility[],
  relevantCountries: Set<string>,
): ResolvedFacility[] {
  return [...facilities].sort((a, b) => {
    const countryDelta = Number(countryMatches(b, relevantCountries)) - Number(countryMatches(a, relevantCountries));
    if (countryDelta !== 0) return countryDelta;
    const tierDelta = Number((b.factoryTier ?? "").includes("Tier 1")) - Number((a.factoryTier ?? "").includes("Tier 1"));
    if (tierDelta !== 0) return tierDelta;
    return (b.workers ?? 0) - (a.workers ?? 0);
  });
}

function facilityRisk(
  facility: ResolvedFacility,
  highRisk: Set<string>,
): "high" | "medium" | "low" {
  if (countryMatches(facility, highRisk)) return "high";
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
  if (countryMatches(facility, highRisk)) {
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
    causes.push("Source-backed facility candidate — verify operational tier");
  }
  return causes;
}

export async function supplierNode(state: OrchestratorState): Promise<OrchestratorUpdate> {
  const result = await runAgentNode({
    agent: "supplier",
    reportId: state.reportId,
    runner: async () => {
      const [wikidataResult, nikeManufacturingResult] = await Promise.all([
        lookupWikidata(state.query),
        lookupNikeManufacturingMap(state.query),
      ]);

      const fromWiki =
        wikidataResult.source !== "miss" ? fromWikidata(state.query, wikidataResult.payload) : [];
      const fromNike =
        nikeManufacturingResult.source !== "miss"
          ? nikeManufacturingResult.payload.facilities.map(fromNikeManufacturingMap)
          : [];
      const relevantCountries = countriesFromState(state);

      const merged = rankFacilities(dedupe([...fromNike, ...fromWiki]), relevantCountries);

      if (merged.length === 0) {
        return {
          status: "ready" as const,
          detail: `No supplier or corporate-footprint records found for "${state.query}".`,
          findings: [],
          mapPoints: [],
          rawFeatures: { facilityCount: 0, countriesCovered: [], sectors: [] },
        };
      }

      const evidence = formatFacilities(merged);

      const findings = await extractFindingsWithLlm({
        agent: "supplier",
        evidence,
        instructions: `Subject: ${state.query}. Identify supplier-transparency, geographic-concentration, or corporate-footprint findings about labor risk. Each citation MUST use the URL from one of the facility or Wikidata records above. Accessed date: ${accessedAt()}.`,
      });

      const decoratedFindings = findings.map((finding) => ({
        ...finding,
        citations:
          finding.citations.length > 0
            ? finding.citations
            : ([
                {
                  label: `Wikidata entity: ${state.query}`,
                  source: merged[0]?.origin === "nike_manufacturing_map" ? "Nike Manufacturing Map" : "Wikidata",
                  url: merged[0]?.citationUrl ?? "https://www.wikidata.org/",
                  accessedAt: accessedAt(),
                },
              ] satisfies Citation[]),
      }));

      const mapPoints: MapPoint[] = merged
        .filter((f) => typeof f.latitude === "number" && typeof f.longitude === "number")
        .slice(0, 6)
        .map((f) => {
          const risk = facilityRisk(f, relevantCountries);
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
            causes: facilityCauses(f, relevantCountries),
            sources: [
              {
                label: f.citationLabel || `${f.origin === "nike_manufacturing_map" ? "Nike Manufacturing Map" : "Wikidata"} record`,
                url: f.citationUrl,
              },
            ],
          };
        })
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

      const countriesCovered = Array.from(new Set(merged.map((f) => f.country).filter(Boolean)));
      const sectors = Array.from(new Set(merged.flatMap((f) => f.sectors).filter(Boolean)));

      const hasLiveSource = wikidataResult.source === "live" || nikeManufacturingResult.source === "live";
      const status = hasLiveSource ? ("ready" as const) : ("snapshot" as const);

      const detailBits = [`${merged.length} records`];
      if (fromNike.length > 0) {
        const sourceMode = nikeManufacturingResult.source === "live" ? "live" : nikeManufacturingResult.source;
        detailBits.push(`${fromNike.length} Nike Manufacturing Map facilities (${sourceMode})`);
      }
      if (fromWiki.length > 0) detailBits.push(`${fromWiki.length} via Wikidata`);
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
