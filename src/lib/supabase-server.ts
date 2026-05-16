import { createClient } from "@supabase/supabase-js";

import type { Report, ReportRequest, SourceStatus } from "@/lib/report-types";
import { getSupabaseServerConfig } from "@/lib/runtime-config";

type SupabaseReportRow = {
  id: string;
  input_type: "company" | "region";
  query: string;
  title: string;
  summary: string;
  overall_risk: number;
  severity: number;
  credibility: number;
  recommended_action: string;
  source_note: string | null;
  created_at: string;
  findings: Array<{
    id: string;
    signal: string;
    severity: number;
    credibility: number;
    geography: string;
    evidence: string;
    citations: Array<{
      label: string;
      source: string;
      url: string;
      accessed_at: string;
    }>;
  }>;
  map_points: Array<{
    id: string;
    label: string;
    latitude: number;
    longitude: number;
    risk: "high" | "medium" | "low";
  }>;
  source_status: Array<{
    name: string;
    status: SourceStatus;
    detail: string;
  }>;
};

export function createSupabaseServerClient() {
  const { url, serviceRoleKey } = getSupabaseServerConfig();

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function findSupabaseReport(request: ReportRequest): Promise<Report | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("reports")
    .select(
      `
        id,
        input_type,
        query,
        title,
        summary,
        overall_risk,
        severity,
        credibility,
        recommended_action,
        source_note,
        created_at,
        findings (
          id,
          signal,
          severity,
          credibility,
          geography,
          evidence,
          citations (
            label,
            source,
            url,
            accessed_at
          )
        ),
        map_points (
          id,
          label,
          latitude,
          longitude,
          risk
        ),
        source_status (
          name,
          status,
          detail
        )
      `,
    )
    .eq("input_type", request.inputType)
    .ilike("query", `%${request.query.trim()}%`)
    .limit(1)
    .returns<SupabaseReportRow[]>();

  if (error) {
    throw new Error(`Supabase report lookup failed: ${error.message}`);
  }

  const row = data?.[0];
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    inputType: row.input_type,
    query: row.query,
    title: row.title,
    summary: row.summary,
    overallRisk: row.overall_risk,
    severity: row.severity,
    credibility: row.credibility,
    recommendedAction: row.recommended_action,
    sourceNote: row.source_note ?? "Loaded from Supabase.",
    createdAt: row.created_at,
    findings: row.findings.map((finding) => ({
      id: finding.id,
      signal: finding.signal,
      severity: finding.severity,
      credibility: finding.credibility,
      geography: finding.geography,
      evidence: finding.evidence,
      citations: finding.citations.map((citation) => ({
        label: citation.label,
        source: citation.source,
        url: citation.url,
        accessedAt: citation.accessed_at,
      })),
    })),
    mapPoints: row.map_points,
    sourceChecks: row.source_status.map((source) => ({
      name: source.name,
      status: source.status,
      detail: source.detail,
    })),
  };
}
