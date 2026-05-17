"""End-to-end training driver for the cluster model.

Loads the real panel and fits KMeans on demographic + economic
features. Writes the joblib artifact, a CSV of the panel slice used at
inference time for `similar_countries` lookups, and a JSON summary.
"""

from __future__ import annotations

import json
import os

import joblib

from ..data.real import generate_panel
from ..data.sources import sources_for
from ..models.cluster import train_cluster_model


ARTIFACT_DIR = os.path.join(os.path.dirname(__file__), "..", "artifacts", "cluster")


def main() -> None:
    os.makedirs(ARTIFACT_DIR, exist_ok=True)
    sp = generate_panel()
    model = train_cluster_model(sp.panel)
    joblib.dump(model, os.path.join(ARTIFACT_DIR, "cluster_model.joblib"))

    # Persist the panel slice the model was fit on, so the predict CLI
    # can run `similar_countries` without re-loading + re-filtering the
    # raw CSVs.
    sp.panel.to_csv(os.path.join(ARTIFACT_DIR, "panel.csv"), index=False)

    summary = {
        "model_family": "KMeans (silhouette-selected k)",
        "validation": "silhouette score over k in {3..8}",
        "k": model.k,
        "silhouette": round(model.silhouette, 4),
        "feature_blocks": ["demographic", "economic"],
        "feature_cols": model.feature_cols,
        "centroids": model.cluster_centroids.reset_index().to_dict(orient="records"),
        "n_countries": model.n_countries,
        "sources": {"predictors": sources_for(["wdi"])},
    }
    with open(os.path.join(ARTIFACT_DIR, "summary.json"), "w") as fh:
        json.dump(summary, fh, indent=2)

    print("=== Cluster model trained ===")
    print(f"  k={model.k}  silhouette={model.silhouette:.3f}")
    print(f"  n_countries={model.n_countries}")
    print(f"  feature_cols={model.feature_cols}")
    print(f"Artifacts saved to {ARTIFACT_DIR}")


if __name__ == "__main__":
    main()
