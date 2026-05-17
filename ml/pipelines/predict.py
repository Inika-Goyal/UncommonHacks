"""Stdin/stdout predict CLI used by the TypeScript agents.

Input on stdin (or argv[1]):

    Single-country (back-compat):
      { "country": "KHM", "year": 2021, "exploits": [...] }

    Multi-country (preferred for company supply chains):
      {
        "countries": ["CHN", "VNM", "KHM", ...],
        "weights": { "CHN": 0.5, "VNM": 0.3, "KHM": 0.2 }   # optional, defaults to equal
      }

Output on stdout: a single JSON object containing the primary country
prediction (back-compat) plus, when multiple countries are passed,
`byCountry` (per-country payloads) and `supplyChain` (aggregated
worst-link severity / weighted-average prevalence).

Each per-country payload also carries:
  - top_drivers       — per-feature contributions (interpretable "why")
  - predicted_vs_observed_delta — gap between ML and GSI observed value
                                  (None when observed is missing)

Errors go to stderr; exit code is non-zero on failure.
"""

from __future__ import annotations

import json
import os
import sys
from typing import Any, Dict, List, Optional, Tuple

import joblib
import numpy as np
import pandas as pd

from ..data.real import ILO_GLOBAL_PROPORTIONS, PREDICTOR_COLS
from ..data.sources import sources_for
from ..models.cluster import TrainedClusterModel
from ..models.geographic import TrainedGeoModel


GEO_DIR = os.path.join(os.path.dirname(__file__), "..", "artifacts", "geographic")
CLUSTER_DIR = os.path.join(os.path.dirname(__file__), "..", "artifacts", "cluster")

# Imputation widens the conformal band to honestly inflate uncertainty.
IMPUTED_BAND_WIDENING = 1.5

# Plain-English labels for feature drivers shown in the UI.
DRIVER_LABELS = {
    "gdp_per_capita_log": "GDP per capita (log)",
    "urban_share": "Urbanization",
    "unemployment": "Unemployment",
    "gini": "Income inequality (Gini)",
    "youth_dep_ratio": "Youth dependency ratio",
    "population_log": "Population (log)",
    "press_freedom_score": "Press freedom score (lower = freer)",
    "vulnerability_total": "Walk Free vulnerability index",
    "govt_response_total": "Government response score (higher = stronger)",
}

# Direction hints: which direction increases predicted prevalence.
# Used in the UI to phrase drivers ("low press freedom → higher risk").
# Derived from domain knowledge + the sign of the Ridge coefficients in
# practice; treat as descriptive, not authoritative.
DRIVER_INVERSE = {
    "gdp_per_capita_log": True,   # higher GDP → lower predicted
    "press_freedom_score": False,  # higher RSF score (less free) → higher predicted
    "govt_response_total": True,   # better govt response → lower
    "vulnerability_total": False,  # higher vulnerability → higher
    "unemployment": False,
    "gini": False,
    "urban_share": False,
    "youth_dep_ratio": False,
    "population_log": False,
}


def _load_geo_model() -> TrainedGeoModel:
    return joblib.load(os.path.join(GEO_DIR, "geo_model.joblib"))


def _load_cluster_model() -> TrainedClusterModel:
    return joblib.load(os.path.join(CLUSTER_DIR, "cluster_model.joblib"))


def _load_panel() -> pd.DataFrame:
    return pd.read_csv(os.path.join(CLUSTER_DIR, "panel.csv"))


def _lookup_country_row(panel: pd.DataFrame, country: str) -> Optional[pd.DataFrame]:
    row = panel[panel["country"] == country]
    if row.empty:
        return None
    return row.iloc[[0]].copy()


def _feature_importances(model: TrainedGeoModel) -> Dict[str, float]:
    """Average feature_importances_ across all bagged trees."""
    importances = np.mean(
        [m.feature_importances_ for m in model.tree_models], axis=0
    )
    total = importances.sum()
    if total <= 0:
        return {c: 0.0 for c in model.feature_cols}
    return {c: float(v / total) for c, v in zip(model.feature_cols, importances)}


