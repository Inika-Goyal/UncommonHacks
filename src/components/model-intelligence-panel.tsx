"use client";

import { motion } from "motion/react";
import {
  Activity,
  Compass,
  Gauge,
  Info,
  Layers,
  ShieldCheck,
  Sigma,
  TrendingUp,
} from "lucide-react";
import type { ReactNode } from "react";

import {
  EXPLOIT_CATEGORIES,
  EXPLOIT_CATEGORY_LABELS,
  type ExploitCategory,
  type MlPrediction,
  type Report,
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

// Global GSI median is ~2.0 / 1k. We show it on the prevalence dial as
// a reference line so users can read where a prediction sits relative
// to the international baseline.
const GLOBAL_MEDIAN_PER_1K = 2.0;
// Top of the prevalence dial scale. ~32 is the empirical max in GSI 2023
// (Mauritania). Anything above that we clip and label.
const DIAL_MAX = 32;

export function ModelIntelligencePanel({ report }: ModelIntelligencePanelProps) {
  const ml = report.mlPrediction;

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.3, ease: "easeOut" }}
      className="laborlens-model-intel"
      aria-label="Model intelligence"
    >
      <header className="laborlens-model-intel-head">
        <div>
          <p className="laborlens-overline">ML model intelligence</p>
          <h2>What the prevalence model predicts</h2>
        </div>
        {ml ? (
          <p>
            {ml.country_name} ({ml.country}) · trained on GSI 2023 + WDI 2021 + RSF 2021 ·{" "}
            cross-sectional
          </p>
        ) : (
          <p>No ML prediction available for this report.</p>
        )}
      </header>

      {ml ? (
        <>
          <PrevalenceFeature ml={ml} />
          <div className="laborlens-model-intel-grid">
            <ExploitBreakdownCard ml={ml} />
            <SimilarCountriesCard ml={ml} />
            <ModelTransparencyCard ml={ml} />
          </div>
        </>
      ) : (
        <MlEmptyState />
      )}
    </motion.section>
  );
}

// -------------------------------------------------------------------
// Featured: predicted prevalence + conformal interval
// -------------------------------------------------------------------

function PrevalenceFeature({ ml }: { ml: MlPrediction }) {
  const overall = ml.geographic_overall;
  const [lo, hi] = overall.uncertainty_band_p10_p90;
  const mean = overall.predicted_prevalence_per_1k;
  const sample = Object.values(ml.geographic)[0];
  const coverage = sample?.validation.empirical_coverage_80 ?? 0;
  const cvR2 = sample?.validation.cv_r2 ?? 0;
  const halfWidth = sample?.validation.conformal_half_width ?? 0;

  return (
    <article className="liquid-glass laborlens-model-card laborlens-prevalence-feature">
      <div className="laborlens-prevalence-feature-grid">
        <div className="laborlens-prevalence-headline">
          <CardHeading
            icon={<Gauge size={14} />}
            title="Predicted prevalence"
            hint="per 1,000 population"
          />
          <div className="laborlens-prevalence-number">
            <span className="laborlens-prevalence-mean">{mean.toFixed(2)}</span>
            <span className="laborlens-prevalence-unit">/ 1k</span>
          </div>
          <p className="laborlens-prevalence-band-text">
            80% conformal interval{" "}
            <strong>
              {lo.toFixed(2)} – {hi.toFixed(2)}
            </strong>{" "}
            · global median ≈ {GLOBAL_MEDIAN_PER_1K.toFixed(1)} / 1k
          </p>
          <p className="laborlens-prevalence-foot">
            {((coverage || 0) * 100).toFixed(0)}% empirical coverage · CV R²{" "}
            {cvR2.toFixed(2)} · ± {halfWidth.toFixed(2)} half-width
          </p>
        </div>
        <PrevalenceDial mean={mean} lower={lo} upper={hi} />
      </div>
    </article>
  );
}

