import { Annotation } from "@langchain/langgraph";

import type { MapPoint, MlPrediction, MlPredictionReason } from "@/lib/report-types";
import type { OnboardingAnswers } from "@/lib/onboarding-types";

import type {
  AgentErrorEntry,
  AgentName,
  AgentResult,
  FeatureBundle,
  SynthesisOutput,
} from "@/agents/types";

export const orchestratorAnnotation = Annotation.Root({
  reportId: Annotation<string>(),
  inputType: Annotation<"company" | "region">(),
  query: Annotation<string>(),
  onboarding: Annotation<OnboardingAnswers>(),
  countries: Annotation<string[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  // ISO3 codes resolved against the trained ML panel (153 countries),
  // populated by enrich-countries after the supplier agent runs.
  // Order is meaningful — index 0 is the primary country.
  panelCountries: Annotation<string[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  // Per-country weighting for multi-country ML aggregation.
  // Normalized facility counts; sums to 1 when populated.
  countryWeights: Annotation<Record<string, number>>({
    reducer: (_prev, next) => next,
    default: () => ({}),
  }),
  primaryCountry: Annotation<string | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  agents: Annotation<Partial<Record<AgentName, AgentResult>>>({
    reducer: (prev, next) => ({ ...prev, ...next }),
    default: () => ({}),
  }),
  mapPoints: Annotation<MapPoint[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
  errors: Annotation<AgentErrorEntry[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
  featureBundle: Annotation<FeatureBundle | undefined>({
    reducer: (_prev, next) => next,
    default: () => undefined,
  }),
  synthesis: Annotation<SynthesisOutput | undefined>({
    reducer: (_prev, next) => next,
    default: () => undefined,
  }),
  mlPrediction: Annotation<MlPrediction | null | undefined>({
    reducer: (_prev, next) => next,
    default: () => undefined,
  }),
  mlPredictionReason: Annotation<MlPredictionReason | null | undefined>({
    reducer: (_prev, next) => next,
    default: () => undefined,
  }),
  // One-sentence plain-language summary of the ML prediction. Written
  // by the narrative LLM in synthesize, surfaced in the UI verdict card.
  mlInsight: Annotation<string | null | undefined>({
    reducer: (_prev, next) => next,
    default: () => undefined,
  }),
});

export type OrchestratorState = typeof orchestratorAnnotation.State;
export type OrchestratorUpdate = typeof orchestratorAnnotation.Update;
