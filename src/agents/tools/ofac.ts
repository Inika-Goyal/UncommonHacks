import { parse } from "csv-parse/sync";

import { fetchText } from "@/agents/tools/http";
import { TTL, hashKey, withCache, type CacheLookup } from "@/agents/tools/cache";

export const SOURCE_OFAC = "ofac_sdn";

const SDN_CSV_URL = "https://www.treasury.gov/ofac/downloads/sdn.csv";

const LABOR_PROGRAM_KEYWORDS = [
  "FORCED LABOR",
  "MAGNIT",
  "GLOMAG",
  "TRAFFIK",
  "TCO",
  "HRIT",
];

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

export async function lookupOfac(query: string): Promise<CacheLookup<OfacLookup>> {
  const key = hashKey(["ofac:sdn", normalize(query)]);

  return withCache<OfacLookup>(
    SOURCE_OFAC,
    key,
    { ttlMs: TTL.WEEK, staleTtlMs: TTL.MONTH },
    async () => {
      const text = await fetchText(SDN_CSV_URL, { timeoutMs: 30_000 });
      const all = parseSdnCsv(text);
      const needle = normalize(query);
      const matches = all.filter((entry) => {
        const programHit = LABOR_PROGRAM_KEYWORDS.some((kw) => entry.program.includes(kw));
        const nameMatch = normalize(entry.name).includes(needle);
        const remarksMatch = normalize(entry.remarks).includes(needle);
        return nameMatch && (programHit || remarksMatch || true);
      });

      return {
        matches: matches.slice(0, 25),
        totalScanned: all.length,
      };
    },
  );
}
