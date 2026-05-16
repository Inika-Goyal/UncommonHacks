import type { Citation } from "@/lib/report-types";

import type { OrchestratorState, OrchestratorUpdate } from "@/agents/state";
import { lookupGdelt, type GdeltArticle } from "@/agents/tools/gdelt";
import { runAgentNode, extractFindingsWithLlm } from "@/agents/nodes/_helpers";

const accessedAt = () => new Date().toISOString().slice(0, 10);

function summarizeArticles(articles: GdeltArticle[]): string {
  if (articles.length === 0) {
    return "No GDELT articles matched the query and labor-theme filters.";
  }
  return articles
    .slice(0, 25)
    .map(
      (article, idx) =>
        `${idx + 1}. ${article.title} | domain=${article.domain} | seen=${article.seendate} | tone=${article.tone ?? "n/a"} | ${article.url}`,
    )
    .join("\n");
}

export async function newsNode(state: OrchestratorState): Promise<OrchestratorUpdate> {
  const result = await runAgentNode({
    agent: "news",
    reportId: state.reportId,
    runner: async () => {
      const lookup = await lookupGdelt(state.query, state.onboarding.timeWindowMonths ?? 12);

      if (lookup.source === "miss") {
        throw lookup.error instanceof Error
          ? lookup.error
          : new Error("GDELT lookup failed without a cached fallback.");
      }

      const { articles, laborKeywordHits, averageTone, queryUrl } = lookup.payload;
      const evidence = summarizeArticles(articles);

      const findings = await extractFindingsWithLlm({
        agent: "news",
        evidence,
        instructions: `Subject: ${state.query}. Distill the strongest labor-exploitation signal(s) in the article list. Each citation must use a real URL from the list. Use the GDELT Project as the source. Accessed date: ${accessedAt()}.`,
      });

      const decoratedFindings = findings.map((finding) => ({
        ...finding,
        citations: finding.citations.length > 0
          ? finding.citations
          : ([
              {
                label: "GDELT Project labor-theme query",
                source: "GDELT Project",
                url: queryUrl,
                accessedAt: accessedAt(),
              },
            ] satisfies Citation[]),
      }));

      const last30dCount = articles.filter((a) => {
        const d = a.seendate;
        if (!d || d.length < 8) return false;
        const ymd = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
        return new Date(ymd).getTime() > Date.now() - 30 * 24 * 3600 * 1000;
      }).length;

      const rawFeatures = {
        articleCount: articles.length,
        last30dCount,
        laborKeywordHits,
        gdeltEventCount: articles.length,
        averageTone,
        sampleTitles: articles.slice(0, 5).map((a) => a.title),
      };

      const detailParts = [
        `${articles.length} articles`,
        `${last30dCount} in last 30d`,
        `${laborKeywordHits} labor keyword hits`,
      ];

      return {
        status: lookup.source === "live" ? "ready" : "snapshot",
        detail: `${detailParts.join(", ")} (${lookup.source}).`,
        findings: decoratedFindings,
        rawFeatures,
      };
    },
  });

  return { agents: { news: result } };
}
