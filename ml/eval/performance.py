"""Performance metrics on a held-out test set.

Run from the repo root:

    python -m ml.eval.performance
    python -m ml.eval.performance --test-size 0.25 --seed 42 --out perf.txt

Workflow:

  1. Load the extended panel.
  2. Stratify-by-region 80/20 train/test split (so we don't accidentally
     leave a whole region out of training).
  3. Re-train the geographic model on the training rows with the same
     `train_geographic()` the production pipeline uses — including
     quality scan, imputation, collinearity reduction, log target.
  4. Predict on the held-out test rows.
  5. Report:
       - point-estimate accuracy (MAE, RMSE, R², MAPE, bias)
       - uncertainty-band calibration (empirical coverage vs nominal)
       - per-region MAE breakdown
       - worst-5 named residuals
       - cluster fit on the test rows (avg distance to assigned centroid)

The geographic model has only ~150 rows of real data, so the test set
is small (~30 rows). Numbers will jitter with `--seed`. Use multiple
seeds before drawing conclusions.
"""

from __future__ import annotations

from ._runtime import ensure_venv
ensure_venv("ml.eval.performance")

import argparse
import sys
from pathlib import Path
from typing import List, Optional

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split

from ..data.real import (
    DEMOGRAPHIC_COLS,
    ECONOMIC_COLS,
    KAFALA_STATES_TRAINING_EXCLUDE,
    extended_predictor_cols,
    load_extended_panel,
)
from ..models.cluster import train_cluster_model
from ..models.geographic import TARGET_COL, TrainedGeoModel, train_geographic
from ._runtime import render_table, section, subsection


PROD_GEO_ARTIFACT = (
    Path(__file__).resolve().parents[1] / "artifacts" / "geographic" / "geo_model.joblib"
)


def _prod_feature_cols() -> Optional[List[str]]:
    """Return the feature list of the trained production model, if any.

    The held-out evaluation should describe the *deployed* model. Without
    this, the collinearity reducer can drop different columns on the 80%
    train subset than it did on the full panel, producing a perf report
    on a model the system does not actually serve.
    """
    if not PROD_GEO_ARTIFACT.exists():
        return None
    try:
        m: TrainedGeoModel = joblib.load(PROD_GEO_ARTIFACT)
        return list(m.feature_cols)
    except Exception:
        return None


