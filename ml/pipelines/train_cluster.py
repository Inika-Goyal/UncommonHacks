"""End-to-end training driver for the cluster model.

Loads the *extended* real panel and fits KMeans on demographic +
economic (+ optional governance / migration / help, when present)
features. Per-block weighting balances the contribution of large
blocks against single-column blocks. Writes joblib + summary + the
panel CSV used at inference for `similar_countries` lookups.
"""

from __future__ import annotations

import json
import os
import sys

import joblib

from ..data.real import (
    DEMOGRAPHIC_COLS,
    ECONOMIC_COLS,
    load_extended_panel,
)
from ..data.sources import sources_for
from ..models.cluster import train_cluster_model


ARTIFACT_DIR = os.path.join(os.path.dirname(__file__), "..", "artifacts", "cluster")


# Sources to cite in the cluster summary for each block we actually used.
_BLOCK_SOURCES = {
    "demographic": ["wdi"],
    "economic": ["wdi"],
    "governance_optional": ["wgi", "cpi", "wjp"],
    "migration_optional": ["unhcr", "acled"],
    "help_optional": ["ilo_offices", "ngoaidmap"],
}


def main() -> None:
    os.makedirs(ARTIFACT_DIR, exist_ok=True)

    panel, optional_blocks = load_extended_panel()
    print(f"Loaded extended panel: {len(panel)} rows", file=sys.stderr)
    for name, cols in optional_blocks.items():
        if cols:
            print(f"  {name}: {cols}", file=sys.stderr)

    blocks = {
        "demographic": DEMOGRAPHIC_COLS,
        "economic": ECONOMIC_COLS,
        **optional_blocks,
    }
    model = train_cluster_model(panel, feature_blocks=blocks)

    joblib.dump(model, os.path.join(ARTIFACT_DIR, "cluster_model.joblib"))
    panel.to_csv(os.path.join(ARTIFACT_DIR, "panel.csv"), index=False)

    # Cite only the blocks that actually contributed columns.
    cited_keys: list[str] = []
    for block_name in model.block_assignments:
        for k in _BLOCK_SOURCES.get(block_name, []):
            if k not in cited_keys:
                cited_keys.append(k)

    summary = {
        "model_family": "KMeans (silhouette-selected k); per-block-weighted features",
        "validation": "silhouette score over k in {3..8}",
        "k": model.k,
        "silhouette": round(model.silhouette, 4),
        "feature_blocks": list(model.block_assignments.keys()),
        "block_assignments": model.block_assignments,
        "block_weights": {k: round(v, 4) for k, v in model.block_weights.items()},
        "feature_cols": model.feature_cols,
        "centroids": model.cluster_centroids.reset_index().to_dict(orient="records"),
        "n_countries": model.n_countries,
        "imputation": model.imputation_report.to_dict() if model.imputation_report else None,
        "sources": {"predictors": sources_for(cited_keys)},
    }
    with open(os.path.join(ARTIFACT_DIR, "summary.json"), "w") as fh:
        json.dump(summary, fh, indent=2)

    print("=== Cluster model trained ===")
    print(f"  k={model.k}  silhouette={model.silhouette:.3f}")
    print(f"  n_countries={model.n_countries}")
    print(f"  blocks used: {list(model.block_assignments.keys())}")
    print(f"  feature_cols ({len(model.feature_cols)}): {model.feature_cols}")
    if model.block_weights:
        print(f"  block weights: {model.block_weights}")
    if model.imputation_report and model.imputation_report.total_imputed() > 0:
        print(
            f"  cells imputed: regional={sum(model.imputation_report.regional_imputed.values())}, "
            f"global={sum(model.imputation_report.global_imputed.values())}"
        )
    print(f"Artifacts saved to {ARTIFACT_DIR}")


if __name__ == "__main__":
    main()
