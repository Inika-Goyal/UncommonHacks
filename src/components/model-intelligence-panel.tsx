"use client";

import { motion } from "motion/react";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  Compass,
  Gauge,
  Globe,
  Info,
  Layers,
  Plug,
  ServerCrash,
  ShieldCheck,
  Sigma,
  Sparkles,
  TrendingUp,
  Wrench,
} from "lucide-react";
import type { ReactNode } from "react";

import {
  EXPLOIT_CATEGORIES,
  EXPLOIT_CATEGORY_LABELS,
  type ExploitCategory,
  type MlCountryPayload,
  type MlDriver,
  type MlPrediction,
  type MlPredictionReason,
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

// Global GSI median is ~2.0 / 1k — reference baseline for plain-language comparisons.
const GLOBAL_MEDIAN_PER_1K = 2.0;
// Dial scale cap: ~32 is the empirical max in GSI 2023 (Mauritania).
const DIAL_MAX = 32;

// -------------------------------------------------------------------
// Risk band helpers (plain-language verdicts)
// -------------------------------------------------------------------

type RiskBand = "HIGH" | "MODERATE" | "LOWER";

function riskBandFromSeverity(severity: number): RiskBand {
  if (severity >= 4) return "HIGH";
  if (severity >= 3) return "MODERATE";
  return "LOWER";
}

function riskBandFromOverall(overall: number): RiskBand {
  if (overall >= 75) return "HIGH";
  if (overall >= 50) return "MODERATE";
  return "LOWER";
}

function combinedRiskBand(report: Report): RiskBand {
  const bySev = riskBandFromSeverity(report.severity);
  const byOverall = riskBandFromOverall(report.overallRisk);
  // Prefer the more severe of the two so a UFLPA-floored case never
  // gets understated by a fractional severity rounding.
  const rank = { HIGH: 2, MODERATE: 1, LOWER: 0 };
  return rank[bySev] >= rank[byOverall] ? bySev : byOverall;
}

const BAND_TONE: Record<RiskBand, { label: string; bg: string; color: string }> = {
  HIGH: { label: "HIGH RISK", bg: "rgba(239, 68, 68, 0.18)", color: "#fecaca" },
  MODERATE: { label: "MODERATE RISK", bg: "rgba(245, 158, 11, 0.18)", color: "#fde68a" },
  LOWER: { label: "LOWER RISK", bg: "rgba(34, 197, 94, 0.18)", color: "#bbf7d0" },
};

// -------------------------------------------------------------------
// Plain-language insight (fallback if the LLM didn't supply mlInsight)
// -------------------------------------------------------------------

function approxRate(prev: number): string {
  if (prev < 1) return `under 1 worker in every 1,000`;
  return `about ${prev.toFixed(prev < 5 ? 1 : 0)} workers in every 1,000`;
}

function comparisonToGlobal(prev: number): string {
  const ratio = prev / GLOBAL_MEDIAN_PER_1K;
  if (ratio < 1.2) return "near the global typical (~2 in 1,000)";
  if (ratio < 2) return `roughly ${ratio.toFixed(1)}× the global typical of ~2 in 1,000`;
  return `about ${ratio.toFixed(1)}× the global typical of ~2 in 1,000`;
}

function plainDriverLabel(raw: string): string {
  // Strip parenthetical hints like "(lower = freer)" — these read fine
  // in the technical drawer but are awkward in plain-language prose.
  // Preserve acronyms by lowercasing only the first word.
  const stripped = raw.replace(/\s*\([^)]*\)/g, "").trim();
  // Preserve common acronyms (GDP, ILO, etc.) by checking if a token is
  // all-caps and ≥ 2 chars.
  return stripped
    .split(" ")
    .map((tok) => (tok.length >= 2 && tok === tok.toUpperCase() ? tok : tok.toLowerCase()))
    .join(" ");
}

function worstCountry(ml: MlPrediction) {
  const byCountry = ml.byCountry ?? { [ml.country]: ml };
  return Object.values(byCountry).reduce(
    (best, c) =>
      c.geographic_overall.predicted_prevalence_per_1k >
      best.geographic_overall.predicted_prevalence_per_1k
        ? c
        : best,
    Object.values(byCountry)[0]!,
  );
}

