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
from typing import List

import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split

from ..data.real import (
    DEMOGRAPHIC_COLS,
    ECONOMIC_COLS,
    extended_predictor_cols,
    load_extended_panel,
)
from ..models.cluster import train_cluster_model
from ..models.geographic import TARGET_COL, train_geographic
from ._runtime import render_table, section, subsection


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

    # ---- Per-region MAE ------------------------------------------------
    region_rows = []
    region_groups = (
        pd.DataFrame({"region": test_df["region"], "abs_err": np.abs(residual)})
        .groupby("region")
        .agg(n=("abs_err", "size"), mae=("abs_err", "mean"))
        .sort_values("mae", ascending=False)
    )
    for region, row in region_groups.iterrows():
        region_rows.append((region, int(row["n"]), float(row["mae"])))

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

    out.append(subsection("Per-region MAE (test rows)"))
    out.append(render_table(["region", "n", "MAE"], region_rows))

    out.append(subsection("Worst 5 predictions (|residual| descending)"))
    out.append(render_table(
        ["iso3", "country", "observed", "predicted", "residual"],
        worst_rows,
        align=["l", "l", "r", "r", "r"],
    ))
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
    # nearest centroid.
    test_feats = test_df[model.feature_cols].fillna(test_df[model.feature_cols].median())
    Xs = model.scaler.transform(test_feats) * model._column_weights()
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
    args = ap.parse_args()

    panel, blocks = load_extended_panel()
    predictor_cols = extended_predictor_cols(blocks)

    parts: List[str] = []
    parts.append(
        f"Held-out evaluation\n  panel: {len(panel)} rows × {len(predictor_cols)} predictors\n"
        f"  optional blocks loaded: "
        + (", ".join(f"{k}({len(v)})" for k, v in blocks.items() if v) or "none")
    )
    parts.append(_build_geographic_report(panel, predictor_cols, args.test_size, args.seed))
    parts.append(_build_cluster_report(panel, args.test_size, args.seed))
    parts.append("")

    text = "\n".join(parts)
    print(text)
    if args.out:
        Path(args.out).write_text(text, encoding="utf-8")
        print(f"\nwrote {args.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