def _safe_mape(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    """Mean absolute % error, ignoring rows where y_true is near zero
    (would otherwise blow up to infinity for low-prevalence countries)."""
    mask = np.abs(y_true) > 0.5  # /1k threshold — below this the % is noise
    if not mask.any():
        return float("nan")
    return float(np.mean(np.abs((y_true[mask] - y_pred[mask]) / y_true[mask])) * 100.0)


def _coverage(y_true: np.ndarray, lower: np.ndarray, upper: np.ndarray) -> float:
    return float(np.mean((y_true >= lower) & (y_true <= upper)))


def _build_geographic_report(
    panel: pd.DataFrame,
    predictor_cols: List[str],
    test_size: float,
    seed: int,
    pin_production_features: bool = True,
) -> str:
    # Stratify by region so each fold sees the same regional mix. Drop
    # regions with <2 rows since stratified split needs at least 2.
    region_counts = panel["region"].value_counts()
    keep_regions = region_counts[region_counts >= 2].index
    panel = panel[panel["region"].isin(keep_regions)].reset_index(drop=True)

    train_df, test_df = train_test_split(
        panel,
        test_size=test_size,
        random_state=seed,
        stratify=panel["region"],
    )
    train_df = train_df.reset_index(drop=True)
    test_df = test_df.reset_index(drop=True)

    # If a production model exists, use its exact feature list and
    # disable in-trainer collinearity drop so the perf model has the
    # same shape as what's deployed. Otherwise fall back to the full
    # extended set + default in-trainer pruning.
    prod_cols = _prod_feature_cols() if pin_production_features else None
    if prod_cols:
        feature_note = (
            f"pinned to production model's {len(prod_cols)} feature(s); "
            "collinearity drop disabled for this run"
        )
        model = train_geographic(
            train_df, predictor_cols=prod_cols, seed=seed,
            drop_collinear=False,
        )
    else:
        feature_note = (
            f"no production model found; trained from extended set "
            f"({len(predictor_cols)} features) with default collinearity drop"
        )
        model = train_geographic(train_df, predictor_cols=predictor_cols, seed=seed)

    preds = model.predict(test_df[model.feature_cols])
    y_true = test_df[TARGET_COL].values
    y_pred = preds["mean"]
    lower = preds["lower"]
    upper = preds["upper"]
    residual = y_pred - y_true

    # ---- Point-estimate accuracy ---------------------------------------
    acc_rows = [
        ("MAE (/1k)",            float(mean_absolute_error(y_true, y_pred))),
        ("RMSE (/1k)",           float(np.sqrt(mean_squared_error(y_true, y_pred)))),
        ("R²",                   float(r2_score(y_true, y_pred))),
        ("MAPE (%, y>0.5)",      _safe_mape(y_true, y_pred)),
        ("Mean residual (bias)", float(np.mean(residual))),
        ("Median |residual|",    float(np.median(np.abs(residual)))),
        ("Max |residual|",       float(np.max(np.abs(residual)))),
    ]

    # ---- Uncertainty band ----------------------------------------------
    nominal = 0.80  # conformal_alpha=0.20 → 80% nominal coverage
    band_rows = [
        ("Nominal coverage (%)",   nominal * 100),
        ("Empirical coverage (%)", _coverage(y_true, lower, upper) * 100),
        ("Mean band width (/1k)",  float(np.mean(upper - lower))),
        ("Median band width (/1k)", float(np.median(upper - lower))),
    ]

    # ---- Per-region breakdown ------------------------------------------
    # MAE works on any sample size. R² is volatile below ~5 rows so we
    # only report it where it's meaningful; below the threshold we print
    # "n/a" instead of a misleading 1-decimal-place number.
    region_rows = []
    region_df = pd.DataFrame({
        "region": test_df["region"].values,
        "y_true": y_true,
        "y_pred": y_pred,
    })
    for region, sub in region_df.groupby("region"):
        n = len(sub)
        mae = float(np.mean(np.abs(sub["y_pred"] - sub["y_true"])))
        bias = float(np.mean(sub["y_pred"] - sub["y_true"]))
        if n >= 5 and sub["y_true"].nunique() >= 2:
            r2 = float(r2_score(sub["y_true"], sub["y_pred"]))
        else:
            r2 = None
        region_rows.append((region, n, mae, bias, r2))
    region_rows.sort(key=lambda r: -r[2])  # worst MAE first

    # In-scope vs excluded structural outliers. Use the CONCEPTUAL list
    # (the constant in real.py), not `model.excluded_iso3` — the latter
    # only records countries removed from THIS training split, but the
    # perf split may have left them in the test set, which is exactly
    # what we want to report on here.
    excluded = list(KAFALA_STATES_TRAINING_EXCLUDE)
    excluded_test_mask = test_df["country"].isin(excluded) if excluded else None
    excluded_rows: list[tuple] = []
    in_scope_r2 = None
    in_scope_mae = None
    if excluded_test_mask is not None:
        if excluded_test_mask.any():
            ex_y_true = y_true[excluded_test_mask.values]
            ex_y_pred = y_pred[excluded_test_mask.values]
            for i in np.where(excluded_test_mask.values)[0]:
                excluded_rows.append((
                    test_df.iloc[int(i)]["country"],
                    test_df.iloc[int(i)].get("country_name", ""),
                    float(y_true[int(i)]),
                    float(y_pred[int(i)]),
                    float(y_pred[int(i)] - y_true[int(i)]),
                ))
        in_scope_mask = ~excluded_test_mask.values
        if in_scope_mask.sum() >= 5:
            in_scope_y_true = y_true[in_scope_mask]
            in_scope_y_pred = y_pred[in_scope_mask]
            in_scope_r2 = float(r2_score(in_scope_y_true, in_scope_y_pred))
            in_scope_mae = float(np.mean(np.abs(in_scope_y_pred - in_scope_y_true)))

    # ---- Worst-5 named --------------------------------------------------
    worst_idx = np.argsort(-np.abs(residual))[:5]
    worst_rows = []
    for i in worst_idx:
        worst_rows.append((
            test_df.iloc[int(i)]["country"],
            test_df.iloc[int(i)].get("country_name", ""),
            float(y_true[int(i)]),
            float(y_pred[int(i)]),
            float(residual[int(i)]),
        ))

    out: List[str] = []
    out.append(section("Geographic model — held-out test performance"))
    out.append(f"  Train rows: {len(train_df)}    Test rows: {len(test_df)}")
    out.append(f"  Feature alignment: {feature_note}")
    out.append(f"  Predictors used: {len(model.feature_cols)}  ({', '.join(model.feature_cols)})")
    out.append(f"  Target transform: {'log1p' if model.log_target else 'identity'}")
    if model.collinearity_report and model.collinearity_report.dropped:
        out.append(
            f"  Collinearity drops: {', '.join(model.collinearity_report.dropped)}"
        )

    out.append(subsection("Point-estimate accuracy"))
    out.append(render_table(["metric", "value"], acc_rows))

    out.append(subsection("Uncertainty calibration"))
    out.append(render_table(["metric", "value"], band_rows))
    nominal_pct = nominal * 100
    emp = _coverage(y_true, lower, upper) * 100
    if emp < nominal_pct - 8:
        out.append(
            f"  ! empirical coverage ({emp:.0f}%) is materially under "
            f"nominal ({nominal_pct:.0f}%) — uncertainty bands are over-confident; "
            f"see docs/statistical_resolutions.md item #8."
        )

    out.append(subsection("Per-region accuracy (test rows)"))
    out.append(render_table(
        ["region", "n", "MAE", "bias", "R²"], region_rows,
        align=["l", "r", "r", "r", "r"],
    ))
    out.append(
        "  Note: R² in regions with n<5 is not reported (too volatile). "
        "The global R²\n  is a single number that hides this regional "
        "heterogeneity; the table above\n  is the more honest read."
    )

    if excluded:
        out.append(subsection("In-scope vs excluded structural outliers"))
        in_scope_rows = [
            ("In-scope test (excludes kafala states)",
             None if in_scope_mae is None else in_scope_mae,
             None if in_scope_r2 is None else in_scope_r2),
            ("All test rows (includes them)",
             float(mean_absolute_error(y_true, y_pred)),
             float(r2_score(y_true, y_pred))),
        ]
        out.append(render_table(
            ["scope", "MAE", "R²"], in_scope_rows,
            align=["l", "r", "r"],
        ))
        if excluded_rows:
            out.append(subsection(
                "Structural-outlier test rows (model wasn't trained on these)"
            ))
            out.append(render_table(
                ["iso3", "country", "observed", "predicted", "residual"],
                excluded_rows,
                align=["l", "l", "r", "r", "r"],
            ))

    out.append(subsection("Worst 5 predictions (|residual| descending)"))
    out.append(render_table(
        ["iso3", "country", "observed", "predicted", "residual"],
        worst_rows,
        align=["l", "l", "r", "r", "r"],
    ))

    # ---- Auto-generated conclusion -------------------------------------
    overall_mae = float(mean_absolute_error(y_true, y_pred))
    overall_r2 = float(r2_score(y_true, y_pred))
    best_region = min(region_rows, key=lambda r: r[2]) if region_rows else None
    worst_region = max(region_rows, key=lambda r: r[2]) if region_rows else None
    cov = _coverage(y_true, lower, upper) * 100

    conclusion_lines: list[str] = []
    conclusion_lines.append(f"  Overall MAE {overall_mae:.2f}/1k, R² {overall_r2:+.3f} on {len(y_true)} held-out rows.")
    if best_region and worst_region:
        conclusion_lines.append(
            f"  Per-region MAE ranges {best_region[2]:.2f} ({best_region[0]}, n={best_region[1]}) → "
            f"{worst_region[2]:.2f} ({worst_region[0]}, n={worst_region[1]}); "
            "regional heterogeneity is large."
        )
    if in_scope_r2 is not None and abs(in_scope_r2 - overall_r2) >= 0.03:
        conclusion_lines.append(
            f"  Excluding kafala states from the test set lifts R² {overall_r2:+.3f} → "
            f"{in_scope_r2:+.3f} (MAE {overall_mae:.2f} → {in_scope_mae:.2f}). "
            "Their residuals dominate the global R²."
        )
    if cov >= 75:
        conclusion_lines.append(
            f"  Conformal coverage {cov:.0f}% vs 80% nominal — uncertainty bands "
            "honestly calibrated."
        )
    else:
        conclusion_lines.append(
            f"  Conformal coverage {cov:.0f}% under-shoots 80% nominal — treat "
            "the uncertainty bands as approximate."
        )
    conclusion_lines.append(
        "  Read this report by REGION, not by the single global R². See "
        "ml/eval/performance_interpretation.md for the why."
    )
    out.append(subsection("Conclusion"))
    out.append("\n".join(conclusion_lines))

    return "\n".join(out)


def _build_cluster_report(
    panel: pd.DataFrame,
    test_size: float,
    seed: int,
) -> str:
    """Cluster fit on a held-out test slice.

    Cluster training is unsupervised, so "test accuracy" doesn't quite
    apply. Instead we train on the train split and measure how well the
    held-out countries fit their assigned centroid (smaller is better).
    """
    panel = panel.reset_index(drop=True)
    train_df, test_df = train_test_split(panel, test_size=test_size, random_state=seed)
    train_df = train_df.reset_index(drop=True)
    test_df = test_df.reset_index(drop=True)

    blocks = {"demographic": DEMOGRAPHIC_COLS, "economic": ECONOMIC_COLS}
    model = train_cluster_model(train_df, feature_blocks=blocks)

    # Assign held-out countries to clusters and compute distance to the
    # nearest centroid. Use the public `transform` so we share the exact
    # training feature space (impute medians first, since transform does
    # not impute).
    test_feats = test_df[model.feature_cols].fillna(test_df[model.feature_cols].median())
    Xs = model.transform(test_feats)
    centers = model.kmeans.cluster_centers_
    distances = np.linalg.norm(Xs[:, None, :] - centers[None, :, :], axis=2).min(axis=1)

    rows = [
        ("Train rows", len(train_df)),
        ("Test rows", len(test_df)),
        ("k (chosen by silhouette)", model.k),
        ("Train silhouette", float(model.silhouette)),
        ("Test mean distance to centroid", float(np.mean(distances))),
        ("Test median distance to centroid", float(np.median(distances))),
        ("Test max distance to centroid", float(np.max(distances))),
    ]
    out = [section("Cluster model — held-out fit"), render_table(["metric", "value"], rows)]
    return "\n".join(out)


def main() -> None:
    ap = argparse.ArgumentParser(description="Held-out performance report.")
    ap.add_argument("--test-size", type=float, default=0.20,
                    help="Fraction of rows held out (default 0.20).")
    ap.add_argument("--seed", type=int, default=0,
                    help="Random seed for the split + training (default 0).")
    ap.add_argument("--out", type=str, default=None,
                    help="Also write the full report to this .txt file.")
    ap.add_argument("--no-pin-production", action="store_true",
                    help="Don't pin to the production model's feature list; "
                         "let the in-trainer collinearity drop choose on the train split.")
    args = ap.parse_args()

    panel, blocks = load_extended_panel()
    predictor_cols = extended_predictor_cols(blocks)

    parts: List[str] = []
    parts.append(
        f"Held-out evaluation\n  panel: {len(panel)} rows × {len(predictor_cols)} predictors\n"
        f"  optional blocks loaded: "
        + (", ".join(f"{k}({len(v)})" for k, v in blocks.items() if v) or "none")
    )
    parts.append(_build_geographic_report(
        panel, predictor_cols, args.test_size, args.seed,
        pin_production_features=not args.no_pin_production,
    ))
    parts.append(_build_cluster_report(panel, args.test_size, args.seed))
    parts.append("")

    text = "\n".join(parts)
    print(text)
    if args.out:
        Path(args.out).write_text(text, encoding="utf-8")
        print(f"\nwrote {args.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
