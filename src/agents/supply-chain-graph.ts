import { z } from "zod";

import type { MapArc, MapPoint, MapPointStage } from "@/lib/report-types";

export const SUPPLY_CHAIN_STAGE_VALUES = [
  "raw_material",
  "component_or_processing",
  "assembly",
  "transit",
  "distribution",
  "consumer_market",
  "origin",
  "labor",
  "factory",
  "consumer",
] as const;

export const SUPPLY_CHAIN_STAGE_ORDER: Record<MapPointStage, number> = {
  raw_material: 0,
  origin: 0,
  component_or_processing: 1,
  labor: 1,
  assembly: 2,
  factory: 2,
  transit: 3,
  distribution: 4,
  consumer_market: 5,
  consumer: 5,
};

export const GLOBAL_SUPPLY_CHAIN_GRAPH_CONTRACT = `Global supply-chain graph contract:
- This must work for any company, product category, region, or industry.
- Do not special-case Apple, HOKA, Adidas, Nike, Vietnam, China, the U.S., or any named example.
- Build a representative evidence-backed supply-chain network, not exact shipment tracing.
- Prefer staged fan-in/fan-out: raw materials or inputs, component/processing suppliers, assembly/manufacturing, transit/import nodes when sourced, and representative distribution or consumer markets.
- Every node must be supported by provided evidence and cite an exact URL.
- Every arc must either be directly supported by evidence or clearly labeled as a representative flow between cited stages.
- Never invent top-five markets, facilities, countries, or routes to make the graph fuller.`;

export const REPRESENTATIVE_MARKET_POLICY = `Representative-market policy:
- Choose up to five market/destination countries only when cited evidence supports country-level sales, stores, distribution, imports, revenue, or consumer-market presence.
- If only regional evidence exists, use region-level market nodes and label them honestly.
- If fewer than five sourced markets exist, return fewer. Do not pad the graph.`;

export const graphCitationSchema = z.object({
  label: z.string(),
  source: z.string(),
  url: z.string(),
  accessedAt: z.string(),
});

export const graphNodeSchema = z.object({
  key: z.string().min(2),
  stage: z.enum(SUPPLY_CHAIN_STAGE_VALUES),
  label: z.string().min(2),
  location: z.string().min(2),
  precision: z.enum(["facility", "city", "region", "country", "market"]),
  sequence: z.number().int().min(0).max(20),
  risk: z.enum(["high", "medium", "low"]),
  exploitType: z.enum(["forced_labor", "illegal_profits", "sexual_exploitation", "child_labor"]),
  severity: z.number().int().min(1).max(5),
  confidence: z.number().int().min(1).max(5),
  evidence: z.string().min(10),
  citations: z.array(graphCitationSchema).min(1),
});

export const graphArcSchema = z.object({
  fromKey: z.string().min(2),
  toKey: z.string().min(2),
  label: z.string(),
  relationshipRationale: z.string(),
  confidence: z.number().int().min(1).max(5),
});

export const supplyChainGraphSchema = z.object({
  nodes: z.array(graphNodeSchema).max(14),
  arcs: z.array(graphArcSchema).max(24),
});

export type SupplyChainGraphNode = z.infer<typeof graphNodeSchema>;
export type SupplyChainGraphArc = z.infer<typeof graphArcSchema>;

export type MappedSupplyChainNode = {
  node: SupplyChainGraphNode;
  point: MapPoint;
};

type StageBucket = "rawInput" | "component" | "assembly" | "transit" | "distribution" | "market";

const STAGE_BUCKETS: Record<MapPointStage, StageBucket> = {
  raw_material: "rawInput",
  origin: "rawInput",
  component_or_processing: "component",
  labor: "component",
  assembly: "assembly",
  factory: "assembly",
  transit: "transit",
  distribution: "distribution",
  consumer_market: "market",
  consumer: "market",
};

const BUCKET_LABELS: Record<StageBucket, string> = {
  rawInput: "raw/input",
  component: "component/processing",
  assembly: "assembly",
  transit: "transit/import",
  distribution: "distribution",
  market: "market",
};

export function stageOrder(stage: MapPointStage): number {
  return SUPPLY_CHAIN_STAGE_ORDER[stage];
}

function bucketFor(point: MapPoint): StageBucket | null {
  return point.stage ? STAGE_BUCKETS[point.stage] : null;
}

function pointsInBucket(points: readonly MapPoint[], bucket: StageBucket): MapPoint[] {
  return points.filter((point) => bucketFor(point) === bucket);
}

