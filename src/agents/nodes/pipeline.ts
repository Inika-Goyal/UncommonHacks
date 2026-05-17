import { randomUUID } from "node:crypto";

import type { ExploitCategory, Finding, MapPoint, MapPointStage } from "@/lib/report-types";

import { createChatModel } from "@/agents/llm";
import { buildGlobalMarketPoints, isBroadMarketNode } from "@/agents/global-market-anchors";
import type { OrchestratorState, OrchestratorUpdate } from "@/agents/state";
import { runAgentNode } from "@/agents/nodes/_helpers";
import {
  GLOBAL_SUPPLY_CHAIN_GRAPH_CONTRACT,
  REPRESENTATIVE_MARKET_POLICY,
  SUPPLY_CHAIN_STAGE_ORDER,
  composeSupplyChainArcs,
  graphShapeSummary,
  mapExtractedArcsToPoints,
  supplyChainGraphSchema,
  type SupplyChainGraphNode,
} from "@/agents/supply-chain-graph";
import { geocodeLocation } from "@/agents/tools/live-geocode";
import { lookupPipelineNews, type PipelineArticle } from "@/agents/tools/pipeline-news";

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
  if (agent === "supplier") return "assembly";
  if (agent === "legal") return "distribution";
  if (agent === "risk_index") return "origin";
  return "labor";
}

function fallbackNodesFromFindings(state: OrchestratorState): SupplyChainGraphNode[] {
  const nodes: SupplyChainGraphNode[] = [];
  for (const result of Object.values(state.agents)) {
    if (!result) continue;
    for (const finding of result.findings) {
      if (!finding.geography || /^unknown|n\/a|global$/i.test(finding.geography)) continue;
      const firstCitation = finding.citations[0];
      if (!firstCitation) continue;
      const stage = stageFromAgent(result.agent);
      nodes.push({
        key: `${result.agent}-${finding.id}`,
        stage,
        label: `${finding.geography} ${stage}`,
        location: finding.geography,
        precision: finding.geography.includes(",") ? "city" : "country",
        sequence: SUPPLY_CHAIN_STAGE_ORDER[stage],
        risk: finding.severity >= 4 ? "high" : finding.severity >= 3 ? "medium" : "low",
        exploitType: finding.category ?? "forced_labor",
        severity: finding.severity,
        confidence: finding.credibility,
        evidence: finding.evidence,
        citations: [firstCitation],
      });
    }
  }
  return nodes.slice(0, 6);
}

