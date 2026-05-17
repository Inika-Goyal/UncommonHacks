import { Annotation } from "@langchain/langgraph";

import type { MapPoint, MlPrediction } from "@/lib/report-types";
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
});

export type OrchestratorState = typeof orchestratorAnnotation.State;
export type OrchestratorUpdate = typeof orchestratorAnnotation.Update;