function edgeKey(fromPointId: string, toPointId: string): string {
  return `${fromPointId}->${toPointId}`;
}

function addRepresentativeArcs(
  arcs: MapArc[],
  seen: Set<string>,
  fromPoints: readonly MapPoint[],
  toPoints: readonly MapPoint[],
  label: string,
): void {
  for (const from of fromPoints) {
    for (const to of toPoints) {
      if (from.id === to.id) continue;
      const key = edgeKey(from.id, to.id);
      if (seen.has(key)) continue;
      seen.add(key);
      arcs.push({
        id: `${from.id}-${to.id}`,
        fromPointId: from.id,
        toPointId: to.id,
        label,
      });
    }
  }
}

export function mapExtractedArcsToPoints(
  extractedArcs: readonly SupplyChainGraphArc[],
  nodePointIds: ReadonlyMap<string, string>,
): MapArc[] {
  const arcs: MapArc[] = [];
  for (const arc of extractedArcs) {
    const fromPointId = nodePointIds.get(arc.fromKey);
    const toPointId = nodePointIds.get(arc.toKey);
    if (!fromPointId || !toPointId || fromPointId === toPointId) continue;
    arcs.push({
      id: `${fromPointId}-${toPointId}`,
      fromPointId,
      toPointId,
      label: arc.relationshipRationale || arc.label || "Evidence-supported supply-chain relationship",
    });
  }
  return arcs;
}

export function composeSupplyChainArcs(
  points: readonly MapPoint[],
  explicitArcs: readonly MapArc[] = [],
): MapArc[] {
  const byId = new Map(points.map((point) => [point.id, point]));
  const arcs: MapArc[] = [];
  const seen = new Set<string>();

  for (const arc of explicitArcs) {
    if (arc.fromPointId === arc.toPointId) continue;
    if (!byId.has(arc.fromPointId) || !byId.has(arc.toPointId)) continue;
    const key = edgeKey(arc.fromPointId, arc.toPointId);
    if (seen.has(key)) continue;
    seen.add(key);
    arcs.push(arc);
  }

  const rawInputs = pointsInBucket(points, "rawInput");
  const components = pointsInBucket(points, "component");
  const assemblies = pointsInBucket(points, "assembly");
  const transit = pointsInBucket(points, "transit");
  const distribution = pointsInBucket(points, "distribution");
  const markets = pointsInBucket(points, "market").slice(0, 5);

  addRepresentativeArcs(
    arcs,
    seen,
    rawInputs,
    components.length > 0 ? components : assemblies,
    "Representative raw/input flow between cited supply-chain stages",
  );
  addRepresentativeArcs(
    arcs,
    seen,
    components,
    assemblies,
    "Representative component or processing flow between cited supply-chain stages",
  );

  const assemblyDestinations = transit.length > 0 ? transit : distribution.length > 0 ? distribution : markets;
  addRepresentativeArcs(
    arcs,
    seen,
    assemblies,
    assemblyDestinations,
    "Representative post-assembly flow between cited supply-chain stages",
  );

  const transitDestinations = distribution.length > 0 ? distribution : markets;
  addRepresentativeArcs(
    arcs,
    seen,
    transit,
    transitDestinations,
    "Representative transit/import flow between cited supply-chain stages",
  );
  addRepresentativeArcs(
    arcs,
    seen,
    distribution,
    markets,
    "Representative distribution market from cited revenue/store/distribution evidence",
  );

  return arcs;
}

export function graphShapeSummary(
  points: readonly MapPoint[],
  arcs: readonly MapArc[],
  fetchedCount: number,
  sourceCount: number,
): string {
  const counts = new Map<StageBucket, number>();
  for (const point of points) {
    const bucket = bucketFor(point);
    if (!bucket) continue;
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }

  const shape = (Object.keys(BUCKET_LABELS) as StageBucket[])
    .map((bucket) => {
      const count = counts.get(bucket) ?? 0;
      return count > 0 ? `${count} ${BUCKET_LABELS[bucket]}` : null;
    })
    .filter(Boolean)
    .join(", ");

  const density = points.length >= 6 ? `${points.length} evidence-backed nodes` : `Only ${points.length} evidence-backed nodes`;
  const sourceText = `${fetchedCount}/${sourceCount} fetched sources`;
  const arcText = arcs.length === 1 ? "1 arc" : `${arcs.length} arcs`;
  return `${density}, ${arcText}${shape ? `: ${shape}` : ""} from ${sourceText}.`;
}
