import { fetchJson } from "@/agents/tools/http";
import { TTL, hashKey, withCache, type CacheLookup } from "@/agents/tools/cache";

export const SOURCE_GDELT = "gdelt";

const BASE_URL = "https://api.gdeltproject.org/api/v2/doc/doc";

const LABOR_KEYWORDS = [
  "forced labor",
  "child labor",
  "exploitation",
  "trafficking",
  "wage theft",
  "abuse",
  "worker",
  "factory",
];

export type GdeltArticle = {
  url: string;
  title: string;
  seendate: string;
  domain: string;
  language: string;
  sourcecountry: string;
  tone?: number;
};

type GdeltArtListResponse = {
  articles?: Array<{
    url: string;
    url_mobile?: string;
    title: string;
    seendate: string;
    socialimage?: string;
    domain: string;
    language: string;
    sourcecountry: string;
    tone?: number | string;
  }>;
};

export type GdeltLookup = {
  articles: GdeltArticle[];
  laborKeywordHits: number;
  averageTone: number | null;
  queryUrl: string;
};

function buildQueryUrl(query: string, timespanDays: number): string {
  const composedQuery = `(${query}) AND (${LABOR_KEYWORDS.map((kw) => `"${kw}"`).join(" OR ")})`;
  const params = new URLSearchParams({
    query: composedQuery,
    mode: "ArtList",
    maxrecords: "50",
    format: "json",
    timespan: `${Math.max(1, timespanDays)}d`,
    sort: "DateDesc",
  });
  return `${BASE_URL}?${params.toString()}`;
}

export async function lookupGdelt(query: string, timeWindowMonths: number): Promise<CacheLookup<GdeltLookup>> {
  const timespanDays = Math.min(365, timeWindowMonths * 30);
  const url = buildQueryUrl(query, timespanDays);
  const key = hashKey(["gdelt:doc", query, timespanDays]);

  return withCache<GdeltLookup>(
    SOURCE_GDELT,
    key,
    { ttlMs: TTL.DAY, staleTtlMs: TTL.MONTH },
    async () => {
      const payload = await fetchJson<GdeltArtListResponse>(url);
      const articles: GdeltArticle[] = (payload.articles ?? []).map((article) => ({
        url: article.url,
        title: article.title,
        seendate: article.seendate,
        domain: article.domain,
        language: article.language,
        sourcecountry: article.sourcecountry,
        tone: typeof article.tone === "string" ? Number(article.tone) : article.tone,
      }));

      const titlesLower = articles.map((a) => a.title.toLowerCase()).join(" ");
      const laborKeywordHits = LABOR_KEYWORDS.reduce(
        (sum, kw) => sum + (titlesLower.split(kw).length - 1),
        0,
      );
      const toneValues = articles
        .map((a) => a.tone)
        .filter((t): t is number => typeof t === "number" && !Number.isNaN(t));
      const averageTone =
        toneValues.length > 0
          ? toneValues.reduce((sum, value) => sum + value, 0) / toneValues.length
          : null;

      return {
        articles,
        laborKeywordHits,
        averageTone,
        queryUrl: url,
      };
    },
  );
}
