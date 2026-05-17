import { parse } from "csv-parse/sync";

import { fetchText } from "@/agents/tools/http";
import { TTL, hashKey, withCache, type CacheLookup } from "@/agents/tools/cache";

export const SOURCE_OFAC = "ofac_sdn";

const SDN_CSV_URL = "https://www.treasury.gov/ofac/downloads/sdn.csv";

// OFAC program codes that flag labor-related sanctions. GLOMAG = Global Magnitsky.
// TCO = Transnational Criminal Organizations. HRIT = Human Rights / Iran Threat.
const LABOR_PROGRAM_KEYWORDS = ["FORCED LABOR", "MAGNIT", "GLOMAG", "TRAFFIK", "TCO", "HRIT"];

export type OfacEntry = {
  entNum: number;
  name: string;
  type: string;
  program: string;
  title: string;
  remarks: string;
};

export type OfacLookup = {
  matches: OfacEntry[];
  totalScanned: number;
};

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function parseSdnCsv(text: string): OfacEntry[] {
  const records = parse(text, {
    columns: false,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
  }) as string[][];

  return records.map((row) => ({
    entNum: Number(row[0] ?? 0),
    name: (row[1] ?? "").replace(/^"|"$/g, "").trim(),
    type: (row[2] ?? "").trim(),
    program: (row[3] ?? "").trim(),
    title: (row[4] ?? "").trim(),
    remarks: (row[11] ?? "").trim(),
  }));
}

async function loadFullSdn(): Promise<CacheLookup<OfacEntry[]>> {
  // Cache the raw parsed SDN list once per week. Per-query filtering happens outside
  // the cache so filter logic changes take effect without invalidating the dataset.
  return withCache<OfacEntry[]>(
    SOURCE_OFAC,
    "full",
    { ttlMs: TTL.WEEK, staleTtlMs: TTL.MONTH },
    async () => parseSdnCsv(await fetchText(SDN_CSV_URL, { timeoutMs: 30_000 })),
  );
}

function filterForLaborMatches(all: OfacEntry[], query: string): OfacEntry[] {
  const needle = normalize(query);
  // Require name AND a labor link (sanctions program flag or labor wording in remarks)
  // to avoid false positives from unrelated entries whose name contains the query string.
  return all
    .filter((entry) => {
      const nameMatch = normalize(entry.name).includes(needle);
      if (!nameMatch) return false;
      const programHit = LABOR_PROGRAM_KEYWORDS.some((kw) => entry.program.includes(kw));
      const remarksLaborHit = /forced\s+lab(?:or|our)|trafficking|exploit|wage|worker/i.test(
        entry.remarks,
      );
      return programHit || remarksLaborHit;
    })
    .slice(0, 25);
}

export async function lookupOfac(query: string): Promise<CacheLookup<OfacLookup>> {
  // The hashKey from the original cache key shape is no longer used since we cache
  // the full list, but kept around to dedupe per-query work if multiple requests
  // race for the same string. Currently unused.
  void hashKey(["ofac:sdn", normalize(query)]);

  const loaded = await loadFullSdn();
  if (loaded.source === "miss") {
    return { source: "miss", error: loaded.error };
  }

  const all = loaded.payload;
  const matches = filterForLaborMatches(all, query);
  const result: OfacLookup = { matches, totalScanned: all.length };

  if (loaded.source === "live") return { source: "live", payload: result };
  if (loaded.source === "cache") return { source: "cache", payload: result, ageMs: loaded.ageMs };
  return { source: "stale", payload: result, ageMs: loaded.ageMs };
}