function PrevalenceDial({
  mean,
  lower,
  upper,
}: {
  mean: number;
  lower: number;
  upper: number;
}) {
  const width = 360;
  const height = 96;
  const padX = 14;
  const trackY = 60;
  const trackHeight = 14;
  const cap = Math.min(Math.max(upper * 1.05, mean * 1.5, DIAL_MAX * 0.4), DIAL_MAX);

  const x = (value: number) => padX + (Math.min(value, cap) / cap) * (width - padX * 2);

  const meanX = x(mean);
  const loX = x(Math.max(lower, 0));
  const hiX = x(upper);
  const medianX = x(GLOBAL_MEDIAN_PER_1K);

  const ticks = [0, cap / 4, cap / 2, (cap * 3) / 4, cap].map((value) => ({
    value,
    x: x(value),
  }));

  return (
    <svg
      className="laborlens-prevalence-dial"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Predicted prevalence with conformal interval"
    >
      <defs>
        <linearGradient id="prevalence-track" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#22c55e" stopOpacity="0.7" />
          <stop offset="50%" stopColor="#f59e0b" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#ef4444" stopOpacity="0.7" />
        </linearGradient>
      </defs>
      <rect
        x={padX}
        y={trackY}
        width={width - padX * 2}
        height={trackHeight}
        rx={trackHeight / 2}
        fill="rgba(255,255,255,0.04)"
      />
      <rect
        x={padX}
        y={trackY}
        width={width - padX * 2}
        height={trackHeight}
        rx={trackHeight / 2}
        fill="url(#prevalence-track)"
        opacity={0.35}
      />
      {/* Conformal band */}
      <rect
        x={loX}
        y={trackY - 4}
        width={Math.max(hiX - loX, 2)}
        height={trackHeight + 8}
        rx={6}
        fill="rgba(236, 72, 153, 0.18)"
        stroke="rgba(236, 72, 153, 0.55)"
        strokeWidth={1}
      />
      {/* Mean tick */}
      <line
        x1={meanX}
        x2={meanX}
        y1={trackY - 10}
        y2={trackY + trackHeight + 10}
        stroke="#ec4899"
        strokeWidth={2}
      />
      <circle cx={meanX} cy={trackY + trackHeight / 2} r={5} fill="#ec4899" stroke="#0a0a0a" strokeWidth={1.5} />
      {/* Global-median reference */}
      <line
        x1={medianX}
        x2={medianX}
        y1={trackY - 6}
        y2={trackY + trackHeight + 6}
        stroke="rgba(255,255,255,0.55)"
        strokeDasharray="3 3"
      />
      <text x={medianX} y={trackY - 10} textAnchor="middle" fontSize={9} fill="rgba(255,255,255,0.5)">
        global median
      </text>
      {/* Axis ticks */}
      {ticks.map((tick) => (
        <g key={tick.value}>
          <line
            x1={tick.x}
            x2={tick.x}
            y1={trackY + trackHeight + 2}
            y2={trackY + trackHeight + 6}
            stroke="rgba(255,255,255,0.25)"
          />
          <text
            x={tick.x}
            y={trackY + trackHeight + 18}
            textAnchor="middle"
            fontSize={9}
            fill="rgba(255,255,255,0.4)"
          >
            {tick.value.toFixed(tick.value < 10 ? 1 : 0)}
          </text>
        </g>
      ))}
      <text x={padX} y={18} fontSize={9} fill="rgba(255,255,255,0.4)" letterSpacing="0.18em">
        PREVALENCE / 1K
      </text>
    </svg>
  );
}

// -------------------------------------------------------------------
// Exploit-type breakdown — ILO global proportions applied to mean
// -------------------------------------------------------------------

