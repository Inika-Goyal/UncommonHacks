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
