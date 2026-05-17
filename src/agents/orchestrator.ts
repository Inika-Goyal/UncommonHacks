import { END, START, StateGraph } from "@langchain/langgraph";

import { ingestNode } from "@/agents/nodes/ingest";
import { newsNode } from "@/agents/nodes/news";
import { watchlistNode } from "@/agents/nodes/watchlist";
import { supplierNode } from "@/agents/nodes/supplier";
import { enrichCountriesNode } from "@/agents/nodes/enrich-countries";
import { webResearchNode } from "@/agents/nodes/web-research";
import { pipelineNode } from "@/agents/nodes/pipeline";
import { legalNode } from "@/agents/nodes/legal";
import { riskIndexNode } from "@/agents/nodes/risk-index";
import { synthesizeNode } from "@/agents/nodes/synthesize";
import { persistNode } from "@/agents/nodes/persist";
import { orchestratorAnnotation } from "@/agents/state";

export const SPECIALIST_NODES = [
  "news",
  "watchlist",
  "supplier",
  "web_research",
  "pipeline",
  "legal",
  "risk_index",
] as const;

let compiledGraph: ReturnType<typeof buildGraph> | null = null;

function buildGraph() {
  const graph = new StateGraph(orchestratorAnnotation)
    .addNode("ingest", ingestNode)
    .addNode("news", newsNode)
    .addNode("watchlist", watchlistNode)
    .addNode("supplier", supplierNode)
    .addNode("enrich_countries", enrichCountriesNode)
    .addNode("web_research", webResearchNode)
    .addNode("pipeline", pipelineNode)
    .addNode("legal", legalNode)
    .addNode("risk_index", riskIndexNode)
    .addNode("synthesize", synthesizeNode)
    .addNode("persist", persistNode)
    .addEdge(START, "ingest")
    .addEdge("ingest", "news")
    .addEdge("ingest", "watchlist")
    .addEdge("ingest", "web_research")
    .addEdge("ingest", "legal")
    .addEdge("ingest", "risk_index")
    .addEdge("news", "supplier")
    // enrich_countries needs all of watchlist/supplier/web_research/legal/risk_index
    // first, so it can see every agent's geography fields.
    .addEdge(["watchlist", "supplier", "web_research", "legal", "risk_index"], "enrich_countries")
    .addEdge("enrich_countries", "pipeline")
    .addEdge("pipeline", "synthesize")
    .addEdge("synthesize", "persist")
    .addEdge("persist", END);

  return graph.compile();
}

export function getCompiledGraph() {
  if (!compiledGraph) {
    compiledGraph = buildGraph();
  }
  return compiledGraph;
}
