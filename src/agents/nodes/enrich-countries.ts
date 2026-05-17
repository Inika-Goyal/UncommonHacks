/**
 * Country enrichment. Runs after the supplier agent so it can read
 * Wikidata + Nike Manufacturing Map output, plus any country geography
 * already attached to other agents' findings.
 *
 * Outputs a deduped list of ISO3 codes that all live in the trained
 * GSI+WDI+RSF panel of 153 countries. Without this node the ML layer
 * never fires for company-name queries like "Shein", because the only
 * existing country-resolution path is substring matching against ~49
 * hand-curated GSI country names — which company names never hit.
 */

import { createChatModel } from "@/agents/llm";
import {
  countryNameForIso3,
  extractCountriesFromText,
  isPanelCountry,
  resolveCountriesToIso3,
  resolveCountryToIso3,
} from "@/lib/iso-countries";
import type { OrchestratorState, OrchestratorUpdate } from "@/agents/state";

const HQ_BONUS = 0.5;

function countryStringsFromAgents(state: OrchestratorState): string[] {
  const strings: string[] = [];
  for (const result of Object.values(state.agents)) {
    if (!result) continue;
    // Each agent's findings carry a `geography` field. We split on
    // common separators for the exact-match resolver, AND run the free-
    // text extractor over the full string so "Xinjiang cotton fields"
    // or "Guangzhou apparel sourcing" resolve to CHN even though those
    // are not panel country names.
    for (const finding of result.findings) {
      if (!finding.geography) continue;
      strings.push(...finding.geography.split(/[,;/]| and | with | & /i));
      for (const iso3 of extractCountriesFromText(finding.geography)) {
        strings.push(iso3);
      }
    }
    const raw = (result.rawFeatures ?? {}) as Record<string, unknown>;
    const covered = raw.countriesCovered;
    if (Array.isArray(covered)) {
      for (const c of covered) {
        if (typeof c === "string") strings.push(c);
      }
    }
    const countryScores = raw.countryScores;
    if (Array.isArray(countryScores)) {
      for (const c of countryScores) {
        if (c && typeof c === "object" && "country" in c) {
          const v = (c as { country?: unknown }).country;
          if (typeof v === "string") strings.push(v);
        }
      }
    }
    // Watchlist agents store UFLPA `basis` and OFAC `program` text
    // that often mentions a country/region. Mine those for ISO3s too.
    for (const uflpa of (raw.uflpaMatches as Array<Record<string, unknown>> | undefined) ?? []) {
      if (typeof uflpa?.basis === "string") {
        for (const iso3 of extractCountriesFromText(uflpa.basis)) {
          strings.push(iso3);
        }
      }
    }
    for (const ofac of (raw.ofacMatches as Array<Record<string, unknown>> | undefined) ?? []) {
      if (typeof ofac?.program === "string") {
        for (const iso3 of extractCountriesFromText(ofac.program)) {
          strings.push(iso3);
        }
      }
    }
  }
  return strings;
}

function buildCountryWeights(state: OrchestratorState, panelCountries: string[]): {
  weights: Record<string, number>;
  primary: string | null;
} {
  if (panelCountries.length === 0) return { weights: {}, primary: null };

  // Equal-weight base — every resolved panel country starts at parity.
  // The labor-risk lens cares about MANUFACTURING presence, not where
  // a company is incorporated. Wikidata-recorded subsidiaries
  // (corporate registrations) and legal-case venues skew toward the
  // company's HQ country (USA for Shein) and would otherwise dominate
  // the weighted prevalence — even though no production happens
  // there. So we ignore facility counts and cap agent-mention boosts.
  const counts: Record<string, number> = {};
  for (const iso3 of panelCountries) counts[iso3] = 1;

  // Capped per-country bonus from agent findings (UFLPA basis text,
  // news geography, court venues, etc.). Max +1 per country so a
  // country with 5 lawsuit mentions doesn't end up 6x heavier than a
  // country with 1 manufacturing mention.
  const mentionTally: Record<string, number> = {};
  for (const s of countryStringsFromAgents(state)) {
    const iso3 = resolveCountryToIso3(s);
    if (iso3 && iso3 in counts) {
      mentionTally[iso3] = (mentionTally[iso3] ?? 0) + 1;
    }
  }
  for (const [iso3, n] of Object.entries(mentionTally)) {
    counts[iso3] += Math.min(n * 0.25, 1);
  }

  // HQ bonus — the first panel country in order (typically wikidata HQ
  // since the supplier agent runs first) gets a small boost so it
  // breaks ties as the primary country.
  if (panelCountries[0]) {
    counts[panelCountries[0]] = (counts[panelCountries[0]] ?? 0) + HQ_BONUS;
  }

  // Normalize. If everything is still zero, fall back to uniform.
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const weights: Record<string, number> = {};
  if (total > 0) {
    for (const [k, v] of Object.entries(counts)) weights[k] = v / total;
  } else {
    for (const k of panelCountries) weights[k] = 1 / panelCountries.length;
  }

  const primary = Object.entries(weights).reduce(
    (best, [k, v]) => (v > best[1] ? [k, v] : best),
    [panelCountries[0]!, -Infinity] as [string, number],
  )[0];

  return { weights, primary };
}

