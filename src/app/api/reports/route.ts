import { NextResponse } from "next/server";

import type { ReportResponse } from "@/lib/report-types";
import { normalizeReportRequest, getReportForInput, NotFoundError } from "@/lib/report-service";
import { ConfigError } from "@/lib/runtime-config";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const reportRequest = normalizeReportRequest(body);
    const { report, mode } = await getReportForInput(reportRequest);

    return NextResponse.json<ReportResponse>({
      ok: true,
      report,
      mode,
    });
  } catch (error) {
    const response = toErrorResponse(error);
    return NextResponse.json<ReportResponse>(response.body, { status: response.status });
  }
}

function toErrorResponse(error: unknown): {
  status: number;
  body: Extract<ReportResponse, { ok: false }>;
} {
  if (error instanceof ConfigError) {
    return {
      status: 503,
      body: {
        ok: false,
        code: error.code,
        error: error.message,
      },
    };
  }

  if (error instanceof NotFoundError) {
    return {
      status: 404,
      body: {
        ok: false,
        code: error.code,
        error: error.message,
      },
    };
  }

  return {
    status: 400,
    body: {
      ok: false,
      code: "REPORT_REQUEST_ERROR",
      error: error instanceof Error ? error.message : "Unable to generate report.",
    },
  };
}