function makeFallbackInsight(ml: MlPrediction): string {
  // Headline the WORST-LINK country, not the highest-weight one.
  // Highest weight is biased toward HQ/registration paperwork; the
  // worst link is where the labor risk concentrates.
  const worst = worstCountry(ml);
  const prev = worst.geographic_overall.predicted_prevalence_per_1k;
  const topDriver = worst.top_drivers?.[0]?.label;
  const driverClause = topDriver
    ? worst.top_drivers![0].direction === "up"
      ? ` Biggest factor pushing the rate up: ${plainDriverLabel(topDriver)}.`
      : ""
    : "";
  return `The model estimates ${approxRate(prev)} face forced-labor conditions in ${worst.country_name}, ${comparisonToGlobal(prev)}.${driverClause}`;
}

// -------------------------------------------------------------------
// Top-level panel
// -------------------------------------------------------------------

export function ModelIntelligencePanel({ report }: ModelIntelligencePanelProps) {
  const ml = report.mlPrediction;
  const reason = report.mlPredictionReason ?? null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.3, ease: "easeOut" }}
      className="lumina-model-intel"
      aria-label="Model intelligence"
    >
      {ml ? (
        <>
          <MlVerdictCard report={report} ml={ml} />
          <SupplyChainPlainSummary ml={ml} />
          <TechnicalDetailsDisclosure report={report} ml={ml} />
        </>
      ) : (
        <>
          <header className="lumina-model-intel-head">
            <div>
              <p className="lumina-overline">Model intelligence</p>
              <h2>Country-risk model</h2>
            </div>
            <p>No country-level estimate is available for this report.</p>
          </header>
          <MlEmptyState reason={reason} />
        </>
      )}
    </motion.section>
  );
}

// -------------------------------------------------------------------
// Tier 1: At-a-glance verdict card
// -------------------------------------------------------------------

function MlVerdictCard({ report, ml }: { report: Report; ml: MlPrediction }) {
  const band = combinedRiskBand(report);
  const insight = report.mlInsight?.trim() || makeFallbackInsight(ml);
  const byCountry = ml.byCountry ?? { [ml.country]: ml };
  const countryCount = Object.keys(byCountry).length;
  const worst = worstCountry(ml);
  const mean = worst.geographic_overall.predicted_prevalence_per_1k;
  const [lo, hi] = worst.geographic_overall.uncertainty_band_p10_p90;

  return (
    <article
      className={`liquid-glass lumina-model-card lumina-verdict-card lumina-verdict-${band.toLowerCase()}`}
    >
      <div className="lumina-verdict-score-block">
        <span className="lumina-verdict-band">{BAND_TONE[band].label}</span>
        <strong className="lumina-verdict-overall">
          {report.overallRisk}
          <small>/100</small>
        </strong>
        <span className="lumina-verdict-sub">
          severity {report.severity}/5 · credibility {report.credibility}/5
        </span>
      </div>
      <div className="lumina-verdict-body">
        <header className="lumina-verdict-context">
          <p className="lumina-overline">Model intelligence</p>
          <h2>
            {countryCount > 1
              ? `Worst link: ${worst.country_name}`
              : worst.country_name}
          </h2>
          <p className="lumina-verdict-meta">
            {countryCount > 1
              ? `${countryCount}-country supply chain · country-keyed model`
              : "Country-keyed model"}
          </p>
        </header>
        <p className="lumina-verdict-insight">{insight}</p>
        <dl className="lumina-verdict-stats">
          <div>
            <dt>Workers at risk</dt>
            <dd>
              <strong>≈{mean.toFixed(1)}</strong>
              <span>/ 1,000 in {worst.country_name}</span>
            </dd>
          </div>
          <div>
            <dt>80% confidence range</dt>
            <dd>
              <strong>
                {lo.toFixed(1)}–{hi.toFixed(1)}
              </strong>
              <span>per 1,000</span>
            </dd>
          </div>
          <div>
            <dt>Global typical</dt>
            <dd>
              <strong>≈2</strong>
              <span>per 1,000</span>
            </dd>
          </div>
        </dl>
        {ml.adjustments?.floorReason === "uflpa_match" ? (
          <p className="lumina-verdict-note">
            <AlertTriangle size={12} aria-hidden /> Severity raised by UFLPA Entity-List exposure.
          </p>
        ) : null}
      </div>
    </article>
  );
}

