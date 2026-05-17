import type { OrchestratorState } from "@/agents/state";
import type { FeatureBundle } from "@/agents/types";

function getSlice<T extends Record<string, unknown>>(
  state: OrchestratorState,
  agent: keyof OrchestratorState["agents"],
): Partial<T> {
  return (state.agents[agent]?.rawFeatures ?? {}) as Partial<T>;
}

export function buildFeatureBundle(state: OrchestratorState): FeatureBundle {
  const news = getSlice<FeatureBundle["news"]>(state, "news");
  const watchlist = getSlice<FeatureBundle["watchlist"]>(state, "watchlist");
  const supplier = getSlice<FeatureBundle["supplier"]>(state, "supplier");
  const pipeline = getSlice<FeatureBundle["pipeline"]>(state, "pipeline");
  const legal = getSlice<FeatureBundle["legal"]>(state, "legal");
  const riskIndex = getSlice<FeatureBundle["riskIndex"]>(state, "risk_index");

  const bundle: FeatureBundle = {
    version: "1.0.0",
    input: {
      inputType: state.inputType,
      query: state.query,
      countries: state.countries,
      industry: state.onboarding.industry,
      timeWindowMonths: state.onboarding.timeWindowMonths,
    },
    news: {
      articleCount: Number(news.articleCount ?? 0),
      last30dCount: Number(news.last30dCount ?? 0),
      laborKeywordHits: Number(news.laborKeywordHits ?? 0),
      gdeltEventCount: Number(news.gdeltEventCount ?? 0),
      averageTone: typeof news.averageTone === "number" ? news.averageTone : null,
      sampleTitles: Array.isArray(news.sampleTitles) ? (news.sampleTitles as string[]) : [],
    },
    watchlist: {
      uflpaMatches: (watchlist.uflpaMatches as { entity: string; basis: string }[]) ?? [],
      ofacMatches: (watchlist.ofacMatches as { entity: string; program: string }[]) ?? [],
      matchCount: Number(watchlist.matchCount ?? 0),
    },
    supplier: {
      facilityCount: Number(supplier.facilityCount ?? 0),
      countriesCovered: (supplier.countriesCovered as string[]) ?? [],
      sectors: (supplier.sectors as string[]) ?? [],
    },
    pipeline: {
      pipelineStageCount: Number(pipeline.pipelineStageCount ?? 0),
      mappedStageCount: Number(pipeline.mappedStageCount ?? 0),
      articleCount: Number(pipeline.articleCount ?? 0),
    },
    legal: {
      courtCaseCount: Number(legal.courtCaseCount ?? 0),
      flsaCaseCount: Number(legal.flsaCaseCount ?? 0),
      iloComplaintCount: Number(legal.iloComplaintCount ?? 0),
      mostRecentFilingDate: (legal.mostRecentFilingDate as string | null) ?? null,
    },
    riskIndex: {
      countryScores: (riskIndex.countryScores as FeatureBundle["riskIndex"]["countryScores"]) ?? [],
      weightedScore: typeof riskIndex.weightedScore === "number" ? riskIndex.weightedScore : null,
    },
    extras: {
      blockedAgents: Object.values(state.agents)
        .filter((result) => result?.status === "blocked")
        .map((result) => ({ agent: result?.agent, detail: result?.detail })),
      errorCount: state.errors.length,
    },
  };

  return bundle;
}
