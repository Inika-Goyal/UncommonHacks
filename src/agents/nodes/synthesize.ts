import { createChatModel } from "@/agents/llm";
import { buildFeatureBundle } from "@/agents/ml/feature-bundle";
import { SYNTHESIS_SYSTEM_PROMPT } from "@/agents/prompts";
import type { OrchestratorState, OrchestratorUpdate } from "@/agents/state";
import { synthesisSchema, type AgentResult, type SynthesisOutput } from "@/agents/types";

function describeFindings(state: OrchestratorState): string {
  const lines: string[] = [];
  for (const agent of Object.values(state.agents) as AgentResult[]) {
    if (!agent) continue;
    lines.push(
      `Agent: ${agent.agent} | status: ${agent.status} | findings: ${agent.findings.length}`,
    );
    for (const finding of agent.findings) {
      lines.push(
        `  - [${finding.severity}/${finding.credibility}] ${finding.signal} (${finding.geography}) — ${finding.evidence.slice(0, 240)}`,
      );
    }
  }
  return lines.join("\n");
}

function fallbackSynthesis(state: OrchestratorState): SynthesisOutput {
  const allFindings = Object.values(state.agents).flatMap((agent) => agent?.findings ?? []);
  const severity = allFindings.length
    ? Math.max(...allFindings.map((f) => f.severity))
    : 1;
  const credibility = allFindings.length
    ? Math.round(
        allFindings.reduce((sum, f) => sum + f.credibility, 0) / allFindings.length,
      )
    : 1;
  const overallRisk = Math.min(100, severity * 15 + credibility * 5 + allFindings.length * 4);

  return {
    title: `${state.query}: preliminary exploitation-risk briefing`,
    summary:
      allFindings.length > 0
        ? `Synthesis fallback: ${allFindings.length} findings were collected across ${Object.keys(state.agents).length} agents. The OpenAI synthesis call did not return a valid response.`
        : "The agent swarm did not collect enough evidence to produce a synthesis.",
    recommendedAction:
      "Re-run the investigation after confirming source availability and API access.",
    severity,
    credibility,
    overallRisk,
  };
}

export async function synthesizeNode(state: OrchestratorState): Promise<OrchestratorUpdate> {
  const bundle = buildFeatureBundle(state);
  const persona = state.onboarding.reporterPersona ?? "NGO";
  const outputGoal = state.onboarding.outputGoal ?? "complaint";

  const evidence = describeFindings(state);

  const model = createChatModel("synthesis").withStructuredOutput(synthesisSchema, {
    name: "synthesis_output",
  });

  let synthesis: SynthesisOutput;
  try {
    synthesis = await model.invoke([
      { role: "system", content: SYNTHESIS_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Subject: ${state.query} (${state.inputType})
Countries in scope: ${state.countries.join(", ") || "—"}
Industry: ${state.onboarding.industry ?? "unspecified"}
Reporter persona: ${persona}
Output goal: ${outputGoal}

Agent findings:
${evidence || "(none)"}

Feature bundle summary:
- News articles: ${bundle.news.articleCount} (${bundle.news.last30dCount} in last 30d)
- Watchlist matches: ${bundle.watchlist.matchCount}
- Facility records: ${bundle.supplier.facilityCount}
- Court cases: ${bundle.legal.courtCaseCount} (FLSA: ${bundle.legal.flsaCaseCount})
- ILO complaints: ${bundle.legal.iloComplaintCount}
- GSI weighted prevalence: ${bundle.riskIndex.weightedScore ?? "n/a"}`,
      },
    ]);
  } catch {
    synthesis = fallbackSynthesis(state);
  }

  return {
    featureBundle: bundle,
    synthesis,
  };
}
