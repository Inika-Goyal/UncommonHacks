"""End-to-end training driver for the geographic model.

Loads the *extended* real panel (base GSI+WDI+RSF plus any optional
sources whose CSVs are present under `ml/data/raw/`: WGI, CPI, WJP,
UNHCR, ACLED, ILO offices, NGOAidMap). Runs the data-quality scan,
trains the single-output prevalence model with imputation + collinearity
reduction, and writes joblib + a JSON summary that includes every
data-quality decision the trainer made.
"""

from __future__ import annotations

import json
import os
import sys

import joblib

from ..data.quality import pretty_print
from ..data.real import extended_predictor_cols, load_extended_panel
from ..data.sources import sources_for
from ..models.geographic import TrainedGeoModel, train_geographic


ARTIFACT_DIR = os.path.join(os.path.dirname(__file__), "..", "artifacts", "geographic")


# Maps optional-block columns back to source catalog keys so the
# summary "sources" block reflects what actually fed the model.
_BLOCK_SOURCE_KEYS = {
    "wgi_rule_of_law": "wgi",
    "wgi_government_effectiveness": "wgi",
    "cpi_score": "cpi",
    "wjp_civil_justice": "wjp",
    "refugee_stock_per_1k": "unhcr",
    "internal_displaced_per_1k": "unhcr",
    "unhcr_presence": "unhcr",
    "conflict_events_per_1m": "acled",
    "ngo_aid_projects_per_1m": "ngoaidmap",
    "ilo_office_presence": "ilo_offices",
}


def _predictor_source_keys(predictor_cols: list[str]) -> list[str]:
    keys = ["wdi", "rsf"]
    for col in predictor_cols:
        key = _BLOCK_SOURCE_KEYS.get(col)
        if key and key not in keys:
            keys.append(key)
    return keys


def _summary_payload(model: TrainedGeoModel, blocks: dict[str, list[str]]) -> dict:
    return {
        "model_family": "tree_ensemble + ridge (averaged)",
        "target": model.target_name,
        "target_transform": "log1p" if model.log_target else "identity",
        "validation": "KFold(5) random split, cross-sectional",
        "uncertainty": "split-conformal prediction (~80% marginal coverage)",
        "cv_mae": round(model.cv_mae, 4),
        "cv_r2": round(model.cv_r2, 4),
        "conformal_half_width": round(model.conformal_half_width, 4),
        "empirical_coverage_80": round(model.empirical_coverage_80, 4),
        "n_features": len(model.feature_cols),
        "n_training_rows": model.n_training_rows,
        "n_bagged_trees": len(model.tree_models),
        "feature_cols": model.feature_cols,
        "optional_blocks_loaded": blocks,
        "data_quality": model.quality_report.to_dict() if model.quality_report else None,
        "imputation": model.imputation_report.to_dict() if model.imputation_report else None,
        "collinearity": model.collinearity_report.to_dict() if model.collinearity_report else None,
        "sources": {
            "predicted": sources_for(["gsi"]),
            "predictors": sources_for(_predictor_source_keys(model.feature_cols)),
        },
    }


def main() -> None:
    os.makedirs(ARTIFACT_DIR, exist_ok=True)
    panel, blocks = load_extended_panel()
    predictor_cols = extended_predictor_cols(blocks)

    print(
        f"Loaded extended panel: {len(panel)} rows × {len(predictor_cols)} predictors",
        file=sys.stderr,
    )
    for block_name, cols in blocks.items():
        if cols:
            print(f"  {block_name}: {cols}", file=sys.stderr)

    model = train_geographic(panel, predictor_cols=predictor_cols)
    if model.quality_report is not None:
        print(pretty_print(model.quality_report), file=sys.stderr)

    joblib.dump(model, os.path.join(ARTIFACT_DIR, "geo_model.joblib"))
    summary = _summary_payload(model, blocks)
    with open(os.path.join(ARTIFACT_DIR, "summary.json"), "w") as fh:
        json.dump(summary, fh, indent=2)

    print("=== Geographic model trained ===")
    print(f"  target: {model.target_name} (transform: {'log1p' if model.log_target else 'identity'})")
    print(f"  rows:   {model.n_training_rows}")
    print(f"  features used ({len(model.feature_cols)}): {model.feature_cols}")
    if model.collinearity_report and model.collinearity_report.dropped:
        print(f"  dropped (collinear): {model.collinearity_report.dropped}")
    print(f"  CV MAE: {model.cv_mae:.3f}")
    print(f"  CV R^2: {model.cv_r2:+.3f}")
    print(f"  conformal half-width (80% nominal): {model.conformal_half_width:.3f}")
    print(f"  empirical 80% coverage: {model.empirical_coverage_80:.3f}")
    print(f"Artifacts saved to {ARTIFACT_DIR}")


if __name__ == "__main__":
    main()