// -------------------------------------------------------------------
// Tier 2: Per-country plain-language supply chain summary
// -------------------------------------------------------------------

function SupplyChainPlainSummary({ ml }: { ml: MlPrediction }) {
  const byCountry = ml.byCountry ?? { [ml.country]: ml };
  const weights = ml.countryWeights ?? {};
  const countries = Object.values(byCountry).sort(
    (a, b) =>
      b.geographic_overall.predicted_prevalence_per_1k -
      a.geographic_overall.predicted_prevalence_per_1k,
  );
  if (countries.length === 0) return null;

  return (
    <section className="lumina-supply-section">
      <header className="lumina-supply-head">
        <div>
          <p className="lumina-overline">Supply-chain footprint</p>
          <h3>
            {countries.length === 1
              ? "Single-country footprint"
              : `${countries.length} countries · worst link first`}
          </h3>
        </div>
        <span className="lumina-supply-legend">
          <em className="lumina-band-dot lumina-band-high" /> high
          <em className="lumina-band-dot lumina-band-moderate" /> moderate
          <em className="lumina-band-dot lumina-band-lower" /> lower
        </span>
      </header>
      <div className="lumina-supply-grid">
        {countries.map((c) => {
          const w = weights[c.country];
          const pct = typeof w === "number" ? Math.round(w * 100) : null;
          return (
            <CountryTile
              key={c.country}
              country={c}
              weightPct={pct}
              totalCountries={countries.length}
            />
          );
        })}
      </div>
    </section>
  );
}

function CountryTile({
  country,
  weightPct,
  totalCountries,
}: {
  country: MlCountryPayload;
  weightPct: number | null;
  totalCountries: number;
}) {
  const band = riskBandFromSeverity(country.scores.severity);
  const prev = country.geographic_overall.predicted_prevalence_per_1k;
  const driver = country.top_drivers?.[0];

  return (
    <article
      className={`liquid-glass lumina-country-tile lumina-country-${band.toLowerCase()}`}
    >
      <header className="lumina-country-head">
        <div className="lumina-country-id">
          <span className="lumina-country-iso">{country.country}</span>
          <span className="lumina-country-name">{country.country_name}</span>
        </div>
        <span className="lumina-country-band">{BAND_TONE[band].label.replace(" RISK", "")}</span>
      </header>
      <div className="lumina-country-metric">
        <strong>{prev < 5 ? prev.toFixed(1) : prev.toFixed(0)}</strong>
        <span>workers / 1,000</span>
      </div>
      {weightPct != null && totalCountries > 1 ? (
        <div className="lumina-country-weight">
          <span className="lumina-country-weight-label">share of supply chain</span>
          <div className="lumina-country-weight-track" aria-hidden>
            <span
              className="lumina-country-weight-fill"
              style={{ width: `${weightPct}%` }}
            />
          </div>
          <span className="lumina-country-weight-value">{weightPct}%</span>
        </div>
      ) : null}
      {driver ? (
        <p className="lumina-country-driver">
          <span className="lumina-country-driver-label">Biggest factor</span>
          <span>
            {driver.direction === "up" ? "↑" : "↓"} {plainDriverLabel(driver.label)}
          </span>
        </p>
      ) : null}
      {country.imputed ? (
        <p className="lumina-country-note">
          <Info size={11} aria-hidden /> Predictors imputed — wider uncertainty.
        </p>
      ) : null}
    </article>
  );
}

// -------------------------------------------------------------------
// Tier 3: Technical details disclosure
// -------------------------------------------------------------------

