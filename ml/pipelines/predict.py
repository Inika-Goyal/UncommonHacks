"""Stdin/stdout predict CLI used by the TypeScript agents.

The TS synthesis layer shells out to this script instead of calling the
LLM for numeric scores. Input is one JSON object on stdin shaped like:

    {
      "country": "C012",         # synthetic ID or ISO code in production
      "year": 2022,              # year of features used as input
      "exploits": ["forced_labor", "children"],  # optional, default: all
      "features": {...}          # optional override; if missing, looked
                                 #   up from the panel artifact
    }

Output to stdout is a single JSON object with per-exploit predicted
prevalence + uncertainty band, the country's cluster + dominant exploit,
top similar countries, and a `sources` block ready to embed in the
report. Errors go to stderr; exit code is non-zero on failure.

Design intent: keep the surface tiny so the JS side doesn't need a
Python HTTP server. A hackathon-grade demo can just `execFile()` this.
"""

from __future__ import annotations

import json
import os
import sys
from typing import Dict, List

import joblib
import numpy as np
import pandas as pd

from ..data.sources import sources_for
from ..data.synthetic import EXPLOIT_TYPES, PREDICTOR_COLS
from ..models.geographic import TrainedGeoModel
from ..models.cluster import TrainedClusterModel


GEO_DIR = os.path.join(os.path.dirname(__file__), "..", "artifacts", "geographic")
CLUSTER_DIR = os.path.join(os.path.dirname(__file__), "..", "artifacts", "cluster")
PANEL_PATH = os.path.join(os.path.dirname(__file__), "..", "artifacts", "synthetic", "panel.csv")


def _load_geo_models() -> Dict[str, TrainedGeoModel]:
    out: Dict[str, TrainedGeoModel] = {}
    for exploit in EXPLOIT_TYPES:
        path = os.path.join(GEO_DIR, f"geo_{exploit}.joblib")
        out[exploit] = joblib.load(path)
    return out


def _load_cluster_model() -> TrainedClusterModel:
    return joblib.load(os.path.join(CLUSTER_DIR, "cluster_model.joblib"))


def _lookup_country_row(country: str, year: int) -> pd.DataFrame:
    """Pull the most-recent panel row for (country, year). One row only —
    cluster needs (country, year) granularity, geographic re-uses same."""
    panel = pd.read_csv(PANEL_PATH)
    row = panel[(panel["country"] == country) & (panel["year"] == year)]
    if row.empty:
        raise ValueError(f"No panel row for country={country} year={year}")
    # Geographic features include lag_observed; supply year-t observed as lag.
    one = row.iloc[[0]].copy()
    one["lag_observed"] = one["observed_prevalence_per_1k"].values
    return one


def predict(payload: dict) -> dict:
    country = payload["country"]
    year = int(payload["year"])
    exploits: List[str] = payload.get("exploits") or list(EXPLOIT_TYPES)

    geo_models = _load_geo_models()
    cluster = _load_cluster_model()

    row = _lookup_country_row(country, year)

    # --- Geographic predictions per exploit type ---
    per_exploit: Dict[str, dict] = {}
    for exploit in exploits:
        model = geo_models[exploit]
        out = model.predict(row[PREDICTOR_COLS + ["lag_observed"]])
        per_exploit[exploit] = {
            "predicted_prevalence_per_1k": float(out["mean"][0]),
            "uncertainty_band_p10_p90": [float(out["lower"][0]), float(out["upper"][0])],
            "spread": float(out["spread"][0]),
            "validation": {
                "cv_mae": round(model.cv_mae, 4),
                "cv_r2": round(model.cv_r2, 4),
                "spearman_vs_gsi": (
                    None if np.isnan(model.spearman_vs_gsi)
                    else round(model.spearman_vs_gsi, 4)
                ),
            },
        }

    # --- Cluster + dominant-exploit classification ---
    feat_cols = cluster.feature_cols
    cluster_id = int(cluster.assign_cluster(row[feat_cols])[0])
    nb_out = cluster.predict_exploit(row[feat_cols])
    classes = list(nb_out["classes"])
    proba_row = nb_out["proba"][0]

    wide = pd.read_csv(os.path.join(CLUSTER_DIR, "country_year_wide.csv"))
    similars = cluster.similar_countries(wide, country, year, top_n=5)
    similar_payload = [
        {"country": r["country"], "distance": round(float(r["distance_to_target"]), 4)}
        for _, r in similars.iterrows()
    ]

    # --- Score derivation (deterministic, no LLM) ---
    # severity 1..5 from the highest predicted prevalence across exploits.
    max_pred = max(v["predicted_prevalence_per_1k"] for v in per_exploit.values())
    severity = int(min(5, max(1, round(1 + max_pred * 4))))   # 0..~1.2 -> 1..5
    # credibility 1..5 from inverse uncertainty (tighter band -> more credible).
    mean_spread = np.mean([v["spread"] for v in per_exploit.values()])
    credibility = int(min(5, max(1, round(5 - mean_spread * 4))))
    # overallRisk 0..100 blends severity with predicted prevalence sum.
    pred_sum = sum(v["predicted_prevalence_per_1k"] for v in per_exploit.values())
    overall = int(min(100, max(0, round(severity * 12 + pred_sum * 15 + credibility * 4))))

    return {
        "country": country,
        "year": year,
        "geographic": per_exploit,
        "cluster": {
            "cluster_id": cluster_id,
            "k": cluster.k,
            "silhouette": round(cluster.silhouette, 4),
            "nb_holdout_accuracy": round(cluster.nb_holdout_accuracy, 4),
            "predicted_dominant_exploit": str(
                classes[int(np.argmax(proba_row))]
            ),
            "class_probabilities": {
                cls: round(float(p), 4) for cls, p in zip(classes, proba_row)
            },
            "similar_countries": similar_payload,
        },
        "scores": {
            "severity": severity,
            "credibility": credibility,
            "overall_risk": overall,
            "rationale": (
                "Severity scaled from highest predicted prevalence across exploit "
                "types; credibility scaled from inverse uncertainty band; "
                "overall risk is a deterministic combination — no LLM in this loop."
            ),
        },
        "sources": {
            "predicted": sources_for(["gsi", "tip", "ilostat", "glotip", "ctdc"]),
            "predictors": sources_for([
                "wdi", "undesa", "wgi", "cpi", "wjp", "freedomhouse", "civicus",
                "dtm", "migstock", "wb_bilat", "mmc", "acled", "gdelt",
                "polaris", "ilo_offices", "unhcr", "ecpat",
                "ngoaidmap", "reliefweb", "hdx", "iati",
            ]),
            "bias_adjuster": sources_for(["rsf"]),
        },
    }


def main():
    try:
        payload = json.load(sys.stdin) if not sys.stdin.isatty() else json.loads(sys.argv[1])
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
