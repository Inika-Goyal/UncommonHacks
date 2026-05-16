import { NotFoundError, getReportById } from "@/lib/report-service";
import { ConfigError } from "@/lib/runtime-config";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  try {
    const { report, mode } = await getReportById(id);
    return Response.json({ ok: true, report, mode });
  } catch (error) {
    if (error instanceof ConfigError) {
      return Response.json(
        { ok: false, code: error.code, error: error.message },
        { status: 503 },
      );
    }
    if (error instanceof NotFoundError) {
      return Response.json(
        { ok: false, code: error.code, error: error.message },
        { status: 404 },
      );
    }

    return Response.json(
      {
        ok: false,
        code: "REPORT_LOOKUP_ERROR",
        error: error instanceof Error ? error.message : "Unable to load report.",
      },
      { status: 500 },
    );
  }
}