def _top_drivers(
    model: TrainedGeoModel,
    panel: pd.DataFrame,
    row: pd.DataFrame,
    n: int = 3,
) -> List[Dict[str, Any]]:
    """Per-prediction interpretable feature drivers.

    Scores features by |z_score(country_value) * global_importance|.
    Direction comes from DRIVER_INVERSE for the UI to phrase.
    """
    importances = _feature_importances(model)
    means = panel[model.feature_cols].mean()
    stds = panel[model.feature_cols].std().replace(0, 1.0)

    contributions: List[Tuple[str, float, float, float, float]] = []
    for col in model.feature_cols:
        country_value = float(row[col].iloc[0])
        z = (country_value - float(means[col])) / float(stds[col])
        importance = importances[col]
        score = abs(z * importance)
        contributions.append((col, score, country_value, z, importance))

    contributions.sort(key=lambda t: t[1], reverse=True)

    out: List[Dict[str, Any]] = []
    for col, score, country_value, z, importance in contributions[:n]:
        # Direction toward higher risk: positive z means feature is high;
        # if DRIVER_INVERSE is True the relationship is reversed.
        feature_is_high = z > 0
        inverse = DRIVER_INVERSE.get(col, False)
        increases_risk = (feature_is_high and not inverse) or (
            not feature_is_high and inverse
        )
        out.append(
            {
                "feature": col,
                "label": DRIVER_LABELS.get(col, col),
                "country_value": round(country_value, 3),
                "global_mean": round(float(means[col]), 3),
                "z_score": round(z, 2),
                "global_importance": round(importance, 3),
                "contribution_score": round(score, 4),
                "direction": "up" if increases_risk else "down",
            }
        )
    return out


def _impute_from_cluster(
    panel: pd.DataFrame,
    target_country: str,
    cluster: TrainedClusterModel,
) -> Optional[pd.DataFrame]:
    """Build a synthetic row for an ISO3 missing from the panel by
    averaging the centroid of the closest cluster. Returns None if no
    cluster centroids are available (shouldn't happen post-training).
    """
    centroids = cluster.cluster_centroids
    if centroids.empty:
        return None
    # Pick the cluster centroid with the smallest squared diff from the
    # all-panel mean — without country-specific predictors there's no
    # better hint, so we default to the most central cluster.
    panel_mean = panel[cluster.feature_cols].mean().values
    diffs = np.linalg.norm(centroids[cluster.feature_cols].values - panel_mean, axis=1)
    nearest = int(np.argmin(diffs))
    imputed_row: Dict[str, Any] = {col: float(centroids.iloc[nearest][col]) for col in cluster.feature_cols}
    # Fill the remaining PREDICTOR_COLS from the global panel median —
    # these columns are NOT cluster features (governance/vulnerability)
    # but the geo model needs them.
    for col in PREDICTOR_COLS:
        if col not in imputed_row:
            imputed_row[col] = float(panel[col].median())
    imputed_row["country"] = target_country
    imputed_row["country_name"] = target_country
    imputed_row["observed_prevalence_per_1k"] = float("nan")
    return pd.DataFrame([imputed_row])


