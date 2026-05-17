import { randomUUID } from "node:crypto";

import type { ExploitCategory, MapPoint } from "@/lib/report-types";

import type { SupplyChainGraphNode } from "@/agents/supply-chain-graph";

const GLOBAL_MARKET_PATTERN =
  /\b(global|globally|worldwide|international|cross-border|direct-to-consumer|e-?commerce|online marketplace|online retail)\b/i;

const GLOBAL_MARKET_ANCHORS = [
  {
    label: "North America representative consumer market",
    location: "North America",
    latitude: 39.8,
    longitude: -98.6,
  },
  {
    label: "Europe representative consumer market",
    location: "Europe",
    latitude: 50.8,
    longitude: 10.4,
  },
  {
    label: "Asia-Pacific representative consumer market",
    location: "Asia-Pacific",
    latitude: 14.6,
    longitude: 101.0,
  },
] as const;

export function isBroadMarketNode(node: SupplyChainGraphNode): boolean {
  if (node.stage !== "consumer_market" && node.stage !== "consumer" && node.stage !== "distribution") {
    return false;
  }

  return GLOBAL_MARKET_PATTERN.test(`${node.label} ${node.location} ${node.evidence}`);
}

export function buildGlobalMarketPoints(node: SupplyChainGraphNode): MapPoint[] {
  return GLOBAL_MARKET_ANCHORS.map((anchor) => ({
    id: randomUUID(),
    label: anchor.label,
    latitude: anchor.latitude,
    longitude: anchor.longitude,
    risk: node.risk,
    exploitType: node.exploitType as ExploitCategory,
    severity: node.severity,
    stage: "consumer_market",
    order: Math.max(node.sequence, 5),
    causes: [
      "Representative regional market anchor from cited global or international distribution evidence",
      node.evidence,
    ],
    sources: node.citations.map((citation) => ({
      label: citation.label || citation.source,
      url: citation.url,
    })),
  }));
}
