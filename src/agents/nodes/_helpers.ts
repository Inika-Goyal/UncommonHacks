import { z } from "zod";
import { randomUUID } from "node:crypto";

import type { Finding, MapArc, MapPoint, SourceStatus } from "@/lib/report-types";

import { createChatModel } from "@/agents/llm";
import { buildAgentSystemPrompt } from "@/agents/prompts";
import { findingSchema, type AgentName, type AgentResult } from "@/agents/types";
import { insertFindings, insertMapPoints, upsertSourceStatus } from "@/agents/persistence";

const findingsEnvelopeSchema = z.object({
  findings: z.array(findingSchema).max(5),
});

export type ExtractFindingsArgs = {
  agent: AgentName;
  evidence: string;
  instructions: string;
};

export async function extractFindingsWithLlm(args: ExtractFindingsArgs): Promise<Finding[]> {
  const model = createChatModel("extraction").withStructuredOutput(findingsEnvelopeSchema, {
    name: `${args.agent}_findings`,
  });
  const system = buildAgentSystemPrompt(args.agent);
  const result = await model.invoke([
    { role: "system", content: system },
    {
      role: "user",
      content: `${args.instructions}\n\nEvidence:\n${args.evidence}`,
    },
  ]);

  return result.findings.map((finding) => ({
    id: randomUUID(),
    signal: finding.signal,
    severity: finding.severity,
    credibility: finding.credibility,
    geography: finding.geography,
    evidence: finding.evidence,
    citations: finding.citations,
  }));
}

export type RunAgentArgs = {
  agent: AgentName;
  reportId: string;
  runner: () => Promise<{
    status: SourceStatus;
    detail: string;
    findings: Finding[];
    mapPoints?: MapPoint[];
    mapArcs?: MapArc[];
    rawFeatures: Record<string, unknown>;
  }>;
};

export async function runAgentNode({ agent, reportId, runner }: RunAgentArgs): Promise<AgentResult> {
  const startedAt = new Date().toISOString();
  await upsertSourceStatus(reportId, agent, "pending", "Agent running...");

  try {
    const outcome = await runner();
    await upsertSourceStatus(reportId, agent, outcome.status, outcome.detail);
    await insertFindings(reportId, outcome.findings);
    if (outcome.mapPoints && outcome.mapPoints.length > 0) {
      await insertMapPoints(reportId, outcome.mapPoints);
    }
    return {
      agent,
      status: outcome.status,
      detail: outcome.detail,
      findings: outcome.findings,
      mapPoints: outcome.mapPoints ?? [],
      mapArcs: outcome.mapArcs ?? [],
      rawFeatures: outcome.rawFeatures,
      startedAt,
      finishedAt: new Date().toISOString(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await upsertSourceStatus(reportId, agent, "blocked", message.slice(0, 200));
    return {
      agent,
      status: "blocked",
      detail: message.slice(0, 200),
      findings: [],
      mapPoints: [],
      mapArcs: [],
      rawFeatures: { error: message },
      startedAt,
      finishedAt: new Date().toISOString(),
    };
  }
}
