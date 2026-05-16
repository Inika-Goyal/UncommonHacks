export type InputType = "company" | "region";

export type SourceStatus = "ready" | "snapshot" | "blocked" | "pending";

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
};

export type MapPoint = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  risk: "high" | "medium" | "low";
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