function ExploitBreakdownCard({ ml }: { ml: MlPrediction }) {
  const entries = EXPLOIT_CATEGORIES.map((category) => {
    // The Python CLI sometimes returns `child_labor` and sometimes
    // `children` for the children bucket — accept either.
    const key = category === "child_labor" ? "child_labor" : category;
    const value = ml.geographic[key] ?? ml.geographic[category];
    return { category, value };
  }).filter((e): e is { category: ExploitCategory; value: NonNullable<typeof e.value> } => Boolean(e.value));

  const max = entries.reduce(
    (m, e) => Math.max(m, e.value.uncertainty_band_p10_p90[1]),
    0,
  );

  return (
    <article className="liquid-glass laborlens-model-card">
      <CardHeading
        icon={<Layers size={14} />}
        title="Exploit-type breakdown"
        hint="ILO global proportion × overall"
      />
      <ul className="laborlens-exploit-bars">
        {entries.map(({ category, value }) => {
          const meanPct = max > 0 ? (value.predicted_prevalence_per_1k / max) * 100 : 0;
          const loPct = max > 0 ? (value.uncertainty_band_p10_p90[0] / max) * 100 : 0;
          const hiPct = max > 0 ? (value.uncertainty_band_p10_p90[1] / max) * 100 : 0;
          return (
            <li key={category} className="laborlens-exploit-bar-row">
              <div className="laborlens-exploit-bar-head">
                <span className="laborlens-exploit-swatch" style={{ background: CATEGORY_COLORS[category] }} />
                <span className="laborlens-exploit-name">{EXPLOIT_CATEGORY_LABELS[category]}</span>
                <span className="laborlens-exploit-value">
                  {value.predicted_prevalence_per_1k.toFixed(2)}
                  <small>/ 1k</small>
                </span>
              </div>
              <div className="laborlens-exploit-bar-track">
                <span
                  className="laborlens-exploit-bar-band"
                  style={{
                    left: `${loPct}%`,
                    width: `${Math.max(hiPct - loPct, 1)}%`,
                    background: `${CATEGORY_COLORS[category]}33`,
                    borderColor: `${CATEGORY_COLORS[category]}66`,
                  }}
                  title={`80% band ${value.uncertainty_band_p10_p90[0].toFixed(2)} – ${value.uncertainty_band_p10_p90[1].toFixed(2)}`}
                />
                <span
                  className="laborlens-exploit-bar-mean"
                  style={{ left: `${meanPct}%`, background: CATEGORY_COLORS[category] }}
                />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="laborlens-model-disclaimer">
        <Info size={11} aria-hidden /> Split via fixed ILO 2022 global proportions (forced
        labour 55%, illegal profits 28%, sexual exploitation 10%, children 7%). Not per-country
        learned.
      </p>
    </article>
  );
}

// -------------------------------------------------------------------
// Similar countries from the cluster model
// -------------------------------------------------------------------

function SimilarCountriesCard({ ml }: { ml: MlPrediction }) {
  const list = ml.cluster.similar_countries;
  const max = list.reduce((m, c) => Math.max(m, c.distance), 0);

  return (
    <article className="liquid-glass laborlens-model-card">
      <CardHeading
        icon={<Compass size={14} />}
        title="Similar countries"
        hint={`Cluster ${ml.cluster.cluster_id + 1} of ${ml.cluster.k}`}
      />
      <ul className="laborlens-similar-list">
        {list.length === 0 ? (
          <li className="laborlens-empty">No cluster neighbours.</li>
        ) : (
          list.map((country) => {
            const widthPct = max > 0 ? Math.min(100, (country.distance / max) * 100) : 0;
            return (
              <li key={country.country} className="laborlens-similar-row">
                <span className="laborlens-similar-iso">{country.country}</span>
                <span className="laborlens-similar-name" title={country.country_name}>
                  {country.country_name}
                </span>
                <span className="laborlens-similar-bar-track" aria-hidden="true">
                  <span
                    className="laborlens-similar-bar-fill"
                    style={{ width: `${widthPct}%` }}
                  />
                </span>
                <span className="laborlens-similar-distance">{country.distance.toFixed(2)}</span>
              </li>
            );
          })
        )}
      </ul>
      <p className="laborlens-model-disclaimer">
        <Info size={11} aria-hidden /> KMeans over demographic + economic features; distance
        is Euclidean in standardised feature space. Silhouette {ml.cluster.silhouette.toFixed(2)}.
      </p>
    </article>
  );
}

// -------------------------------------------------------------------
// Model transparency: CV metrics + coverage
// -------------------------------------------------------------------

function ModelTransparencyCard({ ml }: { ml: MlPrediction }) {
  const sample = Object.values(ml.geographic)[0];
  const v = sample?.validation;
  const coverage = v?.empirical_coverage_80 ?? 0;
  const nominal = 0.8;
  const coverageDelta = coverage - nominal;

  return (
    <article className="liquid-glass laborlens-model-card">
      <CardHeading
        icon={<ShieldCheck size={14} />}
        title="Model quality"
        hint="Honest validation metrics"
      />
      <ul className="laborlens-metric-list">
        <MetricRow
          icon={<TrendingUp size={12} />}
          label="CV R²"
          value={v ? v.cv_r2.toFixed(3) : "—"}
          hint={v ? interpretR2(v.cv_r2) : ""}
        />
        <MetricRow
          icon={<Sigma size={12} />}
          label="CV MAE"
          value={v ? `${v.cv_mae.toFixed(2)} / 1k` : "—"}
          hint="Average error vs GSI"
        />
        <MetricRow
          icon={<Activity size={12} />}
          label="Conformal width"
          value={v ? `± ${v.conformal_half_width.toFixed(2)}` : "—"}
          hint="80% interval half-width"
        />
        <MetricRow
          icon={<Gauge size={12} />}
          label="Empirical coverage"
          value={`${(coverage * 100).toFixed(0)}%`}
          hint={`Nominal 80% · ${coverageDelta >= 0 ? "+" : ""}${(coverageDelta * 100).toFixed(0)} pts`}
          tone={Math.abs(coverageDelta) > 0.1 ? "warn" : "ok"}
        />
      </ul>
      <p className="laborlens-model-disclaimer">
        <Info size={11} aria-hidden /> Trained on 153 countries (single cross-section). Real-world
        prediction is hard; we publish honest numbers rather than tautological ones.
      </p>
    </article>
  );
}

function MetricRow({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone?: "ok" | "warn";
}) {
  return (
    <li className={`laborlens-metric-row${tone ? ` laborlens-metric-${tone}` : ""}`}>
      <span className="laborlens-metric-icon">{icon}</span>
      <span className="laborlens-metric-label">{label}</span>
      <span className="laborlens-metric-value">{value}</span>
      {hint ? <span className="laborlens-metric-hint">{hint}</span> : null}
    </li>
  );
}

function interpretR2(r2: number): string {
  if (r2 >= 0.5) return "Solid";
  if (r2 >= 0.25) return "Modest";
  if (r2 >= 0.1) return "Weak";
  return "Very weak";
}

// -------------------------------------------------------------------
// Shared bits
// -------------------------------------------------------------------

function CardHeading({
  icon,
  title,
  hint,
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <div className="laborlens-model-card-head">
      <span className="laborlens-model-card-icon">{icon}</span>
      <h3>{title}</h3>
      {hint ? <span className="laborlens-model-card-hint">{hint}</span> : null}
    </div>
  );
}

function MlEmptyState() {
  return (
    <article className="liquid-glass laborlens-model-card laborlens-ml-empty">
      <CardHeading icon={<Info size={14} />} title="ML prediction unavailable" />
      <p>
        The ML model didn&apos;t produce a prediction for this report. This usually means the
        primary country resolved from the query (e.g. an ISO3 code) isn&apos;t in the trained
        GSI+WDI+RSF panel of 153 countries, or the Python CLI was unreachable. Severity,
        credibility, and overall risk above came from the deterministic fallback scorer
        instead.
      </p>
    </article>
  );
}