def _country_payload(
    country: str,
    row: pd.DataFrame,
    geo_model: TrainedGeoModel,
    cluster: TrainedClusterModel,
    panel: pd.DataFrame,
    imputed: bool,
    warnings: List[str],
) -> Dict[str, Any]:
    geo_pred = geo_model.predict(row[PREDICTOR_COLS])

    overall_mean = float(geo_pred["mean"][0])
    overall_lower = float(geo_pred["lower"][0])
    overall_upper = float(geo_pred["upper"][0])
    overall_spread = float(geo_pred["spread"][0])

    half_width = float(geo_model.conformal_half_width)
    if imputed:
        # Widen the band to honestly reflect imputation uncertainty.
        half_width = half_width * IMPUTED_BAND_WIDENING
        overall_lower = max(0.0, overall_mean - half_width)
        overall_upper = overall_mean + half_width

    per_exploit = {
        exploit: {
            "predicted_prevalence_per_1k": round(overall_mean * prop, 4),
            "uncertainty_band_p10_p90": [
                round(overall_lower * prop, 4),
                round(overall_upper * prop, 4),
            ],
            "spread": round(overall_spread * prop, 4),
            "global_proportion_source": (
                "ILO Global Estimates of Modern Slavery 2022 "
                "(constant per country; not learned)"
            ),
            "validation": {
                "cv_mae": round(geo_model.cv_mae, 4),
                "cv_r2": round(geo_model.cv_r2, 4),
                "conformal_half_width": round(half_width, 4),
                "empirical_coverage_80": round(geo_model.empirical_coverage_80, 4),
            },
        }
        for exploit, prop in ILO_GLOBAL_PROPORTIONS.items()
    }

    cluster_id = int(cluster.assign_cluster(row[cluster.feature_cols])[0])
    similars_df = (
        cluster.similar_countries(panel, country, top_n=5)
        if not imputed
        else panel.iloc[0:0]
    )
    similar_payload = [
        {
            "country": r["country"],
            "country_name": r.get("country_name", r["country"]),
            "distance": round(float(r["distance_to_target"]), 4),
        }
        for _, r in similars_df.iterrows()
    ]

    observed = float(row["observed_prevalence_per_1k"].iloc[0]) if "observed_prevalence_per_1k" in row.columns else float("nan")
    if np.isnan(observed):
        observed_value: Optional[float] = None
        delta: Optional[float] = None
    else:
        observed_value = round(observed, 4)
        delta = round(overall_mean - observed, 4)

    severity = int(min(5, max(1, round(1 + np.log1p(overall_mean) * 1.1))))
    # Log compression of the raw severity formula floors at 1-2 for
    # most countries (e.g. CHN at 4/1k → sev=2). Apply a prevalence-band
    # floor so countries with elevated GSI rates get the severity they
    # deserve even when log smashes the curve.
    #   prev ≤ 3   → sev floor 1
    #   3 < prev ≤ 6  → sev floor 2
    #   6 < prev ≤ 9  → sev floor 3
    #   9 < prev ≤ 12 → sev floor 4
    #   prev > 12  → sev floor 5
    prev_severity_floor = int(min(5, max(1, int(np.ceil(overall_mean / 3.0)))))
    severity = max(severity, prev_severity_floor)
    norm_hw = half_width / 4.0
    credibility = int(min(5, max(1, round(5 - 3.0 * norm_hw))))
    overall_risk = int(
        min(100, max(0, round(severity * 12 + overall_mean * 2.5 + credibility * 4)))
    )

    top_drivers = _top_drivers(geo_model, panel, row)

    return {
        "country": country,
        "country_name": str(row.iloc[0].get("country_name", country)),
        "year": 2021,
        "warnings": warnings,
        "imputed": imputed,
        "geographic": per_exploit,
        "geographic_overall": {
            "predicted_prevalence_per_1k": round(overall_mean, 4),
            "uncertainty_band_p10_p90": [
                round(overall_lower, 4),
                round(overall_upper, 4),
            ],
            "spread": round(overall_spread, 4),
        },
        "cluster": {
            "cluster_id": cluster_id,
            "k": cluster.k,
            "silhouette": round(cluster.silhouette, 4),
            "class_probabilities": {
                exploit: round(prop, 4) for exploit, prop in ILO_GLOBAL_PROPORTIONS.items()
            },
            "class_probabilities_note": (
                "Global ILO proportions of modern-slavery types (2022); "
                "constant per country, not per-country learned."
            ),
            "similar_countries": similar_payload,
        },
        "scores": {
            "severity": severity,
            "credibility": credibility,
            "overall_risk": overall_risk,
            "rationale": (
                "Severity scales with predicted overall GSI prevalence "
                "(log-compressed). Credibility scales inversely with the "
                "split-conformal half-width. Overall risk blends them; "
                "no LLM in this loop."
            ),
        },
        "top_drivers": top_drivers,
        "observed_prevalence_per_1k": observed_value,
        "predicted_vs_observed_delta": delta,
    }


def _country_for(country: str, panel: pd.DataFrame, cluster: TrainedClusterModel) -> Tuple[pd.DataFrame, bool, List[str]]:
    warnings: List[str] = []
    row = _lookup_country_row(panel, country)
    if row is not None:
        return row, False, warnings
    imputed = _impute_from_cluster(panel, country, cluster)
    if imputed is None:
        raise ValueError(
            f"Country {country!r} is not in the trained GSI+WDI+RSF panel "
            "and cluster centroids are unavailable for imputation."
        )
    warnings.append(
        f"predictors for {country} were imputed from the nearest cluster centroid; "
        "uncertainty band widened accordingly"
    )
    return imputed, True, warnings


