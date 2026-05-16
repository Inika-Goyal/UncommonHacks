import { fetchJson } from "@/agents/tools/http";
import { TTL, hashKey, withCache, type CacheLookup } from "@/agents/tools/cache";

export const SOURCE_COURTLISTENER = "courtlistener";

const BASE_URL = "https://www.courtlistener.com/api/rest/v4/search/";

export type CourtListenerResult = {
  caseName: string;
  court: string;
  dateFiled: string | null;
  absoluteUrl: string;
  docketNumber: string | null;
  snippet: string | null;
};

type SearchResponse = {
  count?: number;
  results?: Array<{
    caseName?: string;
    court?: string;
    dateFiled?: string;
    absolute_url?: string;
    docket_absolute_url?: string;
    docketNumber?: string;
    snippet?: string;
  }>;
};

export type CourtListenerLookup = {
  total: number;
  results: CourtListenerResult[];
  flsaCount: number;
  mostRecentFilingDate: string | null;
};

function buildUrl(query: string): string {
  const params = new URLSearchParams({
    q: `(${query}) AND ("Fair Labor Standards Act" OR FLSA OR "forced labor" OR "wage theft" OR "human trafficking")`,
    type: "r",
    order_by: "dateFiled desc",
  });
  return `${BASE_URL}?${params.toString()}`;
}

export async function lookupCourtListener(query: string): Promise<CacheLookup<CourtListenerLookup>> {
  const url = buildUrl(query);
  const headers: Record<string, string> = {};
  if (process.env.COURTLISTENER_API_TOKEN) {
    headers.Authorization = `Token ${process.env.COURTLISTENER_API_TOKEN}`;
  }

  const key = hashKey(["courtlistener:search", query]);

  return withCache<CourtListenerLookup>(
    SOURCE_COURTLISTENER,
    key,
    { ttlMs: TTL.DAY, staleTtlMs: TTL.MONTH },
    async () => {
      const payload = await fetchJson<SearchResponse>(url, { headers });
      const results: CourtListenerResult[] = (payload.results ?? []).slice(0, 20).map((row) => {
        const path = row.absolute_url || row.docket_absolute_url;
        return {
          caseName: row.caseName ?? "",
          court: row.court ?? "",
          dateFiled: row.dateFiled ?? null,
          absoluteUrl: path ? `https://www.courtlistener.com${path}` : "",
          docketNumber: row.docketNumber ?? null,
          snippet: row.snippet ?? null,
        };
      });

      const flsaCount = results.filter((r) =>
        (r.snippet ?? "").toLowerCase().includes("fair labor standards act"),
      ).length;

      const mostRecentFilingDate = results.reduce<string | null>((latest, row) => {
        if (!row.dateFiled) return latest;
        if (!latest || row.dateFiled > latest) return row.dateFiled;
        return latest;
      }, null);

      return {
        total: payload.count ?? results.length,
        results,
        flsaCount,
        mostRecentFilingDate,
      };
    },
  );
}
