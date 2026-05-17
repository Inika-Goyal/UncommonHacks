import { createComplaintPdf } from "@/lib/complaint-pdf";
import { getReportById, NotFoundError } from "@/lib/report-service";
import { ConfigError } from "@/lib/runtime-config";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { report } = await getReportById(id);
    const pdfBytes = await createComplaintPdf(report);
    const body = pdfBytes.buffer.slice(
      pdfBytes.byteOffset,
      pdfBytes.byteOffset + pdfBytes.byteLength,
    ) as ArrayBuffer;

    return new Response(body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${report.id}-complaint.pdf"`,
      },
    });
  } catch (error) {
    const { status, message, code } = toPdfError(error);

    return Response.json(
      {
        ok: false,
        code,
        error: message,
      },
      { status },
    );
  }
}

function toPdfError(error: unknown) {
  if (error instanceof ConfigError) {
    return { status: 503, code: error.code, message: error.message };
  }

  if (error instanceof NotFoundError) {
    return { status: 404, code: error.code, message: error.message };
  }

  return {
    status: 500,
    code: "PDF_GENERATION_ERROR",
    message: error instanceof Error ? error.message : "Unable to generate complaint PDF.",
  };
}