def _aggregate_supply_chain(
    by_country: Dict[str, Dict[str, Any]],
    weights: Dict[str, float],
) -> Dict[str, Any]:
    """Worst-link severity, weighted-average prevalence, min credibility."""
    if not by_country:
        return {
            "weighted_prevalence_per_1k": 0.0,
            "max_prevalence_per_1k": 0.0,
            "max_country": None,
            "scores": {
                "severity": 1,
                "credibility": 1,
                "overall_risk": 0,
                "rationale": "No countries resolved.",
            },
        }

    total_weight = sum(weights.get(c, 0) for c in by_country) or len(by_country)

    weighted_prev = 0.0
    max_prev = -1.0
    max_country: Optional[str] = None
    max_severity = 1
    min_credibility = 5

    for iso3, payload in by_country.items():
        w = weights.get(iso3, 1.0 / len(by_country)) / total_weight
        prev = payload["geographic_overall"]["predicted_prevalence_per_1k"]
        weighted_prev += w * prev
        if prev > max_prev:
            max_prev = prev
            max_country = iso3
        max_severity = max(max_severity, payload["scores"]["severity"])
        min_credibility = min(min_credibility, payload["scores"]["credibility"])

    weighted_prev = round(weighted_prev, 4)
    max_prev = round(max_prev, 4)
    overall_risk = int(min(100, max(0, round(max_severity * 12 + weighted_prev * 2.5 + min_credibility * 4))))

    rationale = (
        "Supply-chain aggregation: weighted-average predicted prevalence across "
        f"{len(by_country)} countries; severity follows the worst-link country "
        f"({max_country}); credibility takes the minimum (compounding uncertainty)."
    )

    return {
        "weighted_prevalence_per_1k": weighted_prev,
        "max_prevalence_per_1k": max_prev,
        "max_country": max_country,
        "scores": {
            "severity": max_severity,
            "credibility": min_credibility,
            "overall_risk": overall_risk,
            "rationale": rationale,
        },
    }


def predict(payload: dict) -> dict:
    # Accept either {country} or {countries}. Multi-country path is
    # preferred for company supply chains; single-country kept for
    # back-compat with any direct callers.
    if "countries" in payload:
        raw = payload["countries"]
        if not isinstance(raw, list) or not raw:
            raise ValueError("'countries' must be a non-empty list of ISO3 codes")
        countries = [str(c).strip().upper() for c in raw]
    elif "country" in payload:
        countries = [str(payload["country"]).strip().upper()]
    else:
        raise ValueError("payload missing required 'country' or 'countries' field")

    weights_in = payload.get("weights") or {}
    weights: Dict[str, float] = {}
    for c in countries:
        v = weights_in.get(c)
        weights[c] = float(v) if isinstance(v, (int, float)) and v > 0 else 1.0

    year = payload.get("year")
    global_warnings: List[str] = []
    if year is not None and int(year) != 2021:
        global_warnings.append(
            f"requested year={year} ignored; panel is cross-sectional at 2021"
        )

    geo_model = _load_geo_model()
    cluster = _load_cluster_model()
    panel = _load_panel()

    by_country: Dict[str, Dict[str, Any]] = {}
    for c in countries:
        row, imputed, warns = _country_for(c, panel, cluster)
        payload_c = _country_payload(
            c, row, geo_model, cluster, panel, imputed, warns + global_warnings
        )
        by_country[c] = payload_c

    supply_chain = _aggregate_supply_chain(by_country, weights)

    # Primary country = highest weight (or first if all equal).
    primary = max(countries, key=lambda c: weights.get(c, 0)) if countries else countries[0]
    primary_payload = by_country[primary]

    # Top-level fields mirror the primary country for back-compat with
    # the existing dashboard component.
    out = dict(primary_payload)
    out["sources"] = {
        "predicted": sources_for(["gsi"]),
        "predictors": sources_for(["wdi", "rsf"]),
    }
    out["byCountry"] = by_country
    out["supplyChain"] = supply_chain
    out["countryWeights"] = weights

    return out


def main() -> None:
    try:
        payload = (
            json.load(sys.stdin) if not sys.stdin.isatty() else json.loads(sys.argv[1])
        )
    except (json.JSONDecodeError, IndexError) as e:
        print(f"error: bad JSON input: {e}", file=sys.stderr)
        sys.exit(2)

    try:
        result = predict(payload)
    except Exception as e:
        print(f"error: {type(e).__name__}: {e}", file=sys.stderr)
        sys.exit(1)

    json.dump(result, sys.stdout)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
