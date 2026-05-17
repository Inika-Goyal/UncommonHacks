"use client";

import { motion } from "motion/react";
import { Activity, Compass, Layers, ShieldCheck } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import {
  EXPLOIT_CATEGORIES,
  EXPLOIT_CATEGORY_LABELS,
  type ExploitCategory,
  type Finding,
  type MapPoint,
  type Report,
  type SourceStatus,
} from "@/lib/report-types";

export type ModelIntelligencePanelProps = {
  report: Report;
  onFocusGeography?: (target: { latitude: number; longitude: number; pointId?: string }) => void;
};

const CATEGORY_COLORS: Record<ExploitCategory, string> = {
  forced_labor: "#ec4899",
  illegal_profits: "#f59e0b",
  sexual_exploitation: "#a855f7",
  child_labor: "#38bdf8",
};

const RISK_COLORS = ["#22c55e", "#22c55e", "#f59e0b", "#f97316", "#ef4444", "#ef4444"];

function severityColor(score: number) {
  const idx = Math.max(0, Math.min(5, Math.round(score)));
  return RISK_COLORS[idx];
}

function statusTone(status: SourceStatus): "ready" | "pending" | "blocked" {
  if (status === "blocked") return "blocked";
  if (status === "pending") return "pending";
  return "ready";
}

function normalizeGeography(label: string): string {
  return label.replace(/\s+/g, " ").trim();
}

function matchMapPoint(geography: string, mapPoints: MapPoint[]): MapPoint | undefined {
  const haystack = geography.toLowerCase();
  return mapPoints.find((point) => {
    const label = point.label.toLowerCase();
    if (haystack.includes(label) || label.includes(haystack)) return true;
    const [primary] = haystack.split(",").map((part) => part.trim());
    return primary && (label.includes(primary) || primary.includes(label.split(" ")[0] ?? ""));
  });
}

