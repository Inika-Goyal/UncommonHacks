import { randomUUID } from "node:crypto";
import { z } from "zod";

import type { ExploitCategory, Finding, MapPoint, MapPointStage } from "@/lib/report-types";

import { createChatModel } from "@/agents/llm";
import type { OrchestratorState, OrchestratorUpdate } from "@/agents/state";
import { runAgentNode } from "@/agents/nodes/_helpers";
import { geocodeLocation } from "@/agents/tools/live-geocode";
import { lookupPipelineNews, type PipelineArticle } from "@/agents/tools/pipeline-news";

const STAGE_ORDER: Record<MapPointStage, number> = {
  origin: 0,
  labor: 1,
  factory: 2,
  transit: 3,
  distribution: 4,
  consumer: 5,
};

const citationSchema = z.object({
  label: z.string(),
  source: z.string(),
  url: z.string(),
  accessedAt: z.string(),
});

const pipelineStageSchema = z.object({
  stage: z.enum(["origin", "labor", "factory", "transit", "distribution", "consumer"]),
  label: z.string().min(2),
  location: z.string().min(2),
  precision: z.enum(["facility", "city", "region", "country", "market"]),
  sequence: z.number().int().min(0).max(20),
  risk: z.enum(["high", "medium", "low"]),
  exploitType: z.enum(["forced_labor", "illegal_profits", "sexual_exploitation", "child_labor"]),
  severity: z.number().int().min(1).max(5),
  evidence: z.string().min(10),
  citations: z.array(citationSchema).min(1),
});

const pipelineEnvelopeSchema = z.object({
  stages: z.array(pipelineStageSchema).max(10),
});

type PipelineStage = z.infer<typeof pipelineStageSchema>;

function summarizeArticles(articles: PipelineArticle[]): string {
  if (articles.length === 0) return "No pipeline-specific news articles returned.";
  return articles
    .slice(0, 30)
    .map(
      (article, idx) =>
        `${idx + 1}. ${article.title} | ${article.source} | ${article.publishedAt} | query="${article.query}" | ${article.url}`,
    )
    .join("\n");
}

function summarizeAgentEvidence(state: OrchestratorState): string {
  const lines: string[] = [];
  for (const result of Object.values(state.agents)) {
    if (!result) continue;
    for (const finding of result.findings) {
      const citationText = finding.citations
        .slice(0, 2)
        .map((citation) => `${citation.source}: ${citation.url}`)
        .join("; ");
      lines.push(
        `${result.agent}: ${finding.signal} | geography=${finding.geography} | evidence=${finding.evidence} | citations=${citationText}`,
      );
    }
  }
  return lines.length > 0 ? lines.join("\n") : "No prior agent findings available.";
}

function stageFromAgent(agent: string): MapPointStage {
  if (agent === "supplier") return "factory";
  if (agent === "legal") return "distribution";
  if (agent === "risk_index") return "origin";
  return "labor";
}

function fallbackStagesFromFindings(state: OrchestratorState): PipelineStage[] {
  const stages: PipelineStage[] = [];
  for (const result of Object.values(state.agents)) {
    if (!result) continue;
    for (const finding of result.findings) {
      if (!finding.geography || /^unknown|n\/a|global$/i.test(finding.geography)) continue;
      const firstCitation = finding.citations[0];
      if (!firstCitation) continue;
      const stage = stageFromAgent(result.agent);
      stages.push({
        stage,
        label: `${finding.geography} ${stage}`,
        location: finding.geography,
        precision: finding.geography.includes(",") ? "city" : "country",
        sequence: STAGE_ORDER[stage],
        risk: finding.severity >= 4 ? "high" : finding.severity >= 3 ? "medium" : "low",
        exploitType: finding.category ?? "forced_labor",
        severity: finding.severity,
        evidence: finding.evidence,
        citations: [firstCitation],
      });
    }
  }
  return stages.slice(0, 6);
}

