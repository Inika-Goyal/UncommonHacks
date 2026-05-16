import type { Citation } from "@/lib/report-types";

import type { OrchestratorState, OrchestratorUpdate } from "@/agents/state";
import { lookupGoogleNews, type NewsArticle } from "@/agents/tools/google-news";
import { lookupGdelt } from "@/agents/tools/gdelt";
import { runAgentNode, extractFindingsWithLlm } from "@/agents/nodes/_helpers";

const accessedAt = () => new Date().toISOString().slice(0, 10);

function summarizeArticles(articles: NewsArticle[]): string {
  if (articles.length === 0) {
    return "No news articles matched the query and labor-theme filters.";
  }
  return articles
    .slice(0, 25)
    .map(
      (article, idx) =>
        `${idx + 1}. ${article.title} | ${article.source} | ${article.publishedAt} | ${article.url}`,
    )
    .join("\n");
}

function countLast30d(articles: NewsArticle[]): number {
  const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
  return articles.filter((a) => {
    const ts = a.publishedAt ? Date.parse(a.publishedAt) : NaN;
    return Number.isFinite(ts) && ts > cutoff;
  }).length;
}

export async function newsNode(state: OrchestratorState): Promise<OrchestratorUpdate> {
  const result = await runAgentNode({
    agent: "news",
    reportId: state.reportId,
    runner: async () => {
      // Primary: Google News RSS (no key, generous rate limits, topical relevance).
      const newsLookup = await lookupGoogleNews(
        state.query,
        state.onboarding.timeWindowMonths ?? 12,
      );

      if (newsLookup.source === "miss") {
        throw newsLookup.error instanceof Error
          ? newsLookup.error
          : new Error("Google News lookup failed without a cached fallback.");
      }

      const { articles, laborKeywordHits, queryUrl } = newsLookup.payload;

      // Secondary (best-effort): GDELT for tone + event-count signal. Failures are silent.
      let gdeltEventCount = 0;
      let averageTone: number | null = null;
      try {
        const gdelt = await lookupGdelt(state.query, state.onboarding.timeWindowMonths ?? 12);
        if (gdelt.source !== "miss") {
          gdeltEventCount = gdelt.payload.articles.length;
          averageTone = gdelt.payload.averageTone;
        }
      } catch {
        // GDELT enrichment is optional; skip if it fails or rate-limits.
      }

      const evidence = summarizeArticles(articles);

      const findings = await extractFindingsWithLlm({
        agent: "news",
        evidence,
        instructions: `Subject: ${state.query}. Distill the strongest labor-exploitation signal(s) in the article list. Each citation MUST use the actual URL and outlet name from one of the articles above. Do not fabricate URLs. Accessed date: ${accessedAt()}.`,
      });

      const decoratedFindings = findings.map((finding) => ({
        ...finding,
        citations:
          finding.citations.length > 0
            ? finding.citations
            : ([
                {
                  label: `News search: ${state.query} labor`,
                  source: "Google News",
                  url: queryUrl,
                  accessedAt: accessedAt(),
                },
              ] satisfies Citation[]),
      }));

      const last30dCount = countLast30d(articles);

      const rawFeatures = {
        articleCount: articles.length,
        last30dCount,
        laborKeywordHits,
        gdeltEventCount,
        averageTone,
        sampleTitles: articles.slice(0, 5).map((a) => a.title),
      };

      const detailParts = [
        `${articles.length} articles`,
        `${last30dCount} in last 30d`,
        `${laborKeywordHits} labor keyword hits`,
      ];

      return {
        status: newsLookup.source === "live" ? "ready" : "snapshot",
        detail: `${detailParts.join(", ")}.`,
        findings: decoratedFindings,
        rawFeatures,
      };
    },
  });

  return { agents: { news: result } };
}
