import { z } from "zod";

import { onboardingAnswersSchema, type OnboardingAnswers } from "@/lib/onboarding-types";
import { ConfigError, getOpenAIConfig } from "@/lib/runtime-config";

import { ingestNode } from "@/agents/nodes/ingest";
import { newsNode } from "@/agents/nodes/news";
import { watchlistNode } from "@/agents/nodes/watchlist";
import { supplierNode } from "@/agents/nodes/supplier";
import { webResearchNode } from "@/agents/nodes/web-research";
import { pipelineNode } from "@/agents/nodes/pipeline";
import { legalNode } from "@/agents/nodes/legal";
import { riskIndexNode } from "@/agents/nodes/risk-index";
import type { OrchestratorState } from "@/agents/state";
import { AGENT_NAMES } from "@/agents/types";

export const runtime = "nodejs";

const requestSchema = z.object({
  agent: z.enum(AGENT_NAMES),
  reportId: z.string().uuid(),
  onboarding: onboardingAnswersSchema,
});

const AGENT_RUNNERS = {
  news: newsNode,
  watchlist: watchlistNode,
  supplier: supplierNode,
  web_research: webResearchNode,
  pipeline: pipelineNode,
  legal: legalNode,
  risk_index: riskIndexNode,
} as const;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        ok: false,
        error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      },
      { status: 400 },
    );
  }

  try {
    getOpenAIConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      return Response.json({ ok: false, error: error.message }, { status: 503 });
    }
    throw error;
  }

  const onboarding = parsed.data.onboarding as OnboardingAnswers;
  const baseState: OrchestratorState = {
    reportId: parsed.data.reportId,
    inputType: onboarding.inputType,
    query: onboarding.query,
    onboarding,
    countries: onboarding.countries,
    panelCountries: [],
    countryWeights: {},
    primaryCountry: null,
    agents: {},
    mapPoints: [],
    mapArcs: [],
    errors: [],
    featureBundle: undefined,
    synthesis: undefined,
    mlPrediction: undefined,
    mlPredictionReason: undefined,
    mlInsight: undefined,
  };

  const ingest = await ingestNode(baseState);
  const resolvedCountries = Array.isArray(ingest.countries)
    ? (ingest.countries as string[])
    : onboarding.countries;

  const stateWithCountries: OrchestratorState = {
    ...baseState,
    countries: resolvedCountries,
  };

  const runner = AGENT_RUNNERS[parsed.data.agent];
  const result = await runner(stateWithCountries);
  return Response.json({ ok: true, result });
}