function dedupeStages(stages: PipelineStage[]): PipelineStage[] {
  const seen = new Set<string>();
  const out: PipelineStage[] = [];
  for (const stage of [...stages].sort((a, b) => a.sequence - b.sequence)) {
    const key = `${stage.stage}|${stage.location.toLowerCase()}|${stage.label.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(stage);
  }
  return out;
}

function citationBlob(stage: PipelineStage): string {
  return stage.citations
    .map((citation) => `${citation.label} ${citation.source} ${citation.url}`)
    .join(" ")
    .toLowerCase();
}

function isGoodsPipelineStage(stage: PipelineStage): boolean {
  const stageText = `${stage.label} ${stage.location} ${stage.evidence}`.toLowerCase();
  if (/(headquarters|head office|corporate domicile|registered office)/.test(stageText)) {
    return stage.stage === "distribution" || stage.stage === "consumer";
  }

  if (stage.stage === "origin" || stage.stage === "labor" || stage.stage === "factory") {
    const citations = citationBlob(stage);
    if (/courtlistener|court filing|lawsuit|docket/.test(citations)) {
      return false;
    }
  }

  if (stage.stage === "labor" || stage.stage === "factory") {
    const hasProductionEvidence =
      /factory|supplier|manufactur|production|assembly|sourcing|worker|workforce|garment|textile|apparel|sweatshop/.test(
        stageText,
      );
    const isRegulatoryOnly =
      /investigation|attorney general|lawsuit|court|legal|unsafe product|product safety/.test(stageText);
    if (!hasProductionEvidence || isRegulatoryOnly) return false;
  }

  return true;
}

function isNearExisting(stage: PipelineStage, existing: MapPoint[]): boolean {
  if (
    existing.some((point) => point.stage === "factory") &&
    (stage.stage === "labor" || stage.stage === "factory") &&
    stage.precision !== "facility"
  ) {
    return true;
  }

  const location = stage.location.toLowerCase();
  return existing.some((point) => {
    const label = point.label.toLowerCase();
    return label.includes(location) || location.includes(label);
  });
}

function findingFromStage(stage: PipelineStage): Finding {
  return {
    id: randomUUID(),
    signal: `${stage.label}: ${stage.evidence.slice(0, 140)}`,
    severity: stage.severity,
    credibility: stage.precision === "facility" ? 4 : 3,
    geography: stage.location,
    evidence: stage.evidence,
    citations: stage.citations,
    category: stage.exploitType,
  };
}

async function mapPointFromStage(stage: PipelineStage, index: number): Promise<MapPoint | null> {
  const geocoded = await geocodeLocation(stage.location);
  if (geocoded.source === "miss") return null;

  return {
    id: randomUUID(),
    label: stage.label,
    latitude: geocoded.payload.latitude,
    longitude: geocoded.payload.longitude,
    risk: stage.risk,
    exploitType: stage.exploitType as ExploitCategory,
    severity: stage.severity,
    stage: stage.stage,
    order: index,
    causes: [
      `${stage.precision}-level pipeline location surfaced by source research`,
      stage.evidence,
    ],
    sources: [
      ...stage.citations.map((citation) => ({ label: citation.label || citation.source, url: citation.url })),
      { label: "OpenStreetMap Nominatim geocode", url: geocoded.payload.sourceUrl },
    ],
  };
}

async function extractPipelineStages(state: OrchestratorState, articles: PipelineArticle[]): Promise<PipelineStage[]> {
  const model = createChatModel("extraction").withStructuredOutput(pipelineEnvelopeSchema, {
    name: "pipeline_stages",
  });

  const result = await model.invoke([
    {
      role: "system",
      content: `You are a supply-chain pipeline research agent. Extract an ordered physical goods pipeline from source evidence: raw-material or origin geographies, labor/factory/assembly locations, transit or import routes, distribution markets, and consumer/store markets.

Rules:
- Use only locations supported by the provided source evidence. Do not invent factory names, store addresses, or countries.
- If the evidence is only country-level, return a country-level stage. That is acceptable and should be mapped as a broad market/country point.
- Include U.S. consumer, import, distribution, or store-market stages only when the evidence says the subject sells, imports, distributes, litigates, or is investigated there.
- Do not treat headquarters, registered offices, lawsuits, or corporate domicile as labor/factory stages. Labor/factory stages require sourcing, factory, supplier, worker, manufacturing, import, or production evidence.
- Every stage must include a citation URL copied from the evidence.
- Return no more than 10 stages, in physical flow order.`,
    },
    {
      role: "user",
      content: `Subject: ${state.query}
Industry: ${state.onboarding.industry ?? "unspecified"}
Countries entered by user: ${state.countries.join(", ") || "none"}

Pipeline news evidence:
${summarizeArticles(articles)}

Prior agent findings:
${summarizeAgentEvidence(state)}`,
    },
  ]);

  return dedupeStages(result.stages);
}

export async function pipelineNode(state: OrchestratorState): Promise<OrchestratorUpdate> {
  const result = await runAgentNode({
    agent: "pipeline",
    reportId: state.reportId,
    runner: async () => {
      const newsLookup = await lookupPipelineNews(
        state.query,
        state.countries,
        state.onboarding.industry,
        state.onboarding.timeWindowMonths ?? 12,
      );
      const articles = newsLookup.source === "miss" ? [] : newsLookup.payload.articles;

      const extracted = await extractPipelineStages(state, articles).catch(() => []);
      const stages = dedupeStages(
        extracted.length > 0 ? extracted : fallbackStagesFromFindings(state),
      )
        .filter(isGoodsPipelineStage)
        .filter((stage) => !isNearExisting(stage, state.mapPoints))
        .slice(0, 8);

      const mapped = (
        await Promise.all(stages.map((stage, index) => mapPointFromStage(stage, index + state.mapPoints.length)))
      ).filter((point): point is MapPoint => Boolean(point));

      const findings = stages.map(findingFromStage);
      const status = newsLookup.source === "live" ? "ready" : newsLookup.source === "miss" ? "blocked" : "snapshot";
      const detail =
        mapped.length > 0
          ? `${mapped.length} pipeline stages mapped from ${articles.length} live/cached supply-chain articles and prior findings.`
          : "No geocodable pipeline stages surfaced from the available source evidence.";

      return {
        status,
        detail,
        findings,
        mapPoints: mapped,
        rawFeatures: {
          pipelineStageCount: stages.length,
          mappedStageCount: mapped.length,
          articleCount: articles.length,
          queryUrls: newsLookup.source === "miss" ? [] : newsLookup.payload.queryUrls,
        },
      };
    },
  });

  return { agents: { pipeline: result }, mapPoints: result.mapPoints };
}
