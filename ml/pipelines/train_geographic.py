"""End-to-end training driver for the geographic model.

Loads (or regenerates) the synthetic panel, trains one model per exploit
type, prints metrics, and saves both the trained models (joblib) and a
JSON summary the synthesis layer can read to attach scores + sources to
report findings.
"""

from __future__ import annotations

import json
import os
from typing import Dict

import joblib
import numpy as np
import pandas as pd

from ..data.synthetic import EXPLOIT_TYPES, generate_panel
from ..data.sources import sources_for
from ..models.geographic import train_all_exploits, TrainedGeoModel


ARTIFACT_DIR = os.path.join(os.path.dirname(__file__), "..", "artifacts", "geographic")


def _gsi_reference(latent_truth: pd.DataFrame) -> Dict[str, pd.Series]:
    """Use the synthetic latent prevalence (most recent year) as a proxy
    for the public GSI ranking we'd compare against in production."""
    latest = latent_truth["year"].max()
    refs: Dict[str, pd.Series] = {}
    for exploit in EXPLOIT_TYPES:
        sub = latent_truth[
            (latent_truth["exploit_type"] == exploit)
            & (latent_truth["year"] == latest)
        ]
        refs[exploit] = sub.set_index("country")["true_prevalence_per_1k"]
    return refs


def _summary_payload(models: Dict[str, TrainedGeoModel]) -> dict:
    """Compact JSON-serialisable summary for the frontend / synthesis layer."""
    return {
        "model_family": "tree_ensemble + ridge (averaged)",
        "validation": "GroupKFold by country, year-t -> year-(t+1)",
        "uncertainty": "10th/90th percentile bands from bag-variance + cross-family disagreement",
        "exploit_types": {
            exploit: {
                "cv_mae": round(m.cv_mae, 4),
                "cv_r2": round(m.cv_r2, 4),
                "spearman_vs_gsi": (
                    None if np.isnan(m.spearman_vs_gsi) else round(m.spearman_vs_gsi, 4)
                ),
                "top10_jaccard_vs_gsi": (
                    None if np.isnan(m.top10_jaccard_vs_gsi)
                    else round(m.top10_jaccard_vs_gsi, 4)
                ),
                "n_features": len(m.feature_cols),
                "n_bagged_trees": len(m.tree_models),
            }
            for exploit, m in models.items()
        },
        "sources": {
            "predicted": sources_for(["gsi", "tip", "ilostat", "glotip", "ctdc"]),
            "predictors": sources_for([
                "wdi", "undesa", "wgi", "cpi", "wjp", "freedomhouse",
                "civicus", "dtm", "migstock", "wb_bilat", "mmc",
                "acled", "gdelt",
                "polaris", "ilo_offices", "unhcr", "ecpat",
                "ngoaidmap", "reliefweb", "hdx", "iati",
            ]),
            "bias_adjuster": sources_for(["rsf"]),
        },
    }


def main():
    os.makedirs(ARTIFACT_DIR, exist_ok=True)

    sp = generate_panel()
    refs = _gsi_reference(sp.latent_truth)

    models = train_all_exploits(sp.panel, gsi_reference_per_exploit=refs)

    # Dump model objects (joblib handles sklearn estimators cleanly).
    for exploit, m in models.items():
        joblib.dump(m, os.path.join(ARTIFACT_DIR, f"geo_{exploit}.joblib"))

    summary = _summary_payload(models)
    with open(os.path.join(ARTIFACT_DIR, "summary.json"), "w") as fh:
        json.dump(summary, fh, indent=2)

    print("=== Geographic model trained ===")
    for exploit, m in models.items():
        print(
            f"  {exploit:>22s}  MAE={m.cv_mae:6.3f}  R2={m.cv_r2:+.3f}"
            f"  Spearman(GSI)={m.spearman_vs_gsi:+.3f}"
            f"  top10_jaccard={m.top10_jaccard_vs_gsi:.2f}"
        )
    print(f"Artifacts saved to {ARTIFACT_DIR}")


if __name__ == "__main__":
    main()