async function llmFallbackCountries(query: string, inputType: string): Promise<string[]> {
  // Last-resort: ask the synthesis model for a list of countries the
  // entity in question is tied to. Cheap and keyed on the query so
  // results stay deterministic per run.
  try {
    const model = createChatModel("synthesis");
    const prompt = `Return ONLY a compact JSON object {"countries": ["ISO3", ...]} listing the countries (ISO 3166-1 alpha-3 codes) where ${inputType === "company" ? "the company" : "the entity"} "${query}" is headquartered, manufactures, or has significant operational presence. If unknown, return {"countries": []}. No prose.`;
    const reply = await model.invoke([
      {
        role: "system",
        content:
          "You map company/entity names to country codes. Output ONLY JSON. No prose, no markdown, no backticks.",
      },
      { role: "user", content: prompt },
    ]);
    const text =
      typeof reply.content === "string"
        ? reply.content
        : Array.isArray(reply.content)
          ? reply.content
              .map((c) =>
                typeof c === "string" ? c : "text" in c && typeof c.text === "string" ? c.text : "",
              )
              .join("")
          : "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]) as { countries?: unknown };
    if (!Array.isArray(parsed.countries)) return [];
    return parsed.countries.filter((v): v is string => typeof v === "string");
  } catch (err) {
    console.warn("[enrich-countries] LLM fallback failed:", (err as Error).message);
    return [];
  }
}

export async function enrichCountriesNode(state: OrchestratorState): Promise<OrchestratorUpdate> {
  // Priority order. Each path contributes candidate strings; the
  // resolver dedupes them to a single ISO3 list.
  const explicit = state.onboarding.countries ?? [];
  const supplierCovered =
    (state.agents.supplier?.rawFeatures?.countriesCovered as string[] | undefined) ?? [];
  const fromAgentFindings = countryStringsFromAgents(state);

  // HQ-first ordering: wikidata HQ tends to appear at the head of the
  // supplier countries list, so resolving that block first means
  // weights[panelCountries[0]] reflects HQ.
  const ordered = [
    ...explicit,
    ...supplierCovered,
    ...fromAgentFindings,
    ...(state.countries ?? []),
  ];

  const structured = resolveCountriesToIso3(ordered).filter(isPanelCountry);

  // For company queries, ALWAYS run the LLM extraction and merge.
  // Wikidata returns HQ + subsidiaries, which routinely miss the actual
  // manufacturing footprint (e.g. Shein: Wikidata says SGP+USA, but the
  // supply chain is CHN/VNM/KHM/BGD). The merge — not the gate — is
  // what makes the basket reflect reality.
  let llmIso3: string[] = [];
  if (state.inputType === "company") {
    const llmCountries = await llmFallbackCountries(state.query, state.inputType);
    llmIso3 = resolveCountriesToIso3(llmCountries).filter(isPanelCountry);
    if (llmIso3.length > 0) {
      console.info(
        `[enrich-countries] LLM extraction returned ${llmIso3.length} country/countries for "${state.query}": ${llmIso3.join(", ")}`,
      );
    }
  } else if (structured.length === 0) {
    // For region queries, keep prior behaviour (LLM only as fallback).
    const llmCountries = await llmFallbackCountries(state.query, state.inputType);
    llmIso3 = resolveCountriesToIso3(llmCountries).filter(isPanelCountry);
  }

  // Merge: structured paths first (preserves HQ-first ordering for
  // weights), then any new LLM-only countries appended.
  const seen = new Set(structured);
  const merged = [...structured];
  for (const iso3 of llmIso3) {
    if (!seen.has(iso3)) {
      seen.add(iso3);
      merged.push(iso3);
    }
  }
  const panelCountries = merged;

  if (state.inputType === "company") {
    console.info(
      `[enrich-countries] resolved ${panelCountries.length} panel countries for "${state.query}": ${panelCountries.join(", ")}`,
    );
  }

  if (panelCountries.length === 0) {
    return {
      panelCountries: [],
      countryWeights: {},
      primaryCountry: null,
    };
  }

  const { weights, primary } = buildCountryWeights(state, panelCountries);

  // Merge canonical country names into state.countries so downstream
  // nodes that key off it (pipeline narrative, synthesis prompt) see
  // the resolved supply-chain footprint, not just whatever ingest
  // happened to substring-match.
  const existingCountryNames = new Set(state.countries ?? []);
  const enrichedCountries = [...(state.countries ?? [])];
  for (const iso3 of panelCountries) {
    const name = countryNameForIso3(iso3);
    if (!existingCountryNames.has(name)) {
      existingCountryNames.add(name);
      enrichedCountries.push(name);
    }
  }

  return {
    countries: enrichedCountries,
    panelCountries,
    countryWeights: weights,
    primaryCountry: primary,
  };
}
