import { END, START, StateGraph } from "@langchain/langgraph";

import { ingestNode } from "@/agents/nodes/ingest";
import { newsNode } from "@/agents/nodes/news";
import { watchlistNode } from "@/agents/nodes/watchlist";
import { supplierNode } from "@/agents/nodes/supplier";
import { pipelineNode } from "@/agents/nodes/pipeline";
import { legalNode } from "@/agents/nodes/legal";
import { riskIndexNode } from "@/agents/nodes/risk-index";
import { synthesizeNode } from "@/agents/nodes/synthesize";
import { persistNode } from "@/agents/nodes/persist";
import { orchestratorAnnotation } from "@/agents/state";

export const SPECIALIST_NODES = ["news", "watchlist", "supplier", "pipeline", "legal", "risk_index"] as const;

let compiledGraph: ReturnType<typeof buildGraph> | null = null;

function buildGraph() {
  const graph = new StateGraph(orchestratorAnnotation)
    .addNode("ingest", ingestNode)
    .addNode("news", newsNode)
    .addNode("watchlist", watchlistNode)
    .addNode("supplier", supplierNode)
    .addNode("pipeline", pipelineNode)
    .addNode("legal", legalNode)
    .addNode("risk_index", riskIndexNode)
    .addNode("synthesize", synthesizeNode)
    .addNode("persist", persistNode)
    .addEdge(START, "ingest")
    .addEdge("ingest", "news")
    .addEdge("ingest", "watchlist")
    .addEdge("ingest", "legal")
    .addEdge("ingest", "risk_index")
    .addEdge("news", "supplier")
    .addEdge(["watchlist", "supplier", "legal", "risk_index"], "pipeline")
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
