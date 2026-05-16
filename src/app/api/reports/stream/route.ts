import type { NextRequest } from "next/server";

import { subscribe } from "@/agents/runtime";
import type { StateUpdate } from "@/agents/types";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const reportId = request.nextUrl.searchParams.get("id");
  if (!reportId) {
    return Response.json(
      { ok: false, code: "MISSING_ID", error: "?id=<reportId> is required." },
      { status: 400 },
    );
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const writeEvent = (event: StateUpdate) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      writeEvent({ type: "agent", name: "news", status: "pending" });
      writeEvent({ type: "agent", name: "watchlist", status: "pending" });
      writeEvent({ type: "agent", name: "supplier", status: "pending" });
      writeEvent({ type: "agent", name: "legal", status: "pending" });
      writeEvent({ type: "agent", name: "risk_index", status: "pending" });

      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: keep-alive\n\n`));
        } catch {
          // controller closed
        }
      }, 15_000);

      unsubscribe = subscribe(reportId, (update) => {
        try {
          writeEvent(update);
          if (update.type === "done") {
            if (heartbeat) clearInterval(heartbeat);
            unsubscribe?.();
            controller.close();
          }
        } catch {
          // ignore — request was aborted
        }
      });

      request.signal.addEventListener("abort", () => {
        if (heartbeat) clearInterval(heartbeat);
        unsubscribe?.();
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
