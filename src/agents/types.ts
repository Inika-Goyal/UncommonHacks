import { z } from "zod";

import type { Finding, InputType, MapPoint, SourceStatus } from "@/lib/report-types";
import type { OnboardingAnswers } from "@/lib/onboarding-types";

export const AGENT_NAMES = [
  "news",
  "watchlist",
  "supplier",
  "legal",
  "risk_index",
] as const;
export type AgentName = (typeof AGENT_NAMES)[number];

export const AGENT_LABELS: Record<AgentName, string> = {
  news: "News intelligence",
  watchlist: "Watchlist matches",
  supplier: "Supplier disclosure",
  legal: "Legal & complaints",
  risk_index: "Country risk index",
};

export type AgentLifecycle = "pending" | "running" | "ready" | "snapshot" | "blocked";

export type AgentResult = {
  agent: AgentName;
  status: SourceStatus;
  detail: string;
  findings: Finding[];
  mapPoints: MapPoint[];
  rawFeatures: Record<string, unknown>;
  startedAt: string;
  finishedAt: string;
};

export type AgentErrorEntry = {
  agent: AgentName;
  message: string;
};

export type SynthesisOutput = {
  title: string;
  summary: string;
  recommendedAction: string;
  severity: number;
  credibility: number;
  overallRisk: number;
};

export type FeatureBundle = {
  version: "1.0.0";
  input: {
    inputType: InputType;
    query: string;
    countries: string[];
    industry?: string;
    timeWindowMonths: number;
  };
  news: {
    articleCount: number;
    last30dCount: number;
    laborKeywordHits: number;
    gdeltEventCount: number;
    averageTone: number | null;
    sampleTitles: string[];
  };
  watchlist: {
    uflpaMatches: { entity: string; basis: string }[];
    ofacMatches: { entity: string; program: string }[];
    matchCount: number;
  };
  supplier: {
    facilityCount: number;
    countriesCovered: string[];
    sectors: string[];
  };
  legal: {
    courtCaseCount: number;
    flsaCaseCount: number;
    iloComplaintCount: number;
    mostRecentFilingDate: string | null;
  };
  riskIndex: {
    countryScores: { country: string; gsiScore: number; gsiRank: number | null }[];
    weightedScore: number | null;
  };
  extras: Record<string, unknown>;
};

export type OrchestratorInput = {
  reportId: string;
  inputType: InputType;
  query: string;
  onboarding: OnboardingAnswers;
};

export type StateUpdate =
  | {
      type: "agent";
      name: AgentName;
      status: AgentLifecycle;
      detail?: string;
      findingCount?: number;
    }
  | {
      type: "synthesis";
      severity: number;
      credibility: number;
      overallRisk: number;
    }
  | {
      type: "error";
      agent?: AgentName;
      message: string;
    }
  | {
      type: "done";
      reportId: string;
    };

const citationSchema = z.object({
  label: z.string(),
  source: z.string(),
  url: z.string(),
  accessedAt: z.string(),
});

export const findingSchema = z.object({
  signal: z.string().min(3),
  severity: z.number().int().min(1).max(5),
  credibility: z.number().int().min(1).max(5),
  geography: z.string().min(1),
  evidence: z.string().min(10),
  citations: z.array(citationSchema).min(1),
});

export type AgentFinding = z.infer<typeof findingSchema>;

export const synthesisSchema = z.object({
  title: z.string().min(5),
  summary: z.string().min(20),
  recommendedAction: z.string().min(20),
  severity: z.number().int().min(1).max(5),
  credibility: z.number().int().min(1).max(5),
  overallRisk: z.number().int().min(0).max(100),
});
