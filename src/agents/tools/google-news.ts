import * as cheerio from "cheerio";

import { fetchText } from "@/agents/tools/http";
import { TTL, hashKey, withCache, type CacheLookup } from "@/agents/tools/cache";

export const SOURCE_GOOGLE_NEWS = "google_news";

const BASE_URL = "https://news.google.com/rss/search";

// Google News RSS does not honor the full search-query DSL (no quoted-OR groups).
// We keep the labor terms simple and append one as a topical hint; the LLM scores
// relevance from the article titles after the fact.
const LABOR_HINT_TERMS = ["labor", "factory", "workers", "supply chain"];

const LABOR_KEYWORD_REGEX =
  /forced labor|child labor|wage theft|trafficking|sweatshop|exploit|labour|worker abuse|sweat shop/i;

export type NewsArticle = {
  url: string;
  title: string;
  source: string;
  publishedAt: string;
};

export type NewsLookup = {
  articles: NewsArticle[];
  laborKeywordHits: number;
  queryUrl: string;
};

function buildUrl(query: string): string {
  // Keep the query shape simple: <subject> + one labor hint term. RSS engine
  // ignores most operators, so complex parens/OR queries return zero results.
  // The LLM extracts relevance from titles; we then re-filter by keyword regex.
  const composed = `${query} ${LABOR_HINT_TERMS[0]}`;
  const params = new URLSearchParams({
    q: composed,
    hl: "en-US",
    gl: "US",
    ceid: "US:en",
  });
  return `${BASE_URL}?${params.toString()}`;
}

function parseRss(xml: string): NewsArticle[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const articles: NewsArticle[] = [];

  $("item").each((_, item) => {
    const $item = $(item);
    const titleRaw = $item.find("title").first().text().trim();
    const url = $item.find("link").first().text().trim();
    const pubDate = $item.find("pubDate").first().text().trim();
    const sourceField = $item.find("source").first().text().trim();
    // Google News titles look like "Title — Outlet"; split off the outlet if present.
    const dashIdx = titleRaw.lastIndexOf(" - ");
    const title = dashIdx > 0 ? titleRaw.slice(0, dashIdx).trim() : titleRaw;
    const source = sourceField || (dashIdx > 0 ? titleRaw.slice(dashIdx + 3).trim() : "Google News");
    if (!url || !title) return;
    articles.push({ url, title, source, publishedAt: pubDate });
  });

  return articles;
}

function countLaborHits(articles: NewsArticle[]): number {
  return articles.reduce(
    (sum, a) => sum + (LABOR_KEYWORD_REGEX.test(a.title) ? 1 : 0),
    0,
  );
}

function filterByTimeWindow(articles: NewsArticle[], months: number): NewsArticle[] {
  const cutoff = Date.now() - months * 30 * 24 * 3600 * 1000;
  return articles.filter((a) => {
    if (!a.publishedAt) return true;
    const ts = Date.parse(a.publishedAt);
    return !Number.isFinite(ts) || ts >= cutoff;
  });
}

export async function lookupGoogleNews(
  query: string,
  timeWindowMonths: number,
): Promise<CacheLookup<NewsLookup>> {
  const url = buildUrl(query);
  const key = hashKey(["google_news", query, timeWindowMonths]);

  return withCache<NewsLookup>(
    SOURCE_GOOGLE_NEWS,
    key,
    { ttlMs: TTL.DAY, staleTtlMs: TTL.MONTH },
    async () => {
      const xml = await fetchText(url, {
        timeoutMs: 15_000,
        headers: { Accept: "application/rss+xml,application/xml;q=0.9,*/*;q=0.5" },
      });
      const allArticles = parseRss(xml);
      const windowed = filterByTimeWindow(allArticles, timeWindowMonths);
      const articles = windowed.slice(0, 40);
      return {
        articles,
        laborKeywordHits: countLaborHits(articles),
        queryUrl: url,
      };
    },
  );
}
