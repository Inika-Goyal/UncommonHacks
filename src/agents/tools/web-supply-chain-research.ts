import * as cheerio from "cheerio";

import { TTL, hashKey, withCache, type CacheLookup } from "@/agents/tools/cache";
import { fetchText } from "@/agents/tools/http";

export const SOURCE_WEB_SUPPLY_CHAIN_RESEARCH = "web_supply_chain_research";

const SEARCH_URL = "https://html.duckduckgo.com/html/";
const MAX_QUERIES = 10;
const MAX_RESULTS_PER_QUERY = 5;
const MAX_FETCHED_DOCUMENTS = 14;
const MAX_DOCUMENT_CHARS = 5_500;

export type WebResearchResult = {
  title: string;
  url: string;
  snippet: string;
  query: string;
};

export type WebResearchDocument = WebResearchResult & {
  source: string;
  text: string;
  fetched: boolean;
};

export type WebResearchLookup = {
  queries: string[];
  queryUrls: string[];
  results: WebResearchResult[];
  documents: WebResearchDocument[];
};

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function buildWebResearchQueries(
  subject: string,
  countries: string[],
  industry?: string,
): string[] {
  const cleanSubject = compact(subject);
  const countryHint = countries.length > 0 ? countries.slice(0, 4).join(" ") : "";
  const industryHint = industry ? compact(industry) : "";
  return [
    `${cleanSubject} raw materials sourcing countries supply chain ${industryHint}`,
    `${cleanSubject} materials origin components suppliers manufacturing ${industryHint}`,
    `${cleanSubject} supplier list factory locations ${industryHint}`,
    `${cleanSubject} supplier disclosure tier 1 tier 2 locations`,
    `${cleanSubject} assembly manufacturing countries factories ${countryHint}`,
    `${cleanSubject} manufacturing countries sourcing suppliers ${countryHint}`,
    `${cleanSubject} sustainability report supply chain factories`,
    `${cleanSubject} annual report supply chain manufacturing distribution markets`,
    `${cleanSubject} annual report distribution markets countries`,
    `${cleanSubject} imports exports distribution markets`,
    `${cleanSubject} store markets countries revenue by region`,
    `${cleanSubject} labor rights supplier factory ${industryHint}`,
  ]
    .map(compact)
    .filter(Boolean)
    .slice(0, MAX_QUERIES);
}

function searchUrl(query: string): string {
  const params = new URLSearchParams({ q: query });
  return `${SEARCH_URL}?${params.toString()}`;
}

function normalizeResultUrl(raw: string): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw, SEARCH_URL);
    const redirected = url.searchParams.get("uddg");
    if (redirected) return redirected;
    if (url.protocol === "http:" || url.protocol === "https:") return url.toString();
  } catch {
    return null;
  }
  return null;
}

function sourceFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Public web";
  }
}

function parseSearchResults(html: string, query: string): WebResearchResult[] {
  const $ = cheerio.load(html);
  const results: WebResearchResult[] = [];

  $(".result").each((_, element) => {
    const $result = $(element);
    const $link = $result.find(".result__a").first();
    const title = compact($link.text());
    const url = normalizeResultUrl($link.attr("href") ?? "");
    const snippet = compact($result.find(".result__snippet").first().text());
    if (!title || !url) return;
    results.push({ title, url, snippet, query });
  });

  return results.slice(0, MAX_RESULTS_PER_QUERY);
}

function parseDocumentText(html: string): string {
  const $ = cheerio.load(html);
  $("script,style,noscript,svg,canvas,nav,footer,header").remove();
  const title = compact($("title").first().text());
  const description = compact(
    $("meta[name='description']").attr("content") ??
      $("meta[property='og:description']").attr("content") ??
      "",
  );
  const body = compact($("body").text());
  return compact([title, description, body].filter(Boolean).join("\n")).slice(0, MAX_DOCUMENT_CHARS);
}

async function search(query: string): Promise<{ url: string; results: WebResearchResult[] }> {
  const url = searchUrl(query);
  const html = await fetchText(url, {
    timeoutMs: 12_000,
    headers: {
      Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
    },
  });
  return { url, results: parseSearchResults(html, query) };
}

async function fetchDocument(result: WebResearchResult): Promise<WebResearchDocument> {
  try {
    const html = await fetchText(result.url, {
      timeoutMs: 10_000,
      headers: {
        Accept: "text/html,text/plain;q=0.9,*/*;q=0.4",
      },
    });
    const text = parseDocumentText(html);
    return {
      ...result,
      source: sourceFromUrl(result.url),
      text: text || result.snippet,
      fetched: Boolean(text),
    };
  } catch {
    return {
      ...result,
      source: sourceFromUrl(result.url),
      text: result.snippet,
      fetched: false,
    };
  }
}

function dedupeResults(results: WebResearchResult[]): WebResearchResult[] {
  const seen = new Set<string>();
  const out: WebResearchResult[] = [];
  for (const result of results) {
    const key = result.url.replace(/[#?].*$/, "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(result);
  }
  return out;
}

export async function lookupWebSupplyChainResearch(
  subject: string,
  countries: string[],
  industry: string | undefined,
): Promise<CacheLookup<WebResearchLookup>> {
  const queries = buildWebResearchQueries(subject, countries, industry);
  const key = hashKey(["web_supply_chain_research", subject, countries.join(","), industry]);

  return withCache<WebResearchLookup>(
    SOURCE_WEB_SUPPLY_CHAIN_RESEARCH,
    key,
    { ttlMs: TTL.DAY, staleTtlMs: TTL.MONTH },
    async () => {
      const searched = await Promise.allSettled(queries.map(search));
      const fulfilled = searched
        .filter((entry): entry is PromiseFulfilledResult<{ url: string; results: WebResearchResult[] }> => entry.status === "fulfilled");
      const queryUrls = fulfilled.map((entry) => entry.value.url);
      const results = dedupeResults(fulfilled.flatMap((entry) => entry.value.results));

      if (queryUrls.length === 0) {
        throw new Error("Public web supply-chain search returned no reachable query pages.");
      }

      const documents = await Promise.all(
        results.slice(0, MAX_FETCHED_DOCUMENTS).map(fetchDocument),
      );

      return {
        queries,
        queryUrls,
        results,
        documents,
      };
    },
  );
}
