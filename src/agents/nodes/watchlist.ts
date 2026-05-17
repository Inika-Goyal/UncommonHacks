import type { Citation } from "@/lib/report-types";

import type { OrchestratorState, OrchestratorUpdate } from "@/agents/state";
import { lookupUflpa, type UflpaEntry } from "@/agents/tools/uflpa";
import { lookupOfac, type OfacEntry } from "@/agents/tools/ofac";
import { runAgentNode, extractFindingsWithLlm } from "@/agents/nodes/_helpers";
import { countryNameForIso3, extractCountriesFromText } from "@/lib/iso-countries";

const accessedAt = () => new Date().toISOString().slice(0, 10);

function formatUflpa(entries: UflpaEntry[]): string {
  if (entries.length === 0) return "No UFLPA Entity List matches.";
  return entries
    .map(
      (entry, idx) =>
        `${idx + 1}. ${entry.entity} — ${entry.basis} (effective ${entry.effectiveDate}, ${entry.sourceList})`,
    )
    .join("\n");
}

function formatOfac(entries: OfacEntry[]): string {
  if (entries.length === 0) return "No OFAC SDN matches.";
  return entries
    .map(
      (entry, idx) =>
        `${idx + 1}. ${entry.name} | program=${entry.program} | type=${entry.type} | remarks=${entry.remarks.slice(0, 200)}`,
    )
    .join("\n");
}

export async function watchlistNode(state: OrchestratorState): Promise<OrchestratorUpdate> {
  const result = await runAgentNode({
    agent: "watchlist",
    reportId: state.reportId,
    runner: async () => {
      const [uflpaResult, ofacResult] = await Promise.all([
        lookupUflpa(state.query),
        lookupOfac(state.query),
      ]);

      const uflpa = uflpaResult.source !== "miss" ? uflpaResult.payload : { matches: [], totalScanned: 0, fetchedFrom: "embedded" as const };
      const ofac = ofacResult.source !== "miss" ? ofacResult.payload : { matches: [], totalScanned: 0 };

      const evidence = `UFLPA Entity List matches (${uflpa.matches.length} of ${uflpa.totalScanned} entities scanned):
${formatUflpa(uflpa.matches)}

OFAC SDN matches (${ofac.matches.length} of ${ofac.totalScanned} entries scanned):
${formatOfac(ofac.matches)}`;

      const findings = await extractFindingsWithLlm({
        agent: "watchlist",
        evidence,
        instructions: `Subject: ${state.query}. If there are no direct matches, emit zero findings. Each citation must reference UFLPA Entity List (https://www.dhs.gov/uflpa-entity-list) or OFAC SDN (https://www.treasury.gov/ofac/downloads/sdn.csv). Accessed date: ${accessedAt()}.`,
      });

      // Mine UFLPA `basis` text + OFAC `program/remarks` for country
      // names so downstream country resolution sees them. A UFLPA entry
      // saying "Operates in Xinjiang Uyghur Autonomous Region" should
      // contribute CHN to the geography string.
      const watchlistGeoIso3 = new Set<string>();
      for (const entry of uflpa.matches) {
        for (const iso3 of extractCountriesFromText(`${entry.entity} ${entry.basis}`)) {
          watchlistGeoIso3.add(iso3);
        }
      }
      for (const entry of ofac.matches) {
        for (const iso3 of extractCountriesFromText(
          `${entry.name} ${entry.program} ${entry.remarks}`,
        )) {
          watchlistGeoIso3.add(iso3);
        }
      }
      const watchlistGeoNames = Array.from(watchlistGeoIso3).map((iso3) =>
        countryNameForIso3(iso3),
      );

      const decoratedFindings = findings.map((finding) => {
        const baseGeography = finding.geography ?? "";
        const enrichedGeography =
          watchlistGeoNames.length > 0 && !watchlistGeoNames.every((n) => baseGeography.includes(n))
            ? baseGeography
              ? `${baseGeography}; ${watchlistGeoNames.join(", ")}`
              : watchlistGeoNames.join(", ")
            : baseGeography;
        return {
          ...finding,
          geography: enrichedGeography,
          citations:
            finding.citations.length > 0
              ? finding.citations
              : ([
                  {
                    label: "UFLPA Entity List",
                    source: "U.S. Department of Homeland Security",
                    url: "https://www.dhs.gov/uflpa-entity-list",
                    accessedAt: accessedAt(),
                  },
                ] satisfies Citation[]),
        };
      });

      const totalMatches = uflpa.matches.length + ofac.matches.length;
      const status: "ready" | "snapshot" = uflpaResult.source === "live" || ofacResult.source === "live" ? "ready" : "snapshot";

      const rawFeatures = {
        uflpaMatches: uflpa.matches.map((entry) => ({ entity: entry.entity, basis: entry.basis })),
        ofacMatches: ofac.matches.map((entry) => ({ entity: entry.name, program: entry.program })),
        matchCount: totalMatches,
      };

      return {
        status,
        detail: `UFLPA: ${uflpa.matches.length} matches; OFAC: ${ofac.matches.length} matches.`,
        findings: decoratedFindings,
        rawFeatures,
      };
    },
  });

  return { agents: { watchlist: result } };
}
