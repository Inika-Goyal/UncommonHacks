import type { OrchestratorState, OrchestratorUpdate } from "@/agents/state";
import { listAllGsiCountries } from "@/agents/tools/global-slavery-index";

const COMMON_COUNTRY_ALIASES: Record<string, string> = {
  prc: "China",
  uk: "United Kingdom",
  uae: "United Arab Emirates",
  usa: "United States",
  drc: "Democratic Republic of the Congo",
};

const COUNTRY_LOOKUP = new Set(
  listAllGsiCountries().map((entry) => entry.country.toLowerCase()),
);

function inferCountriesFromQuery(query: string): string[] {
  const lower = query.toLowerCase();
  const found: string[] = [];
  for (const country of COUNTRY_LOOKUP) {
    if (lower.includes(country)) {
      found.push(country.replace(/\b\w/g, (c) => c.toUpperCase()));
    }
  }
  for (const [alias, full] of Object.entries(COMMON_COUNTRY_ALIASES)) {
    if (lower.includes(alias)) {
      found.push(full);
    }
  }
  return Array.from(new Set(found));
}

export async function ingestNode(state: OrchestratorState): Promise<OrchestratorUpdate> {
  const explicit = (state.onboarding.countries ?? []).filter(Boolean);
  const inferred = inferCountriesFromQuery(state.query);
  const merged = Array.from(new Set([...explicit, ...inferred]));
  return { countries: merged };
}