function dedupeNodes(nodes: SupplyChainGraphNode[]): SupplyChainGraphNode[] {
  const seen = new Set<string>();
  const out: SupplyChainGraphNode[] = [];
  for (const node of [...nodes].sort((a, b) => a.sequence - b.sequence)) {
    const key = `${node.stage}|${node.location.toLowerCase()}|${node.label.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(node);
  }
  return out;
}

function citationBlob(node: SupplyChainGraphNode): string {
  return node.citations
    .map((citation) => `${citation.label} ${citation.source} ${citation.url}`)
    .join(" ")
    .toLowerCase();
}

function isGoodsPipelineNode(node: SupplyChainGraphNode): boolean {
  const stageText = `${node.label} ${node.location} ${node.evidence}`.toLowerCase();
  if (/(headquarters|head office|corporate domicile|registered office)/.test(stageText)) {
    return node.stage === "distribution" || node.stage === "consumer_market" || node.stage === "consumer";
  }

  if (node.stage === "raw_material" || node.stage === "origin" || node.stage === "component_or_processing" || node.stage === "labor" || node.stage === "assembly" || node.stage === "factory") {
    const citations = citationBlob(node);
    if (/courtlistener|court filing|lawsuit|docket/.test(citations)) {
      return false;
    }
  }

  if (node.stage === "raw_material" || node.stage === "component_or_processing" || node.stage === "labor" || node.stage === "assembly" || node.stage === "factory") {
    const hasProductionEvidence =
      /raw material|material|mine|mining|smelter|refiner|component|processing|factory|supplier|manufactur|production|assembly|sourcing|worker|workforce|garment|textile|apparel|footwear|electronics|cotton|leather|rubber|sweatshop/.test(
        stageText,
      );
    const isRegulatoryOnly =
      /investigation|attorney general|lawsuit|court|legal|unsafe product|product safety/.test(stageText);
    if (!hasProductionEvidence || isRegulatoryOnly) return false;
  }

  return true;
}

function isNearExisting(node: SupplyChainGraphNode, existing: MapPoint[]): boolean {
  const location = node.location.toLowerCase();
  return existing.some((point) => {
    const label = point.label.toLowerCase();
    return label.includes(location) || location.includes(label);
  });
}

function findingFromNode(node: SupplyChainGraphNode): Finding {
  return {
    id: randomUUID(),
    signal: `${node.label}: ${node.evidence.slice(0, 140)}`,
    severity: node.severity,
    credibility: node.confidence,
    geography: node.location,
    evidence: node.evidence,
    citations: node.citations,
    category: node.exploitType,
  };
}

async function mapPointsFromNode(node: SupplyChainGraphNode, index: number): Promise<MapPoint[]> {
  if (isBroadMarketNode(node)) {
    return buildGlobalMarketPoints(node);
  }

  const geocoded = await geocodeLocation(node.location);
  if (geocoded.source === "miss") return [];

  return [{
    id: randomUUID(),
    label: node.label,
    latitude: geocoded.payload.latitude,
    longitude: geocoded.payload.longitude,
    risk: node.risk,
    exploitType: node.exploitType as ExploitCategory,
    severity: node.severity,
    stage: node.stage,
    order: index,
    causes: [
      `${node.precision}-level pipeline location surfaced by source research`,
      node.evidence,
    ],
    sources: [
      ...node.citations.map((citation) => ({ label: citation.label || citation.source, url: citation.url })),
      { label: "OpenStreetMap Nominatim geocode", url: geocoded.payload.sourceUrl },
    ],
  }];
}

async function extractPipelineGraph(state: OrchestratorState, articles: PipelineArticle[]) {
  const model = createChatModel("extraction").withStructuredOutput(supplyChainGraphSchema, {
    name: "pipeline_supply_chain_graph",
  });

  const result = await model.invoke([
    {
      role: "system",
      content: `You are a supply-chain graph composer. Extract and sanitize a representative physical goods network from source evidence.

${GLOBAL_SUPPLY_CHAIN_GRAPH_CONTRACT}
${REPRESENTATIVE_MARKET_POLICY}

Rules:
- Use only locations supported by the provided source evidence. Do not invent factory names, store addresses, or countries.
- Use stage values: raw_material, component_or_processing, assembly, transit, distribution, consumer_market. Use legacy origin/labor/factory/consumer only for prior evidence that is already categorized that way.
- If the evidence is only country-level, return a country-level node. That is acceptable and should be mapped as a broad market/country point.
- Include consumer, import, distribution, or store-market nodes only when evidence says the subject sells, imports, distributes, has stores, reports revenue, or faces investigation there.
- Do not treat headquarters, registered offices, lawsuits, or corporate domicile as raw-material, component, or assembly nodes.
- Raw-material/component/assembly nodes require sourcing, material, mining, processing, supplier, worker, manufacturing, import, production, or assembly evidence.
- Add explicit arcs only when evidence supports a relationship. Otherwise return nodes and let the graph composer add representative stage-to-stage arcs.
- Every node must include a citation URL copied from the evidence.
- Return no more than 14 nodes and 24 arcs.`,
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

  return {
    nodes: dedupeNodes(result.nodes),
    arcs: result.arcs,
  };
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

      let extractionError = "";
      const extracted = await extractPipelineGraph(state, articles).catch((error) => {
        extractionError = error instanceof Error ? error.message : String(error);
        return { nodes: [], arcs: [] };
      });
      const nodes = dedupeNodes(
        extracted.nodes.length > 0 ? extracted.nodes : fallbackNodesFromFindings(state),
      )
        .filter(isGoodsPipelineNode)
        .filter((node) => !isNearExisting(node, state.mapPoints))
        .slice(0, 10);

      const mappedPairs = await Promise.all(
        nodes.map(async (node, index) => ({
          node,
          points: await mapPointsFromNode(node, index + state.mapPoints.length),
        })),
      );
      const mapped = mappedPairs.filter((pair) => pair.points.length > 0);
      const points = mapped.flatMap((pair) => pair.points);
      const nodePointIds = new Map(mapped.map((pair) => [pair.node.key, pair.points[0].id]));
      const extractedArcs = mapExtractedArcsToPoints(extracted.arcs, nodePointIds);
      const allPoints = [...state.mapPoints, ...points];
      const mapArcs = composeSupplyChainArcs(allPoints, [...state.mapArcs, ...extractedArcs]);

      const findings = nodes.map(findingFromNode);
      const status = newsLookup.source === "live" ? "ready" : newsLookup.source === "miss" ? "blocked" : "snapshot";
      const graphDetail =
        allPoints.length > 0
          ? graphShapeSummary(allPoints, mapArcs, articles.length, articles.length)
          : "No geocodable pipeline stages surfaced from the available source evidence.";
      const detail = extractionError
        ? `${graphDetail} Extraction degraded: ${extractionError.slice(0, 120)}`
        : graphDetail;

      return {
        status,
        detail,
        findings,
        mapPoints: points,
        mapArcs,
        rawFeatures: {
          pipelineStageCount: nodes.length,
          mappedStageCount: mapped.length,
          articleCount: articles.length,
          arcCount: mapArcs.length,
          queryUrls: newsLookup.source === "miss" ? [] : newsLookup.payload.queryUrls,
        },
      };
    },
  });

  return { agents: { pipeline: result }, mapPoints: result.mapPoints, mapArcs: result.mapArcs };
}
