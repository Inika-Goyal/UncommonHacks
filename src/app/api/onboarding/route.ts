import { after } from "next/server";

import { onboardingAnswersSchema, type OnboardingAnswers } from "@/lib/onboarding-types";
import { ConfigError, getOpenAIConfig, isDemoMode } from "@/lib/runtime-config";

import { createReportShell } from "@/agents/persistence";
import { runSwarm } from "@/agents/runtime";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { ok: false, code: "INVALID_BODY", error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = onboardingAnswersSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        ok: false,
        code: "INVALID_ONBOARDING",
        error: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "),
      },
      { status: 400 },
    );
  }

  if (isDemoMode()) {
    return Response.json(
      {
        ok: false,
        code: "DEMO_MODE",
        error:
          "Demo mode is enabled. Disable NEXT_PUBLIC_DEMO_MODE to run the live agent swarm, or query the demo fixtures via /api/reports.",
      },
      { status: 409 },
    );
  }

  try {
    getOpenAIConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      return Response.json(
        { ok: false, code: error.code, error: error.message },
        { status: 503 },
      );
    }
    throw error;
  }

  const onboarding: OnboardingAnswers = parsed.data as OnboardingAnswers;

  let reportId: string;
  try {
    reportId = await createReportShell({
      inputType: onboarding.inputType,
      query: onboarding.query,
      onboarding: {
        industry: onboarding.industry,
        countries: onboarding.countries,
        timeWindowMonths: onboarding.timeWindowMonths,
        reporterPersona: onboarding.reporterPersona,
        outputGoal: onboarding.outputGoal,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create report.";
    return Response.json(
      { ok: false, code: "REPORT_SHELL_ERROR", error: message },
      { status: 500 },
    );
  }

  after(async () => {
    await runSwarm({
      reportId,
      inputType: onboarding.inputType,
      query: onboarding.query,
      onboarding,
    });
  });

  return Response.json({ ok: true, reportId });
}