function TechnicalDetailsDisclosure({ report, ml }: { report: Report; ml: MlPrediction }) {
  return (
    <details className="lumina-details-disclosure">
      <summary className="lumina-details-summary">
        <ChevronDown size={14} aria-hidden />
        <span>Technical model details</span>
        <span className="lumina-details-hint">
          prevalence range · agent adjustments · drivers · validation
        </span>
      </summary>
      <div className="lumina-details-body">
        <p className="lumina-details-intro">
          The breakdown the prevalence estimate is built from — confidence range, agent-signal
          adjustments to the country baseline, exploitation-type split, model validation,
          predictive drivers, and where the model disagrees with public GSI data.
        </p>
        <PrevalenceFeature ml={ml} />
        {ml.adjustments ? <AdjustmentsCard ml={ml} report={report} /> : null}
        <div className="lumina-model-intel-grid">
          <ExploitBreakdownCard ml={ml} />
          <SimilarCountriesCard ml={ml} />
          <ModelTransparencyCard ml={ml} />
          {ml.top_drivers && ml.top_drivers.length > 0 ? (
            <DriversCard drivers={ml.top_drivers} countryName={ml.country_name} />
          ) : null}
          <GapInsightsCard byCountry={ml.byCountry ?? { [ml.country]: ml }} />
        </div>
      </div>
    </details>
  );
}

// -------------------------------------------------------------------
// Prevalence feature (Tier 3 — kept for power users)
// -------------------------------------------------------------------

