export type InputType = "company" | "region";

export type SourceStatus = "ready" | "snapshot" | "blocked" | "pending";

export const EXPLOIT_CATEGORIES = [
  "forced_labor",
  "illegal_profits",
  "sexual_exploitation",
  "child_labor",
] as const;
export type ExploitCategory = (typeof EXPLOIT_CATEGORIES)[number];

export const EXPLOIT_CATEGORY_LABELS: Record<ExploitCategory, string> = {
  forced_labor: "Forced Labor",
  illegal_profits: "Illegal Profits",
  sexual_exploitation: "Sexual Exploitation",
  child_labor: "Children",
};

export type Citation = {
  label: string;
  source: string;
  url: string;
  accessedAt: string;
};

export type Finding = {
  id: string;
  signal: string;
  severity: number;
  credibility: number;
  geography: string;
  evidence: string;
  citations: Citation[];
  category?: ExploitCategory;
};

export type MapPointStage =
  | "origin"
  | "labor"
  | "factory"
  | "transit"
  | "distribution"
  | "consumer";

export type MapPointSource = {
  label: string;
  url: string;
};

export type MapPoint = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  risk: "high" | "medium" | "low";
  exploitType?: ExploitCategory;
  severity?: number;
  stage?: MapPointStage;
  order?: number;
  causes?: string[];
  sources?: MapPointSource[];
};

export type SourceCheck = {
  name: string;
  status: SourceStatus;
  detail: string;
};

export type ReportStatus = "running" | "ready" | "failed";

export type MlSource = {
  key: string;
  name: string;
  publisher: string;
  url: string;
  role: string;
};

export type MlGeoExploit = {
  predicted_prevalence_per_1k: number;
  uncertainty_band_p10_p90: [number, number];
  spread: number;
  global_proportion_source: string;
  validation: {
    cv_mae: number;
    cv_r2: number;
    conformal_half_width: number;
    empirical_coverage_80: number;
  };
};

export type MlPrediction = {
  country: string;
  country_name: string;
  year: number;
  warnings: string[];
  geographic: Record<ExploitCategory, MlGeoExploit> | Record<string, MlGeoExploit>;
  geographic_overall: {
    predicted_prevalence_per_1k: number;
    uncertainty_band_p10_p90: [number, number];
    spread: number;
  };
  cluster: {
    cluster_id: number;
    k: number;
    silhouette: number;
    class_probabilities: Record<string, number>;
    class_probabilities_note: string;
    similar_countries: { country: string; country_name: string; distance: number }[];
  };
  scores: {
    severity: number;
    credibility: number;
    overall_risk: number;
    rationale: string;
  };
  sources: {
    predicted: MlSource[];
    predictors: MlSource[];
  };
};

export type Report = {
  id: string;
  inputType: InputType;
  query: string;
  title: string;
  summary: string;
  overallRisk: number;
  severity: number;
  credibility: number;
  recommendedAction: string;
  sourceNote: string;
  createdAt: string;
  findings: Finding[];
  mapPoints: MapPoint[];
  sourceChecks: SourceCheck[];
  mlPrediction?: MlPrediction | null;
};

export type ReportRequest = {
  inputType: InputType;
  query: string;
};

export type ReportResponse =
  | {
      ok: true;
      report: Report;
      mode: "demo" | "supabase";
    }
  | {
      ok: false;
      error: string;
      code: string;
    };
