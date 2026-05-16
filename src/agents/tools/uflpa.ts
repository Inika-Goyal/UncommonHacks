import * as cheerio from "cheerio";

import { fetchText } from "@/agents/tools/http";
import { TTL, hashKey, withCache, type CacheLookup } from "@/agents/tools/cache";

export const SOURCE_UFLPA = "uflpa_entity_list";

const UFLPA_URL = "https://www.dhs.gov/uflpa-entity-list";

export type UflpaEntry = {
  entity: string;
  basis: string;
  effectiveDate: string;
  sourceList: string;
};

export type UflpaLookup = {
  matches: UflpaEntry[];
  totalScanned: number;
  fetchedFrom: "live" | "embedded";
};

const EMBEDDED_SNAPSHOT: UflpaEntry[] = [
  {
    entity: "Xinjiang Production and Construction Corps (XPCC)",
    basis: "Operates in Xinjiang Uyghur Autonomous Region; recruits Uyghur and other minority labor.",
    effectiveDate: "2022-06-21",
    sourceList: "Section 2(d)(2)(B)",
  },
  {
    entity: "Hetian Haolin Hair Accessories Co., Ltd.",
    basis: "Xinjiang-based facility implicated in forced labor of Uyghur workers.",
    effectiveDate: "2022-06-21",
    sourceList: "Section 2(d)(2)(B)",
  },
  {
    entity: "Hoshine Silicon Industry Co., Ltd.",
    basis: "Polysilicon producer implicated in state-imposed labor transfer programs.",
    effectiveDate: "2022-06-21",
    sourceList: "Section 2(d)(2)(B)",
  },
  {
    entity: "Xinjiang Junggar Cotton and Linen Co., Ltd.",
    basis: "Cotton processor tied to Xinjiang labor transfer programs.",
    effectiveDate: "2022-06-21",
    sourceList: "Section 2(d)(2)(B)",
  },
  {
    entity: "Anhui Hefei Bitland Information Technology Co., Ltd.",
    basis: "Electronics manufacturer that accepted Uyghur labor transfers from XUAR.",
    effectiveDate: "2023-09-26",
    sourceList: "Section 2(d)(2)(B)",
  },
  {
    entity: "Ninestar Corporation",
    basis: "Printer-cartridge supplier with Xinjiang labor links.",
    effectiveDate: "2023-06-12",
    sourceList: "Section 2(d)(2)(B)",
  },
  {
    entity: "Camel Group Co., Ltd.",
    basis: "Battery manufacturer with XUAR-sourced inputs.",
    effectiveDate: "2024-05-16",
    sourceList: "Section 2(d)(2)(B)",
  },
  {
    entity: "Esquel Group",
    basis: "Apparel manufacturer linked to Xinjiang cotton supply chain.",
    effectiveDate: "2023-09-26",
    sourceList: "Section 2(d)(2)(B)",
  },
  {
    entity: "Yili Zhuowan Garment Manufacturing Co., Ltd.",
    basis: "Garment producer participating in state labor transfer programs.",
    effectiveDate: "2022-06-21",
    sourceList: "Section 2(d)(2)(B)",
  },
];

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

async function fetchLiveEntities(): Promise<UflpaEntry[]> {
  const html = await fetchText(UFLPA_URL, { timeoutMs: 20_000 });
  const $ = cheerio.load(html);
  const entries: UflpaEntry[] = [];

  $("table tbody tr").each((_, row) => {
    const cells = $(row)
      .find("td")
      .map((_idx, td) => $(td).text().trim())
      .get();
    if (cells.length < 2) return;
    const [entity, basis, effectiveDate, sourceList] = cells;
    if (!entity) return;
    entries.push({
      entity,
      basis: basis ?? "",
      effectiveDate: effectiveDate ?? "",
      sourceList: sourceList ?? "Section 2(d)(2)(B)",
    });
  });

  if (entries.length === 0) {
    throw new Error("UFLPA page returned no rows; markup may have changed.");
  }

  return entries;
}

export async function lookupUflpa(query: string): Promise<CacheLookup<UflpaLookup>> {
  const key = hashKey(["uflpa", normalize(query)]);

  return withCache<UflpaLookup>(
    SOURCE_UFLPA,
    key,
    { ttlMs: TTL.WEEK, staleTtlMs: TTL.MONTH },
    async () => {
      let entries: UflpaEntry[];
      let fetchedFrom: "live" | "embedded" = "live";
      try {
        entries = await fetchLiveEntities();
      } catch {
        entries = EMBEDDED_SNAPSHOT;
        fetchedFrom = "embedded";
      }

      const needle = normalize(query);
      const matches = entries.filter((entry) => {
        const haystack = normalize(`${entry.entity} ${entry.basis}`);
        return needle.length > 2 && haystack.includes(needle);
      });

      return {
        matches: matches.slice(0, 25),
        totalScanned: entries.length,
        fetchedFrom,
      };
    },
  );
}