export function ModelIntelligencePanel({ report, onFocusGeography }: ModelIntelligencePanelProps) {
  const [activeFindingId, setActiveFindingId] = useState<string | null>(null);

  const geographyGroups = useMemo(() => {
    const map = new Map<string, { label: string; count: number; maxSeverity: number; findings: Finding[] }>();
    for (const finding of report.findings) {
      const key = normalizeGeography(finding.geography);
      const existing = map.get(key) ?? { label: key, count: 0, maxSeverity: 0, findings: [] };
      existing.count += 1;
      existing.maxSeverity = Math.max(existing.maxSeverity, finding.severity);
      existing.findings.push(finding);
      map.set(key, existing);
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count || b.maxSeverity - a.maxSeverity);
  }, [report.findings]);

  const categoryCounts = useMemo(() => {
    const counts: Record<ExploitCategory, number> = {
      forced_labor: 0,
      illegal_profits: 0,
      sexual_exploitation: 0,
      child_labor: 0,
    };
    for (const finding of report.findings) {
      if (finding.category) counts[finding.category] += 1;
    }
    return counts;
  }, [report.findings]);

  const sourceCoverage = useMemo(() => {
    const counts = new Map<string, number>();
    for (const finding of report.findings) {
      for (const citation of finding.citations) {
        counts.set(citation.source, (counts.get(citation.source) ?? 0) + 1);
      }
    }

    const cited = Array.from(counts.entries()).map(([name, count]) => {
      const check = report.sourceChecks.find(
        (entry) => entry.name === name || entry.name.includes(name) || name.includes(entry.name),
      );
      return { name, count, status: check?.status ?? ("ready" as SourceStatus) };
    });

    const uncited = report.sourceChecks
      .filter((check) => !cited.some((entry) => entry.name === check.name))
      .map((check) => ({ name: check.name, count: 0, status: check.status }));

    return [...cited, ...uncited].sort((a, b) => b.count - a.count);
  }, [report.findings, report.sourceChecks]);

  const totalCategoryHits = (Object.values(categoryCounts) as number[]).reduce((sum, value) => sum + value, 0);
  const maxGeographyCount = geographyGroups[0]?.count ?? 1;
  const maxSourceCount = sourceCoverage[0]?.count ?? 1;

  function handleGeographyClick(geography: string) {
    if (!onFocusGeography) return;
    const point = matchMapPoint(geography, report.mapPoints);
    if (point) {
      onFocusGeography({ latitude: point.latitude, longitude: point.longitude, pointId: point.id });
    }
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.3, ease: "easeOut" }}
      className="lumina-model-intel"
      aria-label="Model intelligence"
    >
      <header className="lumina-model-intel-head">
        <div>
          <p className="lumina-overline">Model intelligence</p>
          <h2>How the synthesizer reasoned</h2>
        </div>
        <p>
          {report.findings.length} finding{report.findings.length === 1 ? "" : "s"} · {geographyGroups.length}{" "}
          geograph{geographyGroups.length === 1 ? "y" : "ies"} · {sourceCoverage.filter((s) => s.count > 0).length} sources cited
        </p>
      </header>

      <div className="lumina-model-intel-grid">
        <article className="liquid-glass lumina-model-card">
          <CardHeading icon={<Activity size={14} />} title="Signal quality matrix" hint="Severity × credibility" />
          <SignalMatrix
            findings={report.findings}
            activeFindingId={activeFindingId}
            onHoverFinding={setActiveFindingId}
          />
          <ActiveFindingHint findings={report.findings} activeFindingId={activeFindingId} />
        </article>

        <article className="liquid-glass lumina-model-card">
          <CardHeading
            icon={<Compass size={14} />}
            title="Geography distribution"
            hint={onFocusGeography ? "Click to focus globe" : "Findings per location"}
          />
          <ul className="lumina-geo-list">
            {geographyGroups.map((group) => {
              const widthPct = Math.max(8, (group.count / maxGeographyCount) * 100);
              const color = severityColor(group.maxSeverity);
              return (
                <li key={group.label}>
                  <button
                    type="button"
                    className="lumina-geo-row"
                    onClick={() => handleGeographyClick(group.label)}
                    disabled={!onFocusGeography}
                  >
                    <span className="lumina-geo-label" title={group.label}>{group.label}</span>
                    <span className="lumina-geo-bar-track" aria-hidden="true">
                      <span
                        className="lumina-geo-bar-fill"
                        style={{ width: `${widthPct}%`, background: color }}
                      />
                    </span>
                    <span className="lumina-geo-count">
                      {group.count}
                      <small>S{group.maxSeverity}</small>
                    </span>
                  </button>
                </li>
              );
            })}
            {geographyGroups.length === 0 ? (
              <li className="lumina-empty">No geography signals.</li>
            ) : null}
          </ul>
        </article>

        <article className="liquid-glass lumina-model-card">
          <CardHeading icon={<Layers size={14} />} title="Exploit pattern" hint="Tagged findings by category" />
          <div className="lumina-exploit-split">
            <ExploitDonut counts={categoryCounts} total={totalCategoryHits} />
            <ul className="lumina-exploit-legend">
              {EXPLOIT_CATEGORIES.map((category) => {
                const count = categoryCounts[category];
                const pct = totalCategoryHits ? Math.round((count / totalCategoryHits) * 100) : 0;
                return (
                  <li key={category}>
                    <span className="lumina-exploit-swatch" style={{ background: CATEGORY_COLORS[category] }} />
                    <span className="lumina-exploit-name">{EXPLOIT_CATEGORY_LABELS[category]}</span>
                    <span className="lumina-exploit-count">
                      {count}
                      <small>{pct}%</small>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="lumina-model-divider" aria-hidden="true" />

          <CardHeading icon={<ShieldCheck size={14} />} title="Source coverage" hint="Citations per source" tight />
          <ul className="lumina-source-coverage">
            {sourceCoverage.map((source) => {
              const tone = statusTone(source.status);
              const widthPct = source.count > 0 ? Math.max(10, (source.count / maxSourceCount) * 100) : 4;
              return (
                <li key={source.name} className={`lumina-source-cov-row lumina-source-${tone}`}>
                  <span className="lumina-source-cov-name" title={source.name}>{source.name}</span>
                  <span className="lumina-source-cov-track" aria-hidden="true">
                    <span className="lumina-source-cov-fill" style={{ width: `${widthPct}%` }} />
                  </span>
                  <span className="lumina-source-cov-count">{source.count}</span>
                </li>
              );
            })}
          </ul>
        </article>
      </div>
    </motion.section>
  );
}

function CardHeading({
  icon,
  title,
  hint,
  tight,
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
  tight?: boolean;
}) {
  return (
    <div className={tight ? "lumina-model-card-head lumina-model-card-head-tight" : "lumina-model-card-head"}>
      <span className="lumina-model-card-icon">{icon}</span>
      <h3>{title}</h3>
      {hint ? <span className="lumina-model-card-hint">{hint}</span> : null}
    </div>
  );
}

function SignalMatrix({
  findings,
  activeFindingId,
  onHoverFinding,
}: {
  findings: Finding[];
  activeFindingId: string | null;
  onHoverFinding: (id: string | null) => void;
}) {
  const cellSize = 30;
  const padding = 26;
  const size = cellSize * 5 + padding * 2;

  const placed = useMemo(() => {
    const buckets = new Map<string, number>();
    return findings.map((finding) => {
      const sev = Math.max(1, Math.min(5, finding.severity));
      const cred = Math.max(1, Math.min(5, finding.credibility));
      const key = `${sev}-${cred}`;
      const occupant = buckets.get(key) ?? 0;
      buckets.set(key, occupant + 1);
      const jitterRadius = 6;
      const angle = occupant * 1.65;
      const offsetX = occupant === 0 ? 0 : Math.cos(angle) * jitterRadius;
      const offsetY = occupant === 0 ? 0 : Math.sin(angle) * jitterRadius;
      const x = padding + (cred - 0.5) * cellSize + offsetX;
      const y = padding + (5 - sev + 0.5) * cellSize + offsetY;
      return { finding, x, y };
    });
  }, [findings]);

  return (
    <div className="lumina-matrix-wrap">
      <svg
        className="lumina-matrix-svg"
        viewBox={`0 0 ${size} ${size}`}
        width="100%"
        role="img"
        aria-label="Severity by credibility matrix"
      >
        <defs>
          <linearGradient id="lumina-matrix-bg" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.04" />
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0.1" />
          </linearGradient>
        </defs>
        <rect
          x={padding}
          y={padding}
          width={cellSize * 5}
          height={cellSize * 5}
          fill="url(#lumina-matrix-bg)"
          rx="6"
        />
        {Array.from({ length: 6 }).map((_, index) => (
          <line
            key={`v-${index}`}
            x1={padding + cellSize * index}
            x2={padding + cellSize * index}
            y1={padding}
            y2={padding + cellSize * 5}
            stroke="rgba(255,255,255,0.06)"
          />
        ))}
        {Array.from({ length: 6 }).map((_, index) => (
          <line
            key={`h-${index}`}
            y1={padding + cellSize * index}
            y2={padding + cellSize * index}
            x1={padding}
            x2={padding + cellSize * 5}
            stroke="rgba(255,255,255,0.06)"
          />
        ))}
        {[1, 2, 3, 4, 5].map((tick) => (
          <text
            key={`x-${tick}`}
            x={padding + (tick - 0.5) * cellSize}
            y={padding + cellSize * 5 + 14}
            textAnchor="middle"
            fontSize="9"
            fill="rgba(255,255,255,0.4)"
          >
            {tick}
          </text>
        ))}
        {[1, 2, 3, 4, 5].map((tick) => (
          <text
            key={`y-${tick}`}
            y={padding + (5 - tick + 0.5) * cellSize + 3}
            x={padding - 10}
            textAnchor="end"
            fontSize="9"
            fill="rgba(255,255,255,0.4)"
          >
            {tick}
          </text>
        ))}
        <text
          x={padding + (cellSize * 5) / 2}
          y={size - 4}
          textAnchor="middle"
          fontSize="9"
          fill="rgba(255,255,255,0.36)"
          letterSpacing="0.18em"
        >
          CREDIBILITY →
        </text>
        <text
          x={10}
          y={padding + (cellSize * 5) / 2}
          textAnchor="middle"
          fontSize="9"
          fill="rgba(255,255,255,0.36)"
          letterSpacing="0.18em"
          transform={`rotate(-90 10 ${padding + (cellSize * 5) / 2})`}
        >
          SEVERITY →
        </text>
        {placed.map(({ finding, x, y }) => {
          const isActive = activeFindingId === finding.id;
          const color = finding.category ? CATEGORY_COLORS[finding.category] : severityColor(finding.severity);
          return (
            <g
              key={finding.id}
              onMouseEnter={() => onHoverFinding(finding.id)}
              onMouseLeave={() => onHoverFinding(null)}
              style={{ cursor: "pointer" }}
            >
              <circle cx={x} cy={y} r={isActive ? 13 : 9} fill={color} opacity={isActive ? 0.18 : 0.12} />
              <circle cx={x} cy={y} r={isActive ? 6.5 : 5} fill={color} stroke="#0a0a0a" strokeWidth="1.2" />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function ActiveFindingHint({
  findings,
  activeFindingId,
}: {
  findings: Finding[];
  activeFindingId: string | null;
}) {
  const active = activeFindingId ? findings.find((f) => f.id === activeFindingId) : null;
  return (
    <div className="lumina-matrix-hint" aria-live="polite">
      {active ? (
        <>
          <strong>{active.signal}</strong>
          <span>
            S{active.severity} · C{active.credibility} · {active.geography}
          </span>
        </>
      ) : (
        <>
          <strong>{findings.length} signals scored</strong>
          <span>Hover a dot to inspect.</span>
        </>
      )}
    </div>
  );
}

function ExploitDonut({
  counts,
  total,
}: {
  counts: Record<ExploitCategory, number>;
  total: number;
}) {
  const radius = 42;
  const inner = 26;
  const center = 56;
  const size = center * 2;

  if (total === 0) {
    return (
      <svg viewBox={`0 0 ${size} ${size}`} className="lumina-exploit-donut" role="img" aria-label="No exploit tags">
        <circle cx={center} cy={center} r={radius} fill="rgba(255,255,255,0.04)" />
        <circle cx={center} cy={center} r={inner} fill="#0a0a0a" />
        <text x={center} y={center} textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.4)">
          NO TAGS
        </text>
      </svg>
    );
  }

  let cumulative = 0;
  const segments = EXPLOIT_CATEGORIES.map((category) => {
    const value = counts[category];
    if (value === 0) return null;
    const startAngle = (cumulative / total) * Math.PI * 2 - Math.PI / 2;
    cumulative += value;
    const endAngle = (cumulative / total) * Math.PI * 2 - Math.PI / 2;
    const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
    const x1 = center + radius * Math.cos(startAngle);
    const y1 = center + radius * Math.sin(startAngle);
    const x2 = center + radius * Math.cos(endAngle);
    const y2 = center + radius * Math.sin(endAngle);
    const xi2 = center + inner * Math.cos(endAngle);
    const yi2 = center + inner * Math.sin(endAngle);
    const xi1 = center + inner * Math.cos(startAngle);
    const yi1 = center + inner * Math.sin(startAngle);
    const path = [
      `M ${x1} ${y1}`,
      `A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`,
      `L ${xi2} ${yi2}`,
      `A ${inner} ${inner} 0 ${largeArc} 0 ${xi1} ${yi1}`,
      "Z",
    ].join(" ");
    return { category, path };
  }).filter((seg): seg is { category: ExploitCategory; path: string } => Boolean(seg));

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="lumina-exploit-donut" role="img" aria-label="Findings by exploit category">
      {segments.map((segment) => (
        <path
          key={segment.category}
          d={segment.path}
          fill={CATEGORY_COLORS[segment.category]}
          opacity="0.92"
        />
      ))}
      <circle cx={center} cy={center} r={inner - 1} fill="#0a0a0a" />
      <text
        x={center}
        y={center - 4}
        textAnchor="middle"
        fontSize="20"
        fontWeight="500"
        fill="#fff"
      >
        {total}
      </text>
      <text
        x={center}
        y={center + 10}
        textAnchor="middle"
        fontSize="8"
        fill="rgba(255,255,255,0.5)"
        letterSpacing="0.18em"
      >
        TAGGED
      </text>
    </svg>
  );
}
