"""End-to-end training driver for the cluster / Naive-Bayes model.

Same pattern as `train_geographic.py`: load synthetic panel, train, save
joblib model + JSON summary. The JSON includes the cluster centroids
and dominant-exploit-per-cluster table that the UI uses to label
"similar countries" overlays.
"""

from __future__ import annotations

import json
import os

import joblib
import pandas as pd

from ..data.synthetic import generate_panel
from ..data.sources import sources_for
from ..models.cluster import train_cluster_model


ARTIFACT_DIR = os.path.join(os.path.dirname(__file__), "..", "artifacts", "cluster")


def main():
    os.makedirs(ARTIFACT_DIR, exist_ok=True)
    sp = generate_panel()

    model, wide = train_cluster_model(sp.panel)
    joblib.dump(model, os.path.join(ARTIFACT_DIR, "cluster_model.joblib"))
    wide.to_csv(os.path.join(ARTIFACT_DIR, "country_year_wide.csv"), index=False)

    summary = {
        "model_family": "KMeans (silhouette-selected k) + Gaussian Naive Bayes",
        "validation": "GroupShuffleSplit by country (25% test) for NB; silhouette for k",
        "k": model.k,
        "silhouette": round(model.silhouette, 4),
        "nb_holdout_accuracy": round(model.nb_holdout_accuracy, 4),
        "feature_blocks": [
            "demographic", "economic", "governance", "migration", "help",
        ],
        "cluster_dominant_exploit": model.cluster_dominant_exploit.to_dict(),
        "centroids": model.cluster_centroids.reset_index().to_dict(orient="records"),
        "sources": {
            "predictors": sources_for([
                "wdi", "undesa", "wgi", "cpi", "wjp", "freedomhouse", "civicus",
                "dtm", "migstock", "wb_bilat", "mmc", "acled", "gdelt",
                "polaris", "ilo_offices", "unhcr", "ecpat",
                "ngoaidmap", "reliefweb", "hdx", "iati",
            ]),
        },
    }
    with open(os.path.join(ARTIFACT_DIR, "summary.json"), "w") as fh:
        json.dump(summary, fh, indent=2)

    print("=== Cluster model trained ===")
    print(f"  k={model.k}  silhouette={model.silhouette:.3f}")
    print(f"  Naive-Bayes holdout accuracy: {model.nb_holdout_accuracy:.3f}")
    print(f"  Cluster -> dominant exploit:")
    for cid, exploit in model.cluster_dominant_exploit.items():
        print(f"     cluster {cid}: {exploit}")
    print(f"Artifacts saved to {ARTIFACT_DIR}")


if __name__ == "__main__":
    main()
