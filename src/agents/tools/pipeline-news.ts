import * as cheerio from "cheerio";

import { fetchText } from "@/agents/tools/http";
import { TTL, hashKey, withCache, type CacheLookup } from "@/agents/tools/cache";

export const SOURCE_PIPELINE_NEWS = "pipeline_news";

const BASE_URL = "https://news.google.com/rss/search";

export type PipelineArticle = {
  url: string;
  title: string;
  source: string;
  publishedAt: string;
  query: string;
};

export type PipelineNewsLookup = {
  articles: PipelineArticle[];
  queryUrls: string[];
};

function buildQueries(subject: string, countries: string[], industry?: string): string[] {
  const countryHint = countries.length > 0 ? countries.slice(0, 3).join(" ") : "";
  const industryHint = industry ? `${industry} ` : "";
  return [
    `${subject} ${industryHint}raw materials sourcing countries supply chain`,
    `${subject} ${industryHint}components suppliers processing assembly countries`,
    `${subject} ${industryHint}supply chain factories`,
    `${subject} suppliers manufacturing locations ${countryHint}`,
    `${subject} sourcing countries factories workers`,
    `${subject} imports distribution stores consumer markets`,
    `${subject} annual report revenue countries stores distribution markets`,
  ]
    .map((query) => query.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function buildUrl(query: string): string {
  const params = new URLSearchParams({
    q: query,
    hl: "en-US",
    gl: "US",
    ceid: "US:en",
  });
  return `${BASE_URL}?${params.toString()}`;
}

function parseRss(xml: string, query: string): PipelineArticle[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const articles: PipelineArticle[] = [];

  $("item").each((_, item) => {
    const $item = $(item);
    const titleRaw = $item.find("title").first().text().trim();
    const url = $item.find("link").first().text().trim();
    const pubDate = $item.find("pubDate").first().text().trim();
    const sourceField = $item.find("source").first().text().trim();
    const dashIdx = titleRaw.lastIndexOf(" - ");
    const title = dashIdx > 0 ? titleRaw.slice(0, dashIdx).trim() : titleRaw;
    const source = sourceField || (dashIdx > 0 ? titleRaw.slice(dashIdx + 3).trim() : "Google News");
    if (!url || !title) return;
    articles.push({ url, title, source, publishedAt: pubDate, query });
  });

  return articles;
}

function filterByTimeWindow(articles: PipelineArticle[], months: number): PipelineArticle[] {
  const cutoff = Date.now() - months * 30 * 24 * 3600 * 1000;
  return articles.filter((article) => {
    if (!article.publishedAt) return true;
    const ts = Date.parse(article.publishedAt);
    return !Number.isFinite(ts) || ts >= cutoff;
  });
}

function dedupeArticles(articles: PipelineArticle[]): PipelineArticle[] {
  const seen = new Set<string>();
  const out: PipelineArticle[] = [];
  for (const article of articles) {
    const key = article.url || article.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(article);
  }
  return out;
}

export async function lookupPipelineNews(
  subject: string,
  countries: string[],
  industry: string | undefined,
  timeWindowMonths: number,
): Promise<CacheLookup<PipelineNewsLookup>> {
  const queries = buildQueries(subject, countries, industry);
  const key = hashKey(["pipeline_news", subject, countries.join(","), industry, timeWindowMonths]);

  return withCache<PipelineNewsLookup>(
    SOURCE_PIPELINE_NEWS,
    key,
    { ttlMs: TTL.DAY, staleTtlMs: TTL.MONTH },
    async () => {
      const batches = await Promise.all(
        queries.map(async (query) => {
          const url = buildUrl(query);
          const xml = await fetchText(url, {
            timeoutMs: 15_000,
            headers: { Accept: "application/rss+xml,application/xml;q=0.9,*/*;q=0.5" },
          });
          return { url, articles: parseRss(xml, query) };
        }),
      );

      return {
        articles: dedupeArticles(filterByTimeWindow(batches.flatMap((batch) => batch.articles), timeWindowMonths)).slice(0, 50),
        queryUrls: batches.map((batch) => batch.url),
      };
    },
  );
}
