"""End-to-end training driver for the geographic model.

Loads the real panel (GSI 2023 + WDI 2021 + RSF 2021), trains the
single-output prevalence model, and writes the joblib artifact + a
JSON summary the synthesis layer can read.
"""

from __future__ import annotations

import json
import os

import joblib

from ..data.real import generate_panel
from ..data.sources import sources_for
from ..models.geographic import TrainedGeoModel, train_geographic


ARTIFACT_DIR = os.path.join(os.path.dirname(__file__), "..", "artifacts", "geographic")


def _summary_payload(model: TrainedGeoModel) -> dict:
    return {
        "model_family": "tree_ensemble + ridge (averaged)",
        "target": model.target_name,
        "validation": "KFold(5) random split, cross-sectional",
        "uncertainty": "split-conformal prediction (~80% marginal coverage)",
        "cv_mae": round(model.cv_mae, 4),
        "cv_r2": round(model.cv_r2, 4),
        "conformal_half_width": round(model.conformal_half_width, 4),
        "empirical_coverage_80": round(model.empirical_coverage_80, 4),
        "n_features": len(model.feature_cols),
        "n_training_rows": model.n_training_rows,
        "n_bagged_trees": len(model.tree_models),
        "sources": {
            "predicted": sources_for(["gsi"]),
            "predictors": sources_for(["wdi", "rsf"]),
        },
    }


def main() -> None:
    os.makedirs(ARTIFACT_DIR, exist_ok=True)
    sp = generate_panel()
    model = train_geographic(sp.panel)

    joblib.dump(model, os.path.join(ARTIFACT_DIR, "geo_model.joblib"))
    summary = _summary_payload(model)
    with open(os.path.join(ARTIFACT_DIR, "summary.json"), "w") as fh:
        json.dump(summary, fh, indent=2)

    print("=== Geographic model trained ===")
    print(f"  target: {model.target_name}")
    print(f"  rows:   {model.n_training_rows}")
    print(f"  CV MAE: {model.cv_mae:.3f}")
    print(f"  CV R^2: {model.cv_r2:+.3f}")
    print(f"  conformal half-width (80% nominal): {model.conformal_half_width:.3f}")
    print(f"  empirical 80% coverage: {model.empirical_coverage_80:.3f}")
    print(f"Artifacts saved to {ARTIFACT_DIR}")


if __name__ == "__main__":
    main()