function PrevalenceFeature({ ml }: { ml: MlPrediction }) {
  const overall = ml.geographic_overall;
  const [lo, hi] = overall.uncertainty_band_p10_p90;
  const mean = overall.predicted_prevalence_per_1k;
  const sample = Object.values(ml.geographic)[0];
  const coverage = sample?.validation.empirical_coverage_80 ?? 0;
  const cvR2 = sample?.validation.cv_r2 ?? 0;
  const halfWidth = sample?.validation.conformal_half_width ?? 0;
  const observed = ml.observed_prevalence_per_1k ?? null;
  const delta = ml.predicted_vs_observed_delta ?? null;

  return (
    <article className="liquid-glass lumina-model-card lumina-prevalence-feature">
      <p className="lumina-tech-preamble" hidden>
        Estimated worker-exposure rate for {ml.country_name}. The shaded band shows the
        model&apos;s 80%-confidence range.
      </p>
      <div className="lumina-prevalence-feature-grid">
        <div className="lumina-prevalence-headline">
          <CardHeading
            icon={<Gauge size={14} />}
            title="Workers at risk per 1,000"
            hint={ml.country_name}
          />
          <div className="lumina-prevalence-number">
            <span className="lumina-prevalence-mean">{mean.toFixed(2)}</span>
            <span className="lumina-prevalence-unit">/ 1,000</span>
          </div>
          <p className="lumina-prevalence-band-text">
            range (80% confidence) <strong>{lo.toFixed(2)} – {hi.toFixed(2)}</strong> · global
            typical ≈ {GLOBAL_MEDIAN_PER_1K.toFixed(1)}
          </p>
          {observed !== null && delta !== null ? (
            <p className="lumina-prevalence-foot">
              Observed GSI <strong>{observed.toFixed(2)}</strong> · model is{" "}
              <span
                className={delta > 0 ? "lumina-delta-up" : "lumina-delta-down"}
                title={delta > 0 ? "Model estimates higher than observed" : "Model estimates lower than observed"}
              >
                {delta > 0 ? "+" : ""}
                {delta.toFixed(2)}
              </span>
            </p>
          ) : null}
          <p className="lumina-prevalence-foot">
            {((coverage || 0) * 100).toFixed(0)}% empirical coverage · model fit R²{" "}
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

  return (
    <svg
      className="lumina-prevalence-dial"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Predicted prevalence with confidence range"
    >
      <defs>
        <linearGradient id="prevalence-track-tier3" x1="0" y1="0" x2="1" y2="0">
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
        fill="url(#prevalence-track-tier3)"
        opacity={0.35}
      />
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
      <line x1={meanX} x2={meanX} y1={trackY - 10} y2={trackY + trackHeight + 10} stroke="#ec4899" strokeWidth={2} />
      <circle cx={meanX} cy={trackY + trackHeight / 2} r={5} fill="#ec4899" stroke="#0a0a0a" strokeWidth={1.5} />
      <line x1={medianX} x2={medianX} y1={trackY - 6} y2={trackY + trackHeight + 6} stroke="rgba(255,255,255,0.55)" strokeDasharray="3 3" />
      <text x={medianX} y={trackY - 10} textAnchor="middle" fontSize={9} fill="rgba(255,255,255,0.5)">
        global typical
      </text>
      <text x={padX} y={18} fontSize={9} fill="rgba(255,255,255,0.4)" letterSpacing="0.18em">
        WORKERS AT RISK / 1,000
      </text>
    </svg>
  );
}

// -------------------------------------------------------------------
// Adjustments card — Tier 3
// -------------------------------------------------------------------

function AdjustmentsCard({ ml, report }: { ml: MlPrediction; report: Report }) {
  if (!ml.adjustments) return null;
  const adj = ml.adjustments;
  const sevDelta = adj.severityFromAgents;
  const credDelta = adj.credibilityFromAgents;
  if (Math.abs(sevDelta) < 0.05 && Math.abs(credDelta) < 0.05 && !adj.floorReason) return null;

  return (
    <article className="liquid-glass lumina-model-card lumina-adjustments-card">
      <p className="lumina-tech-preamble" hidden>
        How agent findings (watchlist hits, court cases, news) adjusted the country baseline.
      </p>
      <CardHeading
        icon={<Sparkles size={14} />}
        title="Agent-signal adjustments"
        hint="ML baseline + agent boost"
      />
      <div className="lumina-adjustments-grid">
        <AdjustmentRow
          label="Severity"
          baseline={adj.severityFromMl}
          delta={sevDelta}
          finalValue={report.severity}
          suffix="/5"
        />
        <AdjustmentRow
          label="Credibility"
          baseline={adj.credibilityFromMl}
          delta={credDelta}
          finalValue={report.credibility}
          suffix="/5"
        />
      </div>
      <p className="lumina-model-disclaimer">
        <Info size={11} aria-hidden /> {adj.rationale}
      </p>
    </article>
  );
}

function AdjustmentRow({
  label,
  baseline,
  delta,
  finalValue,
  suffix,
}: {
  label: string;
  baseline: number;
  delta: number;
  finalValue: number;
  suffix: string;
}) {
  const positive = delta > 0;
  return (
    <div className="lumina-adjustment-row">
      <span className="lumina-adjustment-label">{label}</span>
      <span className="lumina-adjustment-baseline">
        ML {Math.round(baseline)}
        {suffix}
      </span>
      <span className={`lumina-adjustment-delta ${positive ? "up" : delta < 0 ? "down" : ""}`}>
        {positive ? <ArrowUpRight size={11} /> : delta < 0 ? <ArrowDownRight size={11} /> : null}
        agents {positive ? "+" : ""}
        {delta.toFixed(1)}
      </span>
      <span className="lumina-adjustment-final">
        → <strong>{finalValue}</strong>
        {suffix}
      </span>
    </div>
  );
}

// -------------------------------------------------------------------
// Exploit-type breakdown — Tier 3
// -------------------------------------------------------------------

function ExploitBreakdownCard({ ml }: { ml: MlPrediction }) {
  const entries = EXPLOIT_CATEGORIES.map((category) => {
    const key = category === "child_labor" ? "child_labor" : category;
    const value = ml.geographic[key] ?? ml.geographic[category];
    return { category, value };
  }).filter((e): e is { category: ExploitCategory; value: NonNullable<typeof e.value> } => Boolean(e.value));

  const max = entries.reduce(
    (m, e) => Math.max(m, e.value.uncertainty_band_p10_p90[1]),
    0,
  );

  return (
    <article className="liquid-glass lumina-model-card">
      <p className="lumina-tech-preamble" hidden>
        Estimated split across the four ILO exploitation types. Country prediction × global share.
      </p>
      <CardHeading
        icon={<Layers size={14} />}
        title="By exploitation type"
        hint="based on ILO 2022 global shares"
      />
      <ul className="lumina-exploit-bars">
        {entries.map(({ category, value }) => {
          const meanPct = max > 0 ? (value.predicted_prevalence_per_1k / max) * 100 : 0;
          const loPct = max > 0 ? (value.uncertainty_band_p10_p90[0] / max) * 100 : 0;
          const hiPct = max > 0 ? (value.uncertainty_band_p10_p90[1] / max) * 100 : 0;
          return (
            <li key={category} className="lumina-exploit-bar-row">
              <div className="lumina-exploit-bar-head">
                <span className="lumina-exploit-swatch" style={{ background: CATEGORY_COLORS[category] }} />
                <span className="lumina-exploit-name">{EXPLOIT_CATEGORY_LABELS[category]}</span>
                <span className="lumina-exploit-value">
                  {value.predicted_prevalence_per_1k.toFixed(2)}
                  <small>/ 1,000</small>
                </span>
              </div>
              <div className="lumina-exploit-bar-track">
                <span
                  className="lumina-exploit-bar-band"
                  style={{
                    left: `${loPct}%`,
                    width: `${Math.max(hiPct - loPct, 1)}%`,
                    background: `${CATEGORY_COLORS[category]}33`,
                    borderColor: `${CATEGORY_COLORS[category]}66`,
                  }}
                  title={`80% range ${value.uncertainty_band_p10_p90[0].toFixed(2)} – ${value.uncertainty_band_p10_p90[1].toFixed(2)}`}
                />
                <span
                  className="lumina-exploit-bar-mean"
                  style={{ left: `${meanPct}%`, background: CATEGORY_COLORS[category] }}
                />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="lumina-model-disclaimer">
        <Info size={11} aria-hidden /> Categories split by fixed global shares (forced labour 55%,
        illegal profits 28%, sexual exploitation 10%, children 7%). Not learned per-country.
      </p>
    </article>
  );
}

// -------------------------------------------------------------------
// Similar countries — Tier 3
// -------------------------------------------------------------------

function SimilarCountriesCard({ ml }: { ml: MlPrediction }) {
  const list = ml.cluster.similar_countries;
  const max = list.reduce((m, c) => Math.max(m, c.distance), 0);

  return (
    <article className="liquid-glass lumina-model-card">
      <p className="lumina-tech-preamble" hidden>
        Countries with similar economic and demographic profiles — useful as peer comparisons.
      </p>
      <CardHeading
        icon={<Compass size={14} />}
        title="Similar countries"
        hint={`peers of ${ml.country_name}`}
      />
      <ul className="lumina-similar-list">
        {list.length === 0 ? (
          <li className="lumina-empty">No similar countries available.</li>
        ) : (
          list.map((country) => {
            const widthPct = max > 0 ? Math.min(100, (country.distance / max) * 100) : 0;
            return (
              <li key={country.country} className="lumina-similar-row">
                <span className="lumina-similar-iso">{country.country}</span>
                <span className="lumina-similar-name" title={country.country_name}>
                  {country.country_name}
                </span>
                <span className="lumina-similar-bar-track" aria-hidden="true">
                  <span
                    className="lumina-similar-bar-fill"
                    style={{ width: `${widthPct}%` }}
                  />
                </span>
                <span className="lumina-similar-distance">{country.distance.toFixed(2)}</span>
              </li>
            );
          })
        )}
      </ul>
      <p className="lumina-model-disclaimer">
        <Info size={11} aria-hidden /> Similarity score is the distance in standardised
        economic + demographic feature space. Smaller = more similar.
      </p>
    </article>
  );
}

// -------------------------------------------------------------------
// Model transparency — Tier 3
// -------------------------------------------------------------------

function ModelTransparencyCard({ ml }: { ml: MlPrediction }) {
  const sample = Object.values(ml.geographic)[0];
  const v = sample?.validation;
  const coverage = v?.empirical_coverage_80 ?? 0;
  const nominal = 0.8;
  const coverageDelta = coverage - nominal;

  return (
    <article className="liquid-glass lumina-model-card">
      <p className="lumina-tech-preamble" hidden>
        How well the model fits the data. R² near 1.0 = perfect; near 0 = no better than guessing.
      </p>
      <CardHeading
        icon={<ShieldCheck size={14} />}
        title="Model quality"
        hint="cross-validation metrics"
      />
      <ul className="lumina-metric-list">
        <MetricRow
          icon={<TrendingUp size={12} />}
          label="Model fit (R²)"
          value={v ? v.cv_r2.toFixed(3) : "—"}
          hint={v ? `explains ~${(v.cv_r2 * 100).toFixed(0)}% of variation` : ""}
        />
        <MetricRow
          icon={<Sigma size={12} />}
          label="Average error"
          value={v ? `${v.cv_mae.toFixed(2)} / 1,000` : "—"}
          hint="how far off the model is on average"
        />
        <MetricRow
          icon={<Activity size={12} />}
          label="Confidence width"
          value={v ? `± ${v.conformal_half_width.toFixed(2)}` : "—"}
          hint="how wide the 80% range is"
        />
        <MetricRow
          icon={<Gauge size={12} />}
          label="Range hit rate"
          value={`${(coverage * 100).toFixed(0)}%`}
          hint={`target 80% · ${coverageDelta >= 0 ? "+" : ""}${(coverageDelta * 100).toFixed(0)} pts`}
          tone={Math.abs(coverageDelta) > 0.1 ? "warn" : "ok"}
        />
      </ul>
      <p className="lumina-model-disclaimer">
        <Info size={11} aria-hidden /> Trained on 153 countries (cross-sectional). Honest numbers,
        not tuned to look better than they are.
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
    <li className={`lumina-metric-row${tone ? ` lumina-metric-${tone}` : ""}`}>
      <span className="lumina-metric-icon">{icon}</span>
      <span className="lumina-metric-label">{label}</span>
      <span className="lumina-metric-value">{value}</span>
      {hint ? <span className="lumina-metric-hint">{hint}</span> : null}
    </li>
  );
}

// -------------------------------------------------------------------
// Drivers — Tier 3
// -------------------------------------------------------------------

function DriversCard({ drivers, countryName }: { drivers: MlDriver[]; countryName: string }) {
  const max = drivers.reduce((m, d) => Math.max(m, d.contribution_score), 0);

  return (
    <article className="liquid-glass lumina-model-card">
      <p className="lumina-tech-preamble" hidden>
        The country features that push this estimate up (or down) the most.
      </p>
      <CardHeading
        icon={<Wrench size={14} />}
        title="What drives the estimate"
        hint={`top factors for ${countryName}`}
      />
      <ul className="lumina-driver-list">
        {drivers.map((d) => {
          const pct = max > 0 ? (d.contribution_score / max) * 100 : 0;
          const up = d.direction === "up";
          return (
            <li key={d.feature} className="lumina-driver-row">
              <div className="lumina-driver-head">
                <span className="lumina-driver-label">{d.label}</span>
                <span
                  className={`lumina-driver-dir ${up ? "up" : "down"}`}
                  title={up ? "Pushes the estimate up" : "Pushes the estimate down"}
                >
                  {up ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                  {up ? "raises risk" : "lowers risk"}
                </span>
              </div>
              <div className="lumina-driver-bar-track" aria-hidden="true">
                <span
                  className={`lumina-driver-bar-fill ${up ? "up" : "down"}`}
                  style={{ width: `${Math.max(pct, 4)}%` }}
                />
              </div>
              <div className="lumina-driver-foot">
                <span>
                  vs global avg: {d.z_score >= 0 ? "+" : ""}
                  {d.z_score.toFixed(1)} std dev
                </span>
                <span>factor weight {(d.global_importance * 100).toFixed(0)}%</span>
              </div>
            </li>
          );
        })}
      </ul>
    </article>
  );
}

// -------------------------------------------------------------------
// Predicted-vs-observed gap — Tier 3
// -------------------------------------------------------------------

function GapInsightsCard({ byCountry }: { byCountry: Record<string, MlCountryPayload> }) {
  const entries = Object.values(byCountry);
  const gaps = entries
    .map((c) => ({
      country: c,
      observed: c.observed_prevalence_per_1k ?? null,
      delta: c.predicted_vs_observed_delta ?? null,
      predicted: c.geographic_overall.predicted_prevalence_per_1k,
    }))
    .filter((g) => g.delta !== null && Math.abs(g.delta) > 0.3)
    .sort((a, b) => Math.abs(b.delta!) - Math.abs(a.delta!))
    .slice(0, 5);

  const missingObserved = entries.filter((c) => c.observed_prevalence_per_1k == null);
  const showCard = gaps.length > 0 || missingObserved.length > 0;
  if (!showCard) return null;

  return (
    <article className="liquid-glass lumina-model-card lumina-gap-card">
      <p className="lumina-tech-preamble" hidden>
        Where the model disagrees with the public Global Slavery Index — the &quot;new insight&quot; angle.
      </p>
      <CardHeading
        icon={<Sparkles size={14} />}
        title="Model vs public data"
        hint="estimated vs observed"
      />
      {gaps.length > 0 ? (
        <ul className="lumina-gap-list">
          {gaps.map(({ country, observed, delta, predicted }) => (
            <li key={country.country} className="lumina-gap-row">
              <span className="lumina-gap-iso">{country.country}</span>
              <span className="lumina-gap-name">{country.country_name}</span>
              <span className="lumina-gap-numbers">
                <strong>{predicted.toFixed(2)}</strong>
                <small>vs</small>
                {observed !== null ? observed.toFixed(2) : "—"}
              </span>
              <span
                className={`lumina-gap-delta ${delta! > 0 ? "up" : "down"}`}
                title={
                  delta! > 0
                    ? "Model estimates higher than observed GSI"
                    : "Model estimates lower than observed GSI"
                }
              >
                {delta! > 0 ? "+" : ""}
                {delta!.toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {missingObserved.length > 0 ? (
        <p className="lumina-gap-missing">
          <Info size={11} aria-hidden /> {missingObserved.length} of these countries had no
          observed GSI value — the model fills those gaps with its own estimate.
        </p>
      ) : null}
    </article>
  );
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
    <div className="lumina-model-card-head">
      <span className="lumina-model-card-icon">{icon}</span>
      <h3>{title}</h3>
      {hint ? <span className="lumina-model-card-hint">{hint}</span> : null}
    </div>
  );
}

function MlEmptyState({ reason }: { reason: MlPredictionReason | null }) {
  const variant = describeReason(reason);

  return (
    <article className="liquid-glass lumina-model-card lumina-ml-empty">
      <CardHeading icon={variant.icon} title={variant.title} />
      <p>{variant.message}</p>
      <p className="lumina-model-disclaimer">
        <Info size={11} aria-hidden /> Severity, credibility, and overall risk above came from a
        deterministic fallback scorer instead of the country model.
      </p>
    </article>
  );
}

function describeReason(reason: MlPredictionReason | null): {
  title: string;
  message: string;
  icon: ReactNode;
} {
  switch (reason) {
    case "ML_NO_COUNTRY":
      return {
        title: "No country resolved from this query",
        icon: <Globe size={14} />,
        message:
          "The agent swarm couldn't identify any country tied to this company (no Wikidata entity, no facility records, no labor-news geography). The model is country-keyed, so without at least one country it can't run.",
      };
    case "ML_COUNTRY_NOT_IN_PANEL":
      return {
        title: "Country outside the trained dataset",
        icon: <Globe size={14} />,
        message:
          "The country resolved for this company isn't in the trained 153-country panel. We tried to impute from the nearest peer but the unfilled gap was too large to score honestly.",
      };
    case "ML_ARTIFACTS_MISSING":
      return {
        title: "Model files not on disk",
        icon: <ServerCrash size={14} />,
        message:
          "The trained model files were not found. Run `pnpm ml:train` to regenerate them.",
      };
    case "ML_CLI_UNREACHABLE":
      return {
        title: "Python ML CLI unreachable",
        icon: <Plug size={14} />,
        message:
          "Node couldn't spawn the Python ML CLI. Check that `ml/.venv/bin/python` exists or set `ML_PYTHON_BIN`.",
      };
    case "ML_CLI_ERROR":
      return {
        title: "Python ML CLI returned an error",
        icon: <ServerCrash size={14} />,
        message: "The Python CLI returned a non-zero exit. Check server logs for the trace.",
      };
    default:
      return {
        title: "Model output unavailable",
        icon: <Info size={14} />,
        message:
          "The model didn't produce a country-level estimate for this report. The deterministic fallback scorer was used instead.",
      };
  }
}
