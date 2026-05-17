import { randomUUID } from "node:crypto";

import type {
  Citation,
  ExploitCategory,
  Finding,
  MapPoint,
} from "@/lib/report-types";

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
import {
  lookupWebSupplyChainResearch,
  type WebResearchDocument,
} from "@/agents/tools/web-supply-chain-research";

const TARGET_MIN_MAP_POINTS = 6;

const accessedAt = () => new Date().toISOString().slice(0, 10);

function summarizeDocuments(documents: WebResearchDocument[]): string {
  if (documents.length === 0) {
    return "No public web documents could be fetched for this research pass.";
  }

  return documents
    .slice(0, 10)
    .map(
      (doc, index) => `${index + 1}. ${doc.title}
Source: ${doc.source}
URL: ${doc.url}
Query: ${doc.query}
Fetched: ${doc.fetched ? "yes" : "snippet-only"}
Snippet: ${doc.snippet || "n/a"}
Text: ${doc.text.slice(0, 1_400)}`,
    )
    .join("\n\n");
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

async function extractWebGraph(state: OrchestratorState, documents: WebResearchDocument[]) {
  const model = createChatModel("extraction").withStructuredOutput(supplyChainGraphSchema, {
    name: "web_supply_chain_graph",
  });

  return model.invoke([
    {
      role: "system",
      content: `You are a live supply-chain web researcher. Extract only evidence-backed graph nodes and arcs for a labor-exploitation map.

${GLOBAL_SUPPLY_CHAIN_GRAPH_CONTRACT}
${REPRESENTATIVE_MARKET_POLICY}

Extraction rules:
- Use only facts supported by the provided public web documents or snippets.
- Prefer raw material/input origins, component or processing suppliers, assembly/manufacturing locations, transit/import routes, distribution markets, store markets, and consumer markets.
- Use stage values: raw_material, component_or_processing, assembly, transit, distribution, consumer_market. Use legacy origin/labor/factory/consumer only when prior evidence wording makes that more accurate.
- If evidence supports branching, add arcs from the source node key to each downstream node key.
- If a relationship is not directly supported, omit the arc and let the graph composer add only broad representative stage-to-stage arcs.
- Return no more than 14 nodes and 24 arcs.`,
    },
    {
      role: "user",
      content: `Subject: ${state.query}
Industry: ${state.onboarding.industry ?? "unspecified"}
Countries entered by user: ${state.countries.join(", ") || "none"}
Target: try to find ${TARGET_MIN_MAP_POINTS}-10 high-quality mapped signals, but return fewer when the evidence is thin.
Accessed date for citations: ${accessedAt()}

Public web evidence:
${summarizeDocuments(documents)}`,
    },
  ]);
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

async function mapPointsFromNode(node: SupplyChainGraphNode): Promise<MapPoint[]> {
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
    order: node.sequence || SUPPLY_CHAIN_STAGE_ORDER[node.stage],
    causes: [
      `${node.precision}-level web research signal`,
      node.evidence,
    ],
    sources: [
      ...node.citations.map((citation: Citation) => ({
        label: citation.label || citation.source,
        url: citation.url,
      })),
      { label: "OpenStreetMap Nominatim geocode", url: geocoded.payload.sourceUrl },
    ],
  }];
}

export async function webResearchNode(state: OrchestratorState): Promise<OrchestratorUpdate> {
  const result = await runAgentNode({
    agent: "web_research",
    reportId: state.reportId,
    runner: async () => {
      const lookup = await lookupWebSupplyChainResearch(
        state.query,
        state.countries,
        state.onboarding.industry,
      );

      if (lookup.source === "miss") {
        throw lookup.error instanceof Error
          ? lookup.error
          : new Error("Public web supply-chain research failed without a cached fallback.");
      }

      const documents = lookup.payload.documents;
      const graph = await extractWebGraph(state, documents);
      const nodes = dedupeNodes(graph.nodes).slice(0, 14);
      const mappedPairs = await Promise.all(
        nodes.map(async (node) => ({ node, points: await mapPointsFromNode(node) })),
      );
      const mapped = mappedPairs.filter((pair) => pair.points.length > 0);

      const nodePointIds = new Map(mapped.map((pair) => [pair.node.key, pair.points[0].id]));
      const extractedArcs = mapExtractedArcsToPoints(graph.arcs, nodePointIds);
      const points = mapped.flatMap((pair) => pair.points);
      const mapArcs = composeSupplyChainArcs(points, extractedArcs);
      const findings = nodes.map(findingFromNode);
      const fetchedCount = documents.filter((doc) => doc.fetched).length;
      const sourceStatus = lookup.source === "live" ? "ready" as const : "snapshot" as const;

      return {
        status: sourceStatus,
        detail: graphShapeSummary(points, mapArcs, fetchedCount, documents.length),
        findings,
        mapPoints: points,
        mapArcs,
        rawFeatures: {
          queryCount: lookup.payload.queries.length,
          resultCount: lookup.payload.results.length,
          fetchedDocumentCount: fetchedCount,
          extractedStageCount: nodes.length,
          mappedStageCount: mapped.length,
          arcCount: mapArcs.length,
          queryUrls: lookup.payload.queryUrls,
        },
      };
    },
  });

  return {
    agents: { web_research: result },
    mapPoints: result.mapPoints,
    mapArcs: result.mapArcs,
  };
}
