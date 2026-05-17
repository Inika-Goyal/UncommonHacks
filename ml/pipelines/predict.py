"""Stdin/stdout predict CLI used by the TypeScript agents.

Input on stdin (or argv[1]):

    {
      "country": "KHM",          # ISO3, must be present in the trained panel
      "year": 2021,              # optional, currently ignored (panel is cross-sectional)
      "exploits": [...]          # optional, ignored (model is single-output)
    }

Output on stdout: a single JSON object with severity / credibility /
overallRisk, per-exploit predicted prevalence (with the per-exploit
breakdown applied via fixed ILO global proportions, NOT learned),
cluster info, similar countries, and the source catalog.

Errors go to stderr; exit code is non-zero on failure.
"""

from __future__ import annotations

import json
import os
import sys
from typing import List

import joblib
import numpy as np
import pandas as pd

from ..data.real import EXPLOIT_TYPES, ILO_GLOBAL_PROPORTIONS, PREDICTOR_COLS
from ..data.sources import sources_for
from ..models.cluster import TrainedClusterModel
from ..models.geographic import TrainedGeoModel


GEO_DIR = os.path.join(os.path.dirname(__file__), "..", "artifacts", "geographic")
CLUSTER_DIR = os.path.join(os.path.dirname(__file__), "..", "artifacts", "cluster")


def _load_geo_model() -> TrainedGeoModel:
    return joblib.load(os.path.join(GEO_DIR, "geo_model.joblib"))


def _load_cluster_model() -> TrainedClusterModel:
    return joblib.load(os.path.join(CLUSTER_DIR, "cluster_model.joblib"))


def _load_panel() -> pd.DataFrame:
    return pd.read_csv(os.path.join(CLUSTER_DIR, "panel.csv"))


def _lookup_country_row(panel: pd.DataFrame, country: str) -> pd.DataFrame:
    row = panel[panel["country"] == country]
    if row.empty:
        raise ValueError(
            f"Unknown country: {country!r} — must be an ISO3 code present in "
            f"the trained GSI+WDI+RSF panel ({len(panel)} countries available)."
        )
    return row.iloc[[0]].copy()


def predict(payload: dict) -> dict:
    if "country" not in payload:
        raise ValueError("payload missing required 'country' field (ISO3)")

    country = str(payload["country"]).strip().upper()
    warnings: List[str] = []
    year = payload.get("year")
    if year is not None and int(year) != 2021:
        warnings.append(
            f"requested year={year} ignored; panel is cross-sectional at 2021"
        )

    geo_model = _load_geo_model()
    cluster = _load_cluster_model()
    panel = _load_panel()

    row = _lookup_country_row(panel, country)
    geo_pred = geo_model.predict(row[PREDICTOR_COLS])

    overall_mean = float(geo_pred["mean"][0])
    overall_lower = float(geo_pred["lower"][0])
    overall_upper = float(geo_pred["upper"][0])
    overall_spread = float(geo_pred["spread"][0])

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
                "conformal_half_width": round(geo_model.conformal_half_width, 4),
                "empirical_coverage_80": round(geo_model.empirical_coverage_80, 4),
            },
        }
        for exploit, prop in ILO_GLOBAL_PROPORTIONS.items()
    }

    feat_cols = cluster.feature_cols
    cluster_id = int(cluster.assign_cluster(row[feat_cols])[0])
    similars = cluster.similar_countries(panel, country, top_n=5)
    similar_payload = [
        {
            "country": r["country"],
            "country_name": r.get("country_name", r["country"]),
            "distance": round(float(r["distance_to_target"]), 4),
        }
        for _, r in similars.iterrows()
    ]

    # ---- Scores derivation (deterministic, no LLM) ----
    # severity 1..5 from overall predicted prevalence. Real GSI ranges
    # ~0.5..32 per 1k; the scale collapses the long tail with log.
    severity = int(min(5, max(1, round(1 + np.log1p(overall_mean) * 1.1))))
    # credibility 1..5: tighter conformal interval -> higher.
    # half_width is on the same scale as the target; normalise by the
    # observed-target std (≈4) so an interval of ±std ≈ 3, ±0.5*std ≈ 4.
    norm_hw = geo_model.conformal_half_width / 4.0
    credibility = int(min(5, max(1, round(5 - 3.0 * norm_hw))))
    overall_risk = int(
        min(100, max(0, round(severity * 12 + overall_mean * 2.5 + credibility * 4)))
    )

    return {
        "country": country,
        "country_name": str(row.iloc[0].get("country_name", country)),
        "year": 2021,
        "warnings": warnings,
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
        "sources": {
            "predicted": sources_for(["gsi"]),
            "predictors": sources_for(["wdi", "rsf"]),
        },
    }


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
