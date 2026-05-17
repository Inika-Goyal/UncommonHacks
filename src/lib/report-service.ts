import { demoReports, findDemoReport } from "@/lib/demo-reports";
import type { InputType, Report, ReportRequest } from "@/lib/report-types";
import { isDemoMode } from "@/lib/runtime-config";
import { findSupabaseReport, findSupabaseReportById } from "@/lib/supabase-server";

export class NotFoundError extends Error {
  code = "REPORT_NOT_FOUND";

  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export function parseInputType(value: unknown): InputType | null {
  return value === "company" || value === "region" ? value : null;
}

const supabaseUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isSupabaseReportId(id: string) {
  return supabaseUuidPattern.test(id);
}

export function normalizeReportRequest(body: unknown): ReportRequest {
  if (!body || typeof body !== "object") {
    throw new Error("Request body must be a JSON object.");
  }

  const candidate = body as { inputType?: unknown; query?: unknown };
  const inputType = parseInputType(candidate.inputType);
  const query = typeof candidate.query === "string" ? candidate.query.trim() : "";

  if (!inputType) {
    throw new Error('inputType must be "company" or "region".');
  }

  if (!query) {
    throw new Error("query is required.");
  }

  return { inputType, query };
}

export async function getReportForInput(request: ReportRequest): Promise<{
  report: Report;
  mode: "demo" | "supabase";
}> {
  if (isDemoMode()) {
    const report = findDemoReport(request);

    if (!report) {
      throw new NotFoundError(`No demo report exists for ${request.inputType}: ${request.query}.`);
    }

    return { report, mode: "demo" };
  }

  const report = await findSupabaseReport(request);

  if (!report) {
    throw new NotFoundError(
      `No Supabase report exists for ${request.inputType}: ${request.query}. Seed the reports tables or enable demo mode.`,
    );
  }

  return { report, mode: "supabase" };
}

export async function getReportById(id: string): Promise<{
  report: Report;
  mode: "demo" | "supabase";
}> {
  const cleanId = id.trim();

  if (!cleanId) {
    throw new NotFoundError("Report id is required.");
  }

  if (isDemoMode()) {
    const report = demoReports.find((candidate) => candidate.id === cleanId);

    if (!report) {
      throw new NotFoundError(`No demo report exists with id ${cleanId}.`);
    }

    return { report, mode: "demo" };
  }

  if (!isSupabaseReportId(cleanId)) {
    throw new NotFoundError(
      "That report id is not a live Supabase report id. Use the demo query route for fixture reports, or enable demo mode.",
    );
  }

  const report = await findSupabaseReportById(cleanId);

  if (!report) {
    throw new NotFoundError(`No Supabase report exists with id ${cleanId}.`);
  }

  return { report, mode: "supabase" };
}
